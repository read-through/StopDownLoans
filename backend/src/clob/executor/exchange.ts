import type { Account, Address, PublicClient, WalletClient } from "viem";
import type { Hex } from "../types.js";
import type { MatchOrdersArgs } from "./calldata.js";

export const outcomeExchangeAbi = [
  {
    type: "function",
    name: "matchOrders",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "takerOrder",
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "outcomeToken", type: "address" },
          { name: "marketId", type: "bytes32" },
          { name: "outcome", type: "uint8" },
          { name: "side", type: "uint8" },
          { name: "outcomeAmount", type: "uint256" },
          { name: "usdcAmount", type: "uint256" },
          { name: "expiration", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "takerSignature", type: "bytes" },
      {
        name: "makerOrders",
        type: "tuple[]",
        components: [
          { name: "maker", type: "address" },
          { name: "outcomeToken", type: "address" },
          { name: "marketId", type: "bytes32" },
          { name: "outcome", type: "uint8" },
          { name: "side", type: "uint8" },
          { name: "outcomeAmount", type: "uint256" },
          { name: "usdcAmount", type: "uint256" },
          { name: "expiration", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      { name: "makerSignatures", type: "bytes[]" },
      { name: "makerFillAmounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

export type OperatorAccount = Account | Address;

export type SimulateMatchOrdersInput = {
  publicClient: PublicClient;
  outcomeExchange: Hex;
  operator: OperatorAccount;
  args: MatchOrdersArgs;
};

export type SubmitMatchOrdersInput = SimulateMatchOrdersInput & {
  walletClient: WalletClient;
};

export async function simulateMatchOrders(input: SimulateMatchOrdersInput): Promise<void> {
  await input.publicClient.simulateContract({
    address: input.outcomeExchange,
    abi: outcomeExchangeAbi,
    functionName: "matchOrders",
    args: toContractArgs(input.args),
    account: input.operator,
  });
}

export async function submitMatchOrders(input: SubmitMatchOrdersInput): Promise<Hex> {
  const simulation = await input.publicClient.simulateContract({
    address: input.outcomeExchange,
    abi: outcomeExchangeAbi,
    functionName: "matchOrders",
    args: toContractArgs(input.args),
    account: input.operator,
  });

  return input.walletClient.writeContract(simulation.request);
}

function toContractArgs(args: MatchOrdersArgs) {
  return [
    args.takerOrder,
    args.takerSignature,
    args.makerOrders,
    args.makerSignatures,
    args.makerFillAmounts,
  ] as const;
}
