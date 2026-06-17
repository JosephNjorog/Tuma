import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  getContract,
  encodeFunctionData,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalanche, avalancheFuji } from "viem/chains";
import { deriveWalletPrivateKey } from "../lib/crypto";
import { BlockchainError } from "../lib/errors";

// ── Utility ───────────────────────────────────────────────────────────────────

/** Encodes a UTF-8 string as a right-zero-padded bytes32 hex value. */
export function stringToBytes32(s: string): `0x${string}` {
  return `0x${Buffer.from(s).toString("hex").padEnd(64, "0").slice(0, 64)}`;
}

// ── Chain setup ───────────────────────────────────────────────────────────────

const isTestnet = process.env.NODE_ENV !== "production";
const chain = isTestnet ? avalancheFuji : avalanche;
const rpcUrl = isTestnet
  ? process.env.AVALANCHE_FUJI_RPC_URL!
  : process.env.AVALANCHE_RPC_URL!;

export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

// Relayer client — lazily initialized so a missing key doesn't crash startup.
// Blockchain write operations will throw BlockchainError if key is not set.
let _relayerClient: ReturnType<typeof createWalletClient> | null = null;
let _relayerAccount: ReturnType<typeof privateKeyToAccount> | null = null;

function requireRelayerAccount() {
  if (_relayerAccount) return _relayerAccount;
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new BlockchainError(
      "RELAYER_PRIVATE_KEY is not configured — blockchain write operations are disabled"
    );
  }
  _relayerAccount = privateKeyToAccount(key as `0x${string}`);
  return _relayerAccount;
}

function requireRelayer() {
  if (_relayerClient) return _relayerClient;
  const account = requireRelayerAccount();
  _relayerClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  return _relayerClient;
}

// ── Token addresses ───────────────────────────────────────────────────────────
// Defaults are network-aware: mainnet defaults are the real Circle USDC /
// Tether USDT contracts on Avalanche C-Chain; testnet defaults are Circle's
// official USDC faucet contract on Fuji (no canonical Fuji USDT exists, so
// USDT requires an explicit USDT_ADDRESS override on testnet).
// All defaults verified on-chain (symbol()/decimals()) — the previous mainnet
// USDC default was missing its last hex digit and silently failing viem's
// address validation on every balance/transfer call.

const MAINNET_TOKEN_ADDRESSES: Record<string, Address> = {
  USDC: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  USDT: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
};

const FUJI_USDC_ADDRESS: Address = "0x5425890298aed601595a70AB815c96711a31Bc65";

export const TOKEN_ADDRESSES: {
  USDC: Address;
  USDT: Address | undefined;
} = {
  USDC: (process.env.USDC_ADDRESS ??
    (isTestnet ? FUJI_USDC_ADDRESS : MAINNET_TOKEN_ADDRESSES.USDC)) as Address,
  // No canonical USDT test contract exists on Fuji — leave unset there unless
  // USDT_ADDRESS is explicitly provided. getWalletBalances() treats a missing
  // address as a zero balance rather than failing the whole wallet view.
  USDT: process.env.USDT_ADDRESS
    ? (process.env.USDT_ADDRESS as Address)
    : isTestnet
    ? undefined
    : MAINNET_TOKEN_ADDRESSES.USDT,
};

// ── Contract ABIs (minimal) ───────────────────────────────────────────────────

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "Transfer",
    type: "event",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

const TUMA_FACTORY_ABI = [
  {
    name: "createWallet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "phoneHash", type: "bytes32" },
    ],
    outputs: [{ name: "wallet", type: "address" }],
  },
  {
    name: "getWalletAddress",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "phoneHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const TUMA_REGISTRY_ABI = [
  {
    name: "registerWallet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "phoneHash", type: "bytes32" },
      { name: "wallet", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "getWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "phoneHash", type: "bytes32" }],
    outputs: [{ name: "wallet", type: "address" }],
  },
] as const;

const TUMA_ESCROW_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimRef", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "expiryOffset", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimRef", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "refund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimRef", type: "bytes32" }],
    outputs: [],
  },
] as const;

const SMART_WALLET_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "approveToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ── Wallet derivation ─────────────────────────────────────────────────────────

export function getUserAccount(phoneHash: string) {
  const privKey = deriveWalletPrivateKey(phoneHash);
  return privateKeyToAccount(privKey);
}

