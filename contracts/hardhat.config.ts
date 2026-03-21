import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const raw = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const DEPLOYER_KEY = /^0x[0-9a-fA-F]{64}$/.test(raw) ? raw : undefined;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    ...(DEPLOYER_KEY && {
      celoSepolia: {
        url: process.env.CELO_SEPOLIA_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org",
        chainId: 11142220,
        accounts: [DEPLOYER_KEY],
      },
      celo: {
        url: process.env.CELO_RPC_URL || "https://forno.celo.org",
        chainId: 42220,
        accounts: [DEPLOYER_KEY],
      },
    }),
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    artifacts: "./artifacts",
  },
};

export default config;
