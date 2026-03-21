// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./LemonAgent.sol";

/// @title LemonNFT
/// @notice Mints ERC-721 "date memory" NFTs for completed Lemon dates.
///         Each NFT is co-owned conceptually by both agents (both addresses stored),
///         but ERC-721 assigns a single owner — the agentA wallet by default.
///         The NFT metadata URI points to an IPFS JSON that includes the AI-generated image.
contract LemonNFT is ERC721, ERC721URIStorage, Ownable {
    // ─── Structs ──────────────────────────────────────────────────────────────

    struct DateMemory {
        uint256 dateId;     // Reference to LemonDate record
        address agentA;
        address agentB;
        uint256 mintedAt;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    LemonAgent public immutable agentRegistry;

    uint256 private _nextTokenId;

    // tokenId => memory metadata
    mapping(uint256 => DateMemory) private _memories;

    // agentWallet => list of tokenIds they co-own
    mapping(address => uint256[]) private _agentTokens;

    // dateId => tokenId (prevent double-minting per date)
    mapping(uint256 => uint256) public dateToToken;
    mapping(uint256 => bool) public dateMinted;

    // ─── Events ───────────────────────────────────────────────────────────────

    event DateMemoryMinted(uint256 indexed tokenId, uint256 indexed dateId, address agentA, address agentB, string tokenURI);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _agentRegistry) ERC721("Lemon Date Memory", "LEMON") Ownable(msg.sender) {
        agentRegistry = LemonAgent(_agentRegistry);
    }

    /// @dev Caller must be the registered operator of agentA or agentB, or the contract owner.
    modifier onlyAgentOperator(address agentA, address agentB) {
        bool isOwner = msg.sender == owner();
        bool isOperatorA = agentRegistry.isOperatorFor(msg.sender, agentA);
        bool isOperatorB = agentRegistry.isOperatorFor(msg.sender, agentB);
        require(isOwner || isOperatorA || isOperatorB, "LemonNFT: not an authorized agent");
        _;
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Mint a date memory NFT. Called by backend after date completion + image generation.
    /// @param agentA    Primary agent wallet — receives the NFT
    /// @param agentB    Secondary agent wallet — recorded as co-owner in metadata
    /// @param dateId    LemonDate record ID
    /// @param metadataURI  IPFS URI to date memory JSON (includes AI image, date info)
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

    /// @notice Get the date memory metadata for a token.
    function getMemory(uint256 tokenId) external view returns (DateMemory memory) {
        return _memories[tokenId];
    }

    /// @notice Get all token IDs associated with an agent (as owner or co-owner).
    function getAgentTokens(address agent) external view returns (uint256[] memory) {
        return _agentTokens[agent];
    }

    /// @notice Total NFTs minted.
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
}