/** Predicts the smart wallet address for a user before deployment. */
export async function getSmartWalletAddress(phoneHash: string): Promise<Address> {
  const factoryAddress = process.env.TUMA_FACTORY_ADDRESS as Address;
  if (!factoryAddress || factoryAddress === "0x") {
    throw new BlockchainError("TUMA_FACTORY_ADDRESS is not configured");
  }

  const userAccount = getUserAccount(phoneHash);

  const address = await publicClient.readContract({
    address: factoryAddress,
    abi: TUMA_FACTORY_ABI,
    functionName: "getWalletAddress",
    args: [userAccount.address, `0x${phoneHash}` as `0x${string}`],
  });

  return address as Address;
}

/** Deploys a new smart wallet for the user via the factory. Returns the wallet address. */
export async function deploySmartWallet(phoneHash: string): Promise<Address> {
  const factoryAddress = process.env.TUMA_FACTORY_ADDRESS as Address;
  if (!factoryAddress || factoryAddress === "0x") {
    throw new BlockchainError("TUMA_FACTORY_ADDRESS is not configured");
  }

  const userAccount = getUserAccount(phoneHash);

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: factoryAddress,
    abi: TUMA_FACTORY_ABI,
    functionName: "createWallet",
    args: [userAccount.address, `0x${phoneHash}` as `0x${string}`],
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return getSmartWalletAddress(phoneHash);
}

// ── Balance queries ───────────────────────────────────────────────────────────

export type TokenBalance = {
  symbol: string;
  address: string;
  balance: string;
  balanceUsd: number;
  decimals: number;
};

export async function getWalletBalances(
  walletAddress: Address,
  usdcPriceUsd = 1.0,
  usdtPriceUsd = 1.0
): Promise<TokenBalance[]> {
  // Each token balance is fetched independently — a missing/misconfigured
  // token address (e.g. no canonical USDT test contract on Fuji) shouldn't
  // take down the whole wallet view.
  async function safeBalanceOf(address: Address | undefined): Promise<bigint> {
    if (!address) return 0n;
    try {
      return (await publicClient.readContract({
        address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress],
      })) as bigint;
    } catch {
      return 0n;
    }
  }

  const [usdcBalance, usdtBalance, avaxBalance] = await Promise.all([
    safeBalanceOf(TOKEN_ADDRESSES.USDC),
    safeBalanceOf(TOKEN_ADDRESSES.USDT),
    publicClient.getBalance({ address: walletAddress }),
  ]);

  const usdc = Number(formatUnits(usdcBalance as bigint, 6));
  const usdt = Number(formatUnits(usdtBalance as bigint, 6));
  const avax = Number(formatUnits(avaxBalance, 18));

  const avaxPriceUsd = await getAvaxPriceUsd();

  return [
    {
      symbol: "USDC",
      address: TOKEN_ADDRESSES.USDC,
      balance: usdc.toFixed(6),
      balanceUsd: usdc * usdcPriceUsd,
      decimals: 6,
    },
    {
      symbol: "USDT",
      address: TOKEN_ADDRESSES.USDT ?? "not configured on this network",
      balance: usdt.toFixed(6),
      balanceUsd: usdt * usdtPriceUsd,
      decimals: 6,
    },
    {
      symbol: "AVAX",
      address: "native",
      balance: avax.toFixed(8),
      balanceUsd: avax * avaxPriceUsd,
      decimals: 18,
    },
  ];
}

export async function getUsdcBalance(walletAddress: Address): Promise<bigint> {
  return publicClient.readContract({
    address: TOKEN_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  }) as Promise<bigint>;
}

export type IncomingTransfer = {
  txHash: string;
  from: Address;
  amount: bigint;
  token: "USDC" | "USDT";
  blockNumber: bigint;
};

/**
 * Scans for incoming USDC/USDT transfers to a wallet between two blocks —
 * picks up deposits sent directly to the wallet address from outside the
 * app (e.g. an external wallet), which otherwise leave no record anywhere.
 */
