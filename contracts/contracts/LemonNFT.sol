// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./LemonAgent.sol";

/// @title LemonNFT
/// @notice Mints ERC-721 "date memory" NFTs for completed Lemon dates.
///         Users call claimMemory() directly with a mint fee — no server-side signing required.
///         The server pre-approves a dateId via approveMint() once the date image is ready.
contract LemonNFT is ERC721, ERC721URIStorage, Ownable {
    // ─── Structs ──────────────────────────────────────────────────────────────

    struct DateMemory {
        uint256 dateId;
        address agentA;
        address agentB;
        uint256 mintedAt;
    }

    struct MintApproval {
        bool approved;
        string metadataURI;
        address agentA;
        address agentB;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    LemonAgent public immutable agentRegistry;

    uint256 private _nextTokenId;

    /// @notice Fee in CELO (wei) required to mint a memory NFT.
    uint256 public mintFee;

    /// @notice Address that receives mint fees.
    address public treasury;

    // tokenId => memory metadata
    mapping(uint256 => DateMemory) private _memories;

    // agentWallet => list of tokenIds they co-own
    mapping(address => uint256[]) private _agentTokens;

    // dateId => tokenId (prevent double-minting per date)
    mapping(uint256 => uint256) public dateToToken;
    mapping(uint256 => bool) public dateMinted;

    // dateId => mint approval (set by server after image generation)
    mapping(uint256 => MintApproval) public mintApprovals;

    // ─── Events ───────────────────────────────────────────────────────────────

    event DateMemoryMinted(uint256 indexed tokenId, uint256 indexed dateId, address agentA, address agentB, string tokenURI);
    event MintApproved(uint256 indexed dateId, address agentA, address agentB);
    event MintFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _agentRegistry  LemonAgent contract address
    /// @param _treasury       Address to receive mint fees (can be updated by owner)
    /// @param _mintFee        Initial mint fee in CELO wei (e.g. 0.5 CELO = 5e17)
    constructor(
        address _agentRegistry,
        address _treasury,
        uint256 _mintFee
    ) ERC721("Lemon Date Memory", "LEMON") Ownable(msg.sender) {
        agentRegistry = LemonAgent(_agentRegistry);
        treasury = _treasury;
        mintFee = _mintFee;
    }

    // ─── Owner config ─────────────────────────────────────────────────────────

    function setMintFee(uint256 _fee) external onlyOwner {
        emit MintFeeUpdated(mintFee, _fee);
        mintFee = _fee;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "LemonNFT: zero address");
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    /// @notice Safety valve — withdraw any CELO accumulated in the contract.
    function withdraw() external onlyOwner {
        (bool ok, ) = owner().call{value: address(this).balance}("");
        require(ok, "LemonNFT: withdraw failed");
    }

    // ─── Server-side approval ─────────────────────────────────────────────────

    /// @notice Called by the server (owner) once the date image is uploaded to IPFS.
    ///         Marks the dateId as ready to mint and stores the metadata URI.
    function approveMint(
        uint256 dateId,
        string calldata metadataURI,
        address agentA,
        address agentB
    ) external onlyOwner {
        require(!dateMinted[dateId], "LemonNFT: already minted");
        require(agentA != address(0) && agentB != address(0), "LemonNFT: invalid agent address");
        mintApprovals[dateId] = MintApproval({
            approved: true,
            metadataURI: metadataURI,
            agentA: agentA,
            agentB: agentB
        });
        emit MintApproved(dateId, agentA, agentB);
    }

    // ─── User-triggered mint ──────────────────────────────────────────────────

    /// @notice Mint your date memory NFT. Must be called by agentA or agentB with mintFee CELO.
    ///         Server must have called approveMint() for this dateId first.
    function claimMemory(uint256 dateId) external payable returns (uint256 tokenId) {
        MintApproval storage approval = mintApprovals[dateId];
        require(approval.approved, "LemonNFT: mint not approved for this date");
        require(!dateMinted[dateId], "LemonNFT: already minted for this date");
        require(msg.value >= mintFee, "LemonNFT: insufficient mint fee");
        require(
            msg.sender == approval.agentA || msg.sender == approval.agentB,
            "LemonNFT: only date participants can mint"
        );

        tokenId = _nextTokenId++;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, approval.metadataURI);

        _memories[tokenId] = DateMemory({
            dateId: dateId,
            agentA: approval.agentA,
            agentB: approval.agentB,
            mintedAt: block.timestamp
        });

        _agentTokens[approval.agentA].push(tokenId);
        _agentTokens[approval.agentB].push(tokenId);

        dateToToken[dateId] = tokenId;
        dateMinted[dateId] = true;

        // Send fee to treasury
        if (mintFee > 0 && treasury != address(0)) {
            (bool sent, ) = treasury.call{value: mintFee}("");
            require(sent, "LemonNFT: fee transfer failed");
        }

        // Refund any overpayment
        uint256 excess = msg.value - mintFee;
        if (excess > 0) {
            (bool refunded, ) = msg.sender.call{value: excess}("");
            require(refunded, "LemonNFT: refund failed");
        }

        emit DateMemoryMinted(tokenId, dateId, approval.agentA, approval.agentB, approval.metadataURI);
    }

    // ─── Owner-only direct mint (backward compat / admin) ─────────────────────

    /// @dev Caller must be the registered operator of agentA or agentB, or the contract owner.
    modifier onlyAgentOperator(address agentA, address agentB) {
        bool isOwner = msg.sender == owner();
        bool isOperatorA = agentRegistry.isOperatorFor(msg.sender, agentA);
        bool isOperatorB = agentRegistry.isOperatorFor(msg.sender, agentB);
        require(isOwner || isOperatorA || isOperatorB, "LemonNFT: not an authorized agent");
        _;
    }

    /// @notice Direct mint by server operator — used for admin/recovery only.
    function mintDateMemory(
        address agentA,
        address agentB,
        uint256 dateId,
        string calldata metadataURI
    ) external onlyAgentOperator(agentA, agentB) returns (uint256 tokenId) {
        require(!dateMinted[dateId], "LemonNFT: already minted for this date");
        require(agentA != address(0) && agentB != address(0), "LemonNFT: invalid agent address");

        tokenId = _nextTokenId++;

        _safeMint(agentA, tokenId);
        _setTokenURI(tokenId, metadataURI);

        _memories[tokenId] = DateMemory({
            dateId: dateId,
            agentA: agentA,
            agentB: agentB,
            mintedAt: block.timestamp
        });

        _agentTokens[agentA].push(tokenId);
        _agentTokens[agentB].push(tokenId);

        dateToToken[dateId] = tokenId;
        dateMinted[dateId] = true;

        emit DateMemoryMinted(tokenId, dateId, agentA, agentB, metadataURI);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    function getMemory(uint256 tokenId) external view returns (DateMemory memory) {
        return _memories[tokenId];
    }

    function getAgentTokens(address agent) external view returns (uint256[] memory) {
        return _agentTokens[agent];
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    // ─── Overrides ────────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    receive() external payable {}
}
