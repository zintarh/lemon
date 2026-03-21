import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Lemon contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "CELO");

  // ─── 1. Deploy LemonAgent ─────────────────────────────────────────────────
  console.log("\n[1/3] Deploying LemonAgent...");
  const LemonAgent = await ethers.getContractFactory("LemonAgent");
  const lemonAgent = await LemonAgent.deploy();
  await lemonAgent.waitForDeployment();
  const agentAddress = await lemonAgent.getAddress();
  console.log("  LemonAgent deployed to:", agentAddress);

  // ─── 2. Deploy LemonDate ──────────────────────────────────────────────────
  console.log("\n[2/3] Deploying LemonDate...");
  const LemonDate = await ethers.getContractFactory("LemonDate");
  const lemonDate = await LemonDate.deploy(agentAddress);
  await lemonDate.waitForDeployment();
  const dateAddress = await lemonDate.getAddress();
  console.log("  LemonDate deployed to:", dateAddress);

  // ─── 3. Deploy LemonNFT ───────────────────────────────────────────────────
  console.log("\n[3/3] Deploying LemonNFT...");
  const LemonNFT = await ethers.getContractFactory("LemonNFT");
  const lemonNFT = await LemonNFT.deploy(agentAddress); // pass LemonAgent so agents can mint autonomously
  await lemonNFT.waitForDeployment();
  const nftAddress = await lemonNFT.getAddress();
  console.log("  LemonNFT deployed to:", nftAddress);

  // ─── Output ───────────────────────────────────────────────────────────────
  console.log("\n─── Deployment Summary ────────────────────────────────────");
  console.log("  LEMON_AGENT_CONTRACT =", agentAddress);
  console.log("  LEMON_DATE_CONTRACT  =", dateAddress);
  console.log("  LEMON_NFT_CONTRACT   =", nftAddress);
  console.log("────────────────────────────────────────────────────────────");

  // Write addresses to a JSON file for other workspaces to consume
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  const existing = fs.existsSync(deploymentPath)
    ? JSON.parse(fs.readFileSync(deploymentPath, "utf-8"))
    : {};

  const network = (await ethers.provider.getNetwork()).name;
  existing[network] = {
    LemonAgent: agentAddress,
    LemonDate: dateAddress,
    LemonNFT: nftAddress,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(existing, null, 2));
  console.log("\nAddresses saved to contracts/deployments.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