export async function getIncomingTransfers(
  walletAddress: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<IncomingTransfer[]> {
  const tokens: { address: Address; symbol: "USDC" | "USDT" }[] = [
    { address: TOKEN_ADDRESSES.USDC, symbol: "USDC" },
    ...(TOKEN_ADDRESSES.USDT ? [{ address: TOKEN_ADDRESSES.USDT, symbol: "USDT" as const }] : []),
  ];

  const results = await Promise.all(
    tokens.map(({ address, symbol }) =>
      publicClient
        .getLogs({
          address,
          event: {
            name: "Transfer",
            type: "event",
            inputs: ERC20_ABI.find((i) => i.name === "Transfer")!.inputs,
          },
          args: { to: walletAddress },
          fromBlock,
          toBlock,
        })
        .then((logs) =>
          logs.map((log) => ({
            txHash: log.transactionHash,
            from: (log.args as { from: Address }).from,
            amount: (log.args as { value: bigint }).value,
            token: symbol,
            blockNumber: log.blockNumber,
          }))
        )
        .catch((err) => {
          console.error(`[Avalanche] getIncomingTransfers(${symbol}) failed:`, (err as Error).message);
          return [] as IncomingTransfer[];
        })
    )
  );

  return results.flat();
}

/**
 * Verifies a transaction hash is a confirmed USDC/USDT transfer to the
 * expected wallet address, returning the real on-chain amount — used by the
 * "pay with connected wallet" funding flow so the credited amount always
 * comes from the chain itself, never from client-supplied input.
 */
export async function verifyIncomingTransfer(
  txHash: Hash,
  expectedTo: Address
): Promise<{ from: Address; amount: bigint; token: "USDC" | "USDT" } | null> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return null;

  const tokens: { address: Address; symbol: "USDC" | "USDT" }[] = [
    { address: TOKEN_ADDRESSES.USDC, symbol: "USDC" },
    ...(TOKEN_ADDRESSES.USDT ? [{ address: TOKEN_ADDRESSES.USDT, symbol: "USDT" as const }] : []),
  ];

  for (const log of receipt.logs) {
    const token = tokens.find((t) => t.address.toLowerCase() === log.address.toLowerCase());
    if (!token) continue;

    // Transfer(address indexed from, address indexed to, uint256 value)
    // topics[1] = from, topics[2] = to (both left-padded to 32 bytes)
    if (log.topics.length < 3) continue;
    const to = `0x${log.topics[2]!.slice(-40)}` as Address;
    if (to.toLowerCase() !== expectedTo.toLowerCase()) continue;

    const from = `0x${log.topics[1]!.slice(-40)}` as Address;
    const amount = BigInt(log.data);
    return { from, amount, token: token.symbol };
  }

  return null;
}

// ── Token transfers ───────────────────────────────────────────────────────────

/**
 * Transfers USDC from a user's smart wallet to a recipient.
 * The relayer calls execute() on the smart wallet on behalf of the user.
 */
export async function transferUsdc(
  fromPhoneHash: string,
  fromWalletAddress: Address,
  toAddress: Address,
  amountUsd: number
): Promise<Hash> {
  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);

  // Check balance
  const balance = await getUsdcBalance(fromWalletAddress);
  if (balance < amountRaw) {
    throw new BlockchainError("Insufficient USDC balance");
  }

  const transferCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toAddress, amountRaw],
  });

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: fromWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [TOKEN_ADDRESSES.USDC, 0n, transferCalldata],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Approves the escrow contract to pull USDC from a user's wallet. */
export async function approveEscrow(
  fromWalletAddress: Address,
  amountUsd: number
): Promise<Hash> {
  const escrowAddress = process.env.TUMA_ESCROW_ADDRESS as Address;
  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);

  const approveCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [escrowAddress, amountRaw],
  });

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: fromWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [TOKEN_ADDRESSES.USDC, 0n, approveCalldata],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Records a newly deployed smart wallet in TumaRegistry on-chain.
 * Silently skips if TUMA_REGISTRY_ADDRESS is not yet configured (pre-deploy).
 */
export async function registerWalletOnChain(
  phoneHash: string,
  walletAddress: Address
): Promise<void> {
  const registryAddress = process.env.TUMA_REGISTRY_ADDRESS as Address | undefined;
  if (!registryAddress || registryAddress === "0x") return;

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: registryAddress,
    abi: TUMA_REGISTRY_ABI,
    functionName: "registerWallet",
    args: [`0x${phoneHash}` as `0x${string}`, walletAddress],
  });

  await publicClient.waitForTransactionReceipt({ hash });
}

// ── Escrow on-chain calls ─────────────────────────────────────────────────────

/**
 * Locks USDC in TumaEscrow on behalf of the sender's smart wallet.
 * The smart wallet must have already approved the escrow contract (via approveEscrow).
 * The relayer calls smartWallet.execute(escrowAddress, 0, depositCalldata).
 */
