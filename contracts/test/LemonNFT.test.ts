import { expect } from "chai";
import { ethers } from "hardhat";
import { LemonNFT } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LemonNFT", function () {
  let lemonNFT: LemonNFT;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const METADATA_URI = "ipfs://QmDateMemoryMetadata";

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("LemonNFT");
    lemonNFT = (await Factory.deploy()) as LemonNFT;
  });

  describe("mintDateMemory", () => {
    it("mints an NFT to agentA", async () => {
      await lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 0, METADATA_URI);
      expect(await lemonNFT.ownerOf(0)).to.equal(alice.address);
    });

    it("sets the token URI", async () => {
      await lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 0, METADATA_URI);
      expect(await lemonNFT.tokenURI(0)).to.equal(METADATA_URI);
    });

    it("stores date memory metadata", async () => {
      await lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 42, METADATA_URI);
      const mem = await lemonNFT.getMemory(0);
      expect(mem.dateId).to.equal(42);
      expect(mem.agentA).to.equal(alice.address);
      expect(mem.agentB).to.equal(bob.address);
    });

    it("tracks tokens for both agents", async () => {
      await lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 0, METADATA_URI);
      expect(await lemonNFT.getAgentTokens(alice.address)).to.include(0n);
      expect(await lemonNFT.getAgentTokens(bob.address)).to.include(0n);
    });

    it("maps dateId to tokenId", async () => {
      await lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 99, METADATA_URI);
      expect(await lemonNFT.dateToToken(99)).to.equal(0);
      expect(await lemonNFT.dateMinted(99)).to.be.true;
    });

    it("emits DateMemoryMinted event", async () => {
      await expect(
        lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 0, METADATA_URI)
      )
        .to.emit(lemonNFT, "DateMemoryMinted")
        .withArgs(0, 0, alice.address, bob.address, METADATA_URI);
    });

    it("reverts on double-minting for the same date", async () => {
      await lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 0, METADATA_URI);
      await expect(
        lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 0, METADATA_URI)
      ).to.be.revertedWith("LemonNFT: already minted for this date");
    });

    it("reverts for zero address", async () => {
      await expect(
        lemonNFT.connect(owner).mintDateMemory(ethers.ZeroAddress, bob.address, 0, METADATA_URI)
      ).to.be.revertedWith("LemonNFT: invalid agent address");
    });

    it("reverts for non-owner caller", async () => {
      await expect(
        lemonNFT.connect(alice).mintDateMemory(alice.address, bob.address, 0, METADATA_URI)
      ).to.be.reverted;
    });
  });

  describe("totalMinted", () => {
    it("returns the total number of NFTs minted", async () => {
      expect(await lemonNFT.totalMinted()).to.equal(0);
      await lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 0, METADATA_URI);
      await lemonNFT.connect(owner).mintDateMemory(alice.address, bob.address, 1, METADATA_URI);
      expect(await lemonNFT.totalMinted()).to.equal(2);
    });
  });

  describe("supportsInterface", () => {
    it("supports ERC-721 interface", async () => {
      expect(await lemonNFT.supportsInterface("0x80ac58cd")).to.be.true;
    });
  });
});
