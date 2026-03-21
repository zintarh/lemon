// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LemonAgent
/// @notice Stores AI dating agent profiles on-chain. Each wallet registers one agent.
///         Compatible with ERC-8004 identity registry — agentURI points to IPFS metadata.
contract LemonAgent is Ownable, ReentrancyGuard {
    // ─── Enums ────────────────────────────────────────────────────────────────

    enum BillingMode { SPLIT, SOLO }
    // SPLIT  = 50/50, both agents pay
    // SOLO   = this agent covers the full bill

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct AgentProfile {
        address wallet;
        string name;
        string avatarURI;        // IPFS image URI
        string agentURI;         // ERC-8004 compatible IPFS metadata URI
        string personality;      // Free-form personality description
        string preferences;      // What they are looking for
        string[] dealBreakers;   // Hard stops (stored as string array)
        BillingMode billingMode;
        uint256 erc8004AgentId;  // Token ID from ERC-8004 Identity Registry (0 = not registered)
        uint256 registeredAt;
        bool active;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(address => AgentProfile) private _profiles;
    mapping(address => bool) public isRegistered;
    address[] private _allAgents;

    /// @notice Maps each user wallet → the server-side agent wallet that acts on its behalf.
    ///         Set once at registration by the Lemon backend (onlyOwner).
    mapping(address => address) public agentOperatorKey;
    /// @notice Reverse lookup: agent server wallet → user wallet
    mapping(address => address) public operatorToUser;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AgentRegistered(address indexed wallet, string name, BillingMode billingMode);
    event AgentUpdated(address indexed wallet);
    event AgentDeactivated(address indexed wallet);
    event ERC8004IdLinked(address indexed wallet, uint256 agentId);
    event AgentOperatorSet(address indexed userWallet, address indexed operatorWallet);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Register a new agent profile. One per wallet.
    function registerAgent(
        string calldata name,
        string calldata avatarURI,
        string calldata agentURI,
        string calldata personality,
        string calldata preferences,
        string[] calldata dealBreakers,
        BillingMode billingMode
    ) external nonReentrant {
        require(!isRegistered[msg.sender], "LemonAgent: already registered");
        require(bytes(name).length > 0, "LemonAgent: name required");

        _profiles[msg.sender] = AgentProfile({
            wallet: msg.sender,
            name: name,
            avatarURI: avatarURI,
            agentURI: agentURI,
            personality: personality,
            preferences: preferences,
            dealBreakers: dealBreakers,
            billingMode: billingMode,
            erc8004AgentId: 0,
            registeredAt: block.timestamp,
            active: true
        });

        isRegistered[msg.sender] = true;
        _allAgents.push(msg.sender);

        emit AgentRegistered(msg.sender, name, billingMode);
    }

    /// @notice Update mutable profile fields.
    function updateProfile(
        string calldata avatarURI,
        string calldata agentURI,
        string calldata personality,
        string calldata preferences,
        string[] calldata dealBreakers,
        BillingMode billingMode
    ) external {
        require(isRegistered[msg.sender], "LemonAgent: not registered");
        AgentProfile storage p = _profiles[msg.sender];
        p.avatarURI = avatarURI;
        p.agentURI = agentURI;
        p.personality = personality;
        p.preferences = preferences;
        p.dealBreakers = dealBreakers;
        p.billingMode = billingMode;
        emit AgentUpdated(msg.sender);
    }

    /// @notice Register the server-side agent wallet that can act on behalf of a user agent.
    ///         Called once by the backend immediately after registerAgent confirms.
    function setOperatorKey(address userWallet, address operatorWallet) external onlyOwner {
        require(isRegistered[userWallet], "LemonAgent: user not registered");
        require(operatorWallet != address(0), "LemonAgent: zero operator");
        agentOperatorKey[userWallet] = operatorWallet;
        operatorToUser[operatorWallet] = userWallet;
        emit AgentOperatorSet(userWallet, operatorWallet);
    }

    /// @notice Returns true if `operator` is the registered server wallet for `userWallet`.
    function isOperatorFor(address operator, address userWallet) external view returns (bool) {
        return agentOperatorKey[userWallet] == operator;
    }

    /// @notice Called by backend after ERC-8004 registration to link the on-chain agent ID.
    function linkERC8004Id(address wallet, uint256 agentId) external onlyOwner {
        require(isRegistered[wallet], "LemonAgent: not registered");
        _profiles[wallet].erc8004AgentId = agentId;
        emit ERC8004IdLinked(wallet, agentId);
    }

    /// @notice Soft-deactivate an agent.
    function deactivate() external {
        require(isRegistered[msg.sender], "LemonAgent: not registered");
        _profiles[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    function getProfile(address wallet) external view returns (AgentProfile memory) {
        return _profiles[wallet];
    }

    function getAllAgents() external view returns (address[] memory) {
        return _allAgents;
    }

    function totalAgents() external view returns (uint256) {
        return _allAgents.length;
    }
}
