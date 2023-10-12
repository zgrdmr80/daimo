import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

import latestAccountFactory from "../contract/broadcast/DeployAccountFactory.s.sol/8453/run-latest.json";
import latestEphemeralNotes from "../contract/broadcast/DeployEphemeralNotes.s.sol/8453/run-latest.json";
import latestNameReg from "../contract/broadcast/DeployNameRegistry.s.sol/8453/run-latest.json";

// TODO: Base Mainnet
// Works on testnet too, because these are all CREATE2 contracts.
const deployments = Object.fromEntries(
  [
    ...latestNameReg.transactions,
    ...latestAccountFactory.transactions,
    ...latestEphemeralNotes.transactions,
  ]
    .filter((t) => t.transactionType === "CREATE2")
    .map((r) => [r.contractName, r.contractAddress as `0x${string}`])
);

export default defineConfig({
  out: "src/generated.ts",
  plugins: [
    foundry({
      project: "../contract",
      deployments,
      include: ["Daimo*.sol/*", "ERC*.sol/*", "EntryPoint.sol/*"],
    }),
  ],
});
