import { expect } from "chai";
import { ethers } from "hardhat";
import { LemonAgent } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LemonAgent", function () {
  let lemonAgent: LemonAgent;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const SPLIT = 0;
  const SOLO = 1;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("LemonAgent");
    lemonAgent = (await Factory.deploy()) as LemonAgent;
  });

  describe("registerAgent", () => {
    it("registers a new agent with correct profile fields", async () => {
      await lemonAgent.connect(alice).registerAgent(
        "Alice",
        "ipfs://avatar",
        "ipfs://metadata",
        "curious, adventurous",
        "someone kind and ambitious",
        ["smoking", "no ambition"],
        SPLIT
      );

      expect(await lemonAgent.isRegistered(alice.address)).to.be.true;

      const profile = await lemonAgent.getProfile(alice.address);
      expect(profile.name).to.equal("Alice");
      expect(profile.billingMode).to.equal(SPLIT);
      expect(profile.active).to.be.true;
      expect(profile.dealBreakers).to.deep.equal(["smoking", "no ambition"]);
    });

    it("reverts if wallet already registered", async () => {
      await lemonAgent.connect(alice).registerAgent("Alice", "", "", "", "", [], SPLIT);
      await expect(
        lemonAgent.connect(alice).registerAgent("Alice2", "", "", "", "", [], SPLIT)
      ).to.be.revertedWith("LemonAgent: already registered");
    });

    it("reverts if name is empty", async () => {
      await expect(
        lemonAgent.connect(alice).registerAgent("", "", "", "", "", [], SPLIT)
      ).to.be.revertedWith("LemonAgent: name required");
    });

    it("increments totalAgents", async () => {
      expect(await lemonAgent.totalAgents()).to.equal(0);
      await lemonAgent.connect(alice).registerAgent("Alice", "", "", "", "", [], SPLIT);
      await lemonAgent.connect(bob).registerAgent("Bob", "", "", "", "", [], SOLO);
      expect(await lemonAgent.totalAgents()).to.equal(2);
    });
  });

  describe("updateProfile", () => {
    it("updates mutable fields", async () => {
      await lemonAgent.connect(alice).registerAgent("Alice", "ipfs://old", "", "old personality", "", [], SPLIT);
      await lemonAgent.connect(alice).updateProfile("ipfs://new", "", "new personality", "new prefs", ["lazy"], SOLO);
      const p = await lemonAgent.getProfile(alice.address);
      expect(p.avatarURI).to.equal("ipfs://new");
      expect(p.personality).to.equal("new personality");
      expect(p.billingMode).to.equal(SOLO);
    });

    it("reverts for unregistered wallet", async () => {
      await expect(
        lemonAgent.connect(alice).updateProfile("", "", "", "", [], SPLIT)
      ).to.be.revertedWith("LemonAgent: not registered");
    });
  });

  describe("linkERC8004Id", () => {
    it("links an ERC-8004 ID (owner only)", async () => {
      await lemonAgent.connect(alice).registerAgent("Alice", "", "", "", "", [], SPLIT);
      await lemonAgent.connect(owner).linkERC8004Id(alice.address, 42);
      const p = await lemonAgent.getProfile(alice.address);
      expect(p.erc8004AgentId).to.equal(42);
    });

    it("reverts for non-owner", async () => {
      await lemonAgent.connect(alice).registerAgent("Alice", "", "", "", "", [], SPLIT);
      await expect(
        lemonAgent.connect(bob).linkERC8004Id(alice.address, 42)
      ).to.be.reverted;
    });
  });

  describe("deactivate", () => {
    it("marks agent inactive", async () => {
      await lemonAgent.connect(alice).registerAgent("Alice", "", "", "", "", [], SPLIT);
      await lemonAgent.connect(alice).deactivate();
      const p = await lemonAgent.getProfile(alice.address);
      expect(p.active).to.be.false;
    });
  });

  describe("getAllAgents", () => {
    it("returns all registered wallets", async () => {
      await lemonAgent.connect(alice).registerAgent("Alice", "", "", "", "", [], SPLIT);
      await lemonAgent.connect(bob).registerAgent("Bob", "", "", "", "", [], SPLIT);
      const all = await lemonAgent.getAllAgents();
      expect(all).to.include(alice.address);
      expect(all).to.include(bob.address);
    });
  });
});