export async function depositToEscrow(
  senderWalletAddress: Address,
  escrowRef: string,
  amountUsd: number
): Promise<Hash> {
  const escrowAddress = process.env.TUMA_ESCROW_ADDRESS as Address;
  if (!escrowAddress || escrowAddress === "0x") {
    throw new BlockchainError("TUMA_ESCROW_ADDRESS is not configured");
  }

  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);
  const claimRefBytes32 = stringToBytes32(escrowRef);
  const EXPIRY_OFFSET = BigInt(7 * 24 * 60 * 60); // 7 days

  const depositCalldata = encodeFunctionData({
    abi: TUMA_ESCROW_ABI,
    functionName: "deposit",
    args: [claimRefBytes32, TOKEN_ADDRESSES.USDC, amountRaw, EXPIRY_OFFSET],
  });

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: senderWalletAddress,
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [escrowAddress, 0n, depositCalldata],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Claims a pending escrow and transfers USDC to the recipient's wallet.
 * The signature must be produced by TUMA's SIGNER_ROLE key over (claimRef, recipient, chainId).
 */
export async function claimEscrowOnChain(
  escrowRef: string,
  recipientAddress: Address,
  signature: `0x${string}`
): Promise<Hash> {
  const escrowAddress = process.env.TUMA_ESCROW_ADDRESS as Address;
  if (!escrowAddress || escrowAddress === "0x") {
    throw new BlockchainError("TUMA_ESCROW_ADDRESS is not configured");
  }

  const claimRefBytes32 = stringToBytes32(escrowRef);

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: escrowAddress,
    abi: TUMA_ESCROW_ABI,
    functionName: "claim",
    args: [claimRefBytes32, recipientAddress, signature],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Refunds an expired pending escrow back to the original sender.
 * TumaEscrow enforces the expiry and pending-state checks on-chain.
 */
export async function refundEscrowOnChain(escrowRef: string): Promise<Hash> {
  const escrowAddress = process.env.TUMA_ESCROW_ADDRESS as Address;
  if (!escrowAddress || escrowAddress === "0x") {
    throw new BlockchainError("TUMA_ESCROW_ADDRESS is not configured");
  }

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: escrowAddress,
    abi: TUMA_ESCROW_ABI,
    functionName: "refund",
    args: [stringToBytes32(escrowRef)],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Credits USDC from TUMA's relayer float directly to a user's smart wallet.
 * Used after a successful card or M-Pesa STK Push funding payment.
 * The relayer EOA must hold sufficient USDC float.
 */
export async function creditFromFloat(
  toWalletAddress: Address,
  amountUsd: number
): Promise<Hash> {
  const amountRaw = parseUnits(amountUsd.toFixed(6), 6);

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: TOKEN_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toWalletAddress, amountRaw],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Registers a smart wallet with the Paymaster for gas sponsorship.
 * Called after wallet deploy so the user never pays gas.
 * Silently skips if TUMA_PAYMASTER_ADDRESS is not yet configured.
 */
export async function sponsorWallet(walletAddress: Address): Promise<void> {
  const paymasterAddress = process.env.TUMA_PAYMASTER_ADDRESS as Address | undefined;
  if (!paymasterAddress || paymasterAddress === "0x") return;

  const PAYMASTER_APPROVE_ABI = [
    {
      name: "approveWallet",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [{ name: "wallet", type: "address" }],
      outputs: [],
    },
  ] as const;

  const hash = await requireRelayer().writeContract({
    chain,
    account: requireRelayerAccount(),
    address: paymasterAddress,
    abi: PAYMASTER_APPROVE_ABI,
    functionName: "approveWallet",
    args: [walletAddress],
  });

  await publicClient.waitForTransactionReceipt({ hash });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAvaxPriceUsd(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd"
    );
    const data = (await res.json()) as { "avalanche-2": { usd: number } };
    return data["avalanche-2"].usd;
  } catch {
    return 35; // fallback
  }
}

export function explorerUrl(txHashOrAddress: string): string {
  const base = isTestnet
    ? "https://testnet.snowtrace.io"
    : "https://snowtrace.io";
  return txHashOrAddress.length === 66
    ? `${base}/tx/${txHashOrAddress}`
    : `${base}/address/${txHashOrAddress}`;
}
