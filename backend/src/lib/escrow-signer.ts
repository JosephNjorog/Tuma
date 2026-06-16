import { privateKeyToAccount } from "viem/accounts";
import { stringToBytes32 } from "../services/avalanche";
import type { Address } from "viem";
import { keccak256, encodePacked, toBytes } from "viem";
import { BlockchainError } from "./errors";

let _signerAccount: ReturnType<typeof privateKeyToAccount> | null = null;

function requireSigner() {
  if (_signerAccount) return _signerAccount;
  const key = process.env.SIGNER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new BlockchainError("SIGNER_PRIVATE_KEY is not configured — escrow signing is disabled");
  }
  _signerAccount = privateKeyToAccount(key as `0x${string}`);
  return _signerAccount;
}

export async function signEscrowClaim(
  escrowRef: string,
  recipientAddress: Address,
  chainId: number
): Promise<`0x${string}`> {
  const claimRefBytes32 = stringToBytes32(escrowRef);

  const digest = keccak256(
    encodePacked(
      ["bytes32", "address", "uint256"],
      [claimRefBytes32, recipientAddress, BigInt(chainId)]
    )
  );

  return requireSigner().signMessage({ message: { raw: toBytes(digest) } });
}
