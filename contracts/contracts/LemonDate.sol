// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LemonAgent.sol";

/// @title LemonDate
/// @notice Books dates between two agents and handles on-chain payment settlement.
///         Agent server wallets call bookDate; the contract pulls stablecoins directly
///         from the users' wallets via pre-approved ERC-20 allowances.
contract LemonDate is Ownable, ReentrancyGuard {
    // ─── Enums ────────────────────────────────────────────────────────────────

    enum DateTemplate { COFFEE, BEACH, WORK, ROOFTOP_DINNER, GALLERY_WALK }
    enum DateStatus   { PENDING, ACTIVE, COMPLETED, CANCELLED }
    enum PayerMode    { AGENT_A, AGENT_B, SPLIT }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct DateRecord {
        uint256 id;
        address agentA;
        address agentB;
        DateTemplate template;
        DateStatus status;
        PayerMode payerMode;
        uint256 costUSD;        // in cents (e.g. 500 = $5.00)
        address paymentToken;   // cUSD / USDC address
        address payerA;         // agentA's human user wallet (approved this contract to spend)
        address payerB;         // agentB's human user wallet
        uint256 nftTokenId;     // minted after completion (0 = not yet minted)
        uint256 scheduledAt;
        uint256 completedAt;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    LemonAgent public immutable agentContract;

    uint256 private _nextDateId;
    mapping(uint256 => DateRecord) private _dates;

    // per-agent tracking
    mapping(address => uint256[]) private _agentDates;
    mapping(address => uint256) public totalDatesCompleted;
    mapping(address => uint256) public totalSpentCents; // leaderboard: total spend

    // next-bill assignment for dual-SOLO agents
    mapping(bytes32 => address) private _nextPayer; // key = keccak256(addrA, addrB)

    // Date costs in USD cents per template (scaled by AI token usage)
    uint256[5] public templateCosts = [100, 400, 200, 500, 300];
    // COFFEE=$1, BEACH=$4, WORK=$2, ROOFTOP_DINNER=$5, GALLERY_WALK=$3

    // ─── Events ───────────────────────────────────────────────────────────────

    event DateBooked(uint256 indexed dateId, address agentA, address agentB, DateTemplate template, PayerMode payerMode);
    event DateCompleted(uint256 indexed dateId, uint256 nftTokenId);
    event DateCancelled(uint256 indexed dateId);
    event PaymentReceived(uint256 indexed dateId, address payerA, address payerB, uint256 tokenAmount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _agentContract) Ownable(msg.sender) {
        agentContract = LemonAgent(_agentContract);
    }

    /// @dev Caller must be owner OR a registered operator of agentA or agentB.
    modifier onlyAgentOperator(address agentA, address agentB) {
        bool isOwner = msg.sender == owner();
        bool isOperatorA = agentContract.isOperatorFor(msg.sender, agentA);
        bool isOperatorB = agentContract.isOperatorFor(msg.sender, agentB);
        require(isOwner || isOperatorA || isOperatorB, "LemonDate: not an authorized agent");
        _;
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Agent server wallet calls this after agents agree on a date.
    ///         Pulls stablecoin payment directly from the human user wallets via
    ///         pre-approved ERC-20 allowances (users approve this contract at registration).
    ///         cost is in USD cents; token amounts use 18 decimals (1 cent = 10^16 wei for $1-pegged tokens).
    function bookDate(
        address agentA,
        address agentB,
        DateTemplate template,
        PayerMode payerMode,
        address paymentToken,
        address payerA,
        address payerB
    ) external onlyAgentOperator(agentA, agentB) nonReentrant returns (uint256 dateId) {
        require(agentA != agentB, "LemonDate: same agent");
        require(agentContract.isRegistered(agentA), "LemonDate: agentA not registered");
        require(agentContract.isRegistered(agentB), "LemonDate: agentB not registered");
        require(uint256(payerMode) <= 2, "LemonDate: invalid payerMode");
        require(payerA != address(0) && payerB != address(0), "LemonDate: zero payer");

        uint256 cost = templateCosts[uint256(template)];
        // Convert cents to token units: cents * 10^16 (since 1 USD = 10^18 units for 18-decimal $1-pegged token)
        uint256 tokenAmount = cost * 1e16;
        dateId = _nextDateId++;

        // Pull payment from user wallets — they must have approved this contract
        if (paymentToken != address(0) && tokenAmount > 0) {
            IERC20 token = IERC20(paymentToken);
            if (payerMode == PayerMode.SPLIT) {
                uint256 half = tokenAmount / 2;
                uint256 otherHalf = tokenAmount - half;
                token.transferFrom(payerA, address(this), half);
                token.transferFrom(payerB, address(this), otherHalf);
            } else if (payerMode == PayerMode.AGENT_A) {
                token.transferFrom(payerA, address(this), tokenAmount);
            } else {
                token.transferFrom(payerB, address(this), tokenAmount);
            }
        }

        _dates[dateId] = DateRecord({
            id: dateId,
            agentA: agentA,
            agentB: agentB,
            template: template,
            status: DateStatus.ACTIVE,
            payerMode: payerMode,
            costUSD: cost,
            paymentToken: paymentToken,
            payerA: payerA,
            payerB: payerB,
            nftTokenId: 0,
            scheduledAt: block.timestamp,
            completedAt: 0
        });

        _agentDates[agentA].push(dateId);
        _agentDates[agentB].push(dateId);

        // track spend for leaderboard
        if (payerMode == PayerMode.SPLIT) {
            totalSpentCents[agentA] += cost / 2;
            totalSpentCents[agentB] += cost - cost / 2;
        } else if (payerMode == PayerMode.AGENT_A) {
            totalSpentCents[agentA] += cost;
        } else {
            totalSpentCents[agentB] += cost;
        }

        emit DateBooked(dateId, agentA, agentB, template, payerMode);
        emit PaymentReceived(dateId, payerA, payerB, tokenAmount);
    }

    /// @notice Owner can withdraw accumulated token fees.
    function withdrawTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    /// @notice Mark a date as completed and record the NFT token ID.
    function completeDate(uint256 dateId, uint256 nftTokenId) external {
        DateRecord storage d = _dates[dateId];
        bool isOwner = msg.sender == owner();
        bool isOperatorA = agentContract.isOperatorFor(msg.sender, d.agentA);
        bool isOperatorB = agentContract.isOperatorFor(msg.sender, d.agentB);
        require(isOwner || isOperatorA || isOperatorB, "LemonDate: not an authorized agent");
        require(d.status == DateStatus.ACTIVE, "LemonDate: not active");
        d.status = DateStatus.COMPLETED;
        d.nftTokenId = nftTokenId;
        d.completedAt = block.timestamp;
        totalDatesCompleted[d.agentA]++;
        totalDatesCompleted[d.agentB]++;
        emit DateCompleted(dateId, nftTokenId);
    }

    function cancelDate(uint256 dateId) external onlyOwner {
        _dates[dateId].status = DateStatus.CANCELLED;
        emit DateCancelled(dateId);
    }

    // ─── Payer Resolution ─────────────────────────────────────────────────────

    /// @notice Resolves who pays when both agents are SOLO billing.
    ///         Alternates each time using a stored mapping.
    function resolveNextPayer(address a, address b) external onlyOwner returns (address payer) {
        bytes32 key = _pairKey(a, b);
        address current = _nextPayer[key];
        if (current == address(0)) {
            // first time: random-ish selection based on block hash
            payer = (uint256(blockhash(block.number - 1)) % 2 == 0) ? a : b;
        } else {
            payer = current;
        }
        // next time assign to the other
        _nextPayer[key] = (payer == a) ? b : a;
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    function getDate(uint256 dateId) external view returns (DateRecord memory) {
        return _dates[dateId];
    }

    function getAgentDates(address agent) external view returns (uint256[] memory) {
        return _agentDates[agent];
    }

    function totalDates() external view returns (uint256) {
        return _nextDateId;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _pairKey(address a, address b) internal pure returns (bytes32) {
        return a < b
            ? keccak256(abi.encodePacked(a, b))
            : keccak256(abi.encodePacked(b, a));
    }
}
