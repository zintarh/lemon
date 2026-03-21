import { expect } from "chai";
import { ethers } from "hardhat";
import { LemonAgent, LemonDate } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("LemonDate", function () {
  let lemonAgent: LemonAgent;
  let lemonDate: LemonDate;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const SPLIT = 0;
  const SOLO = 1;

  const COFFEE = 0;
  const BEACH = 1;
  const ROOFTOP = 3;

  const PAYER_AGENT_A = 0;
  const PAYER_AGENT_B = 1;
  const PAYER_SPLIT = 2;

  const ZERO_ADDRESS = ethers.ZeroAddress;
  const FAKE_TX = ethers.keccak256(ethers.toUtf8Bytes("x402-payment-receipt"));
  const FAKE_TOKEN = "0x765DE816845861e75A25fCA122bb6898B8B1282a"; // cUSD on Celo

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    const AgentFactory = await ethers.getContractFactory("LemonAgent");
    lemonAgent = (await AgentFactory.deploy()) as LemonAgent;

    const DateFactory = await ethers.getContractFactory("LemonDate");
    lemonDate = (await DateFactory.deploy(await lemonAgent.getAddress())) as LemonDate;

    // Register both agents
    await lemonAgent.connect(alice).registerAgent("Alice", "", "", "", "", [], SPLIT);
    await lemonAgent.connect(bob).registerAgent("Bob", "", "", "", "", [], SOLO);
  });

  describe("bookDate", () => {
    it("books a date and emits events", async () => {
      await expect(
        lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX)
      )
        .to.emit(lemonDate, "DateBooked")
        .withArgs(0, alice.address, bob.address, COFFEE, PAYER_SPLIT)
        .and.to.emit(lemonDate, "PaymentRecorded");
    });

    it("records correct cost for COFFEE template (500 cents)", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX);
      const record = await lemonDate.getDate(0);
      expect(record.costUSD).to.equal(500);
    });

    it("records correct cost for ROOFTOP_DINNER template (4000 cents)", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, ROOFTOP, PAYER_AGENT_A, FAKE_TOKEN, FAKE_TX);
      const record = await lemonDate.getDate(0);
      expect(record.costUSD).to.equal(4000);
    });

    it("tracks spend for SPLIT payer mode", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX);
      expect(await lemonDate.totalSpentCents(alice.address)).to.equal(250);
      expect(await lemonDate.totalSpentCents(bob.address)).to.equal(250);
    });

    it("tracks spend for AGENT_A payer mode", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_AGENT_A, FAKE_TOKEN, FAKE_TX);
      expect(await lemonDate.totalSpentCents(alice.address)).to.equal(500);
      expect(await lemonDate.totalSpentCents(bob.address)).to.equal(0);
    });

    it("reverts for unregistered agentA", async () => {
      const [, , , charlie] = await ethers.getSigners();
      await expect(
        lemonDate.connect(owner).bookDate(charlie.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX)
      ).to.be.revertedWith("LemonDate: agentA not registered");
    });

    it("reverts for non-owner caller", async () => {
      await expect(
        lemonDate.connect(alice).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX)
      ).to.be.reverted;
    });

    it("stores date in both agents' history", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX);
      expect(await lemonDate.getAgentDates(alice.address)).to.include(0n);
      expect(await lemonDate.getAgentDates(bob.address)).to.include(0n);
    });
  });

  describe("completeDate", () => {
    it("marks date completed and records NFT token ID", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX);
      await lemonDate.connect(owner).completeDate(0, 7);
      const record = await lemonDate.getDate(0);
      expect(record.status).to.equal(2); // COMPLETED
      expect(record.nftTokenId).to.equal(7);
    });

    it("increments totalDatesCompleted for both agents", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX);
      await lemonDate.connect(owner).completeDate(0, 1);
      expect(await lemonDate.totalDatesCompleted(alice.address)).to.equal(1);
      expect(await lemonDate.totalDatesCompleted(bob.address)).to.equal(1);
    });

    it("reverts if date is not active", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX);
      await lemonDate.connect(owner).cancelDate(0);
      await expect(lemonDate.connect(owner).completeDate(0, 1)).to.be.revertedWith("LemonDate: not active");
    });
  });

  describe("cancelDate", () => {
    it("marks date as cancelled", async () => {
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX);
      await lemonDate.connect(owner).cancelDate(0);
      const record = await lemonDate.getDate(0);
      expect(record.status).to.equal(3); // CANCELLED
    });
  });

  describe("resolveNextPayer", () => {
    it("returns a valid agent address (a or b)", async () => {
      const payer = await lemonDate.connect(owner).resolveNextPayer.staticCall(alice.address, bob.address);
      expect([alice.address, bob.address]).to.include(payer);
    });

    it("alternates payer on subsequent calls", async () => {
      // Prime state with a real first call (random pick doesn't matter)
      await lemonDate.connect(owner).resolveNextPayer(alice.address, bob.address);
      // Read who pays next (stored after first call)
      const second = await lemonDate.connect(owner).resolveNextPayer.staticCall(alice.address, bob.address);
      // Commit second call — updates stored payer to the other one
      await lemonDate.connect(owner).resolveNextPayer(alice.address, bob.address);
      // Read who pays next now — must be the opposite
      const third = await lemonDate.connect(owner).resolveNextPayer.staticCall(alice.address, bob.address);
      expect(second).to.not.equal(third);
      // Both agents must be represented across the two calls
      const both = new Set([second.toLowerCase(), third.toLowerCase()]);
      expect(both.has(alice.address.toLowerCase())).to.be.true;
      expect(both.has(bob.address.toLowerCase())).to.be.true;
    });
  });

  describe("totalDates", () => {
    it("returns total date count", async () => {
      expect(await lemonDate.totalDates()).to.equal(0);
      await lemonDate.connect(owner).bookDate(alice.address, bob.address, COFFEE, PAYER_SPLIT, FAKE_TOKEN, FAKE_TX);
      expect(await lemonDate.totalDates()).to.equal(1);
    });
  });
});
