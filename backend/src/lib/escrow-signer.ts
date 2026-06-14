import { privateKeyToAccount } from "viem/accounts";
import { stringToBytes32 } from "../services/avalanche";
import type { Address } from "viem";
import { keccak256, encodePacked, toBytes } from "viem";

const signerAccount = privateKeyToAccount(
  process.env.SIGNER_PRIVATE_KEY! as `0x${string}`
);

/**
 * Produces an ECDSA signature authorising a TumaEscrow.claim() call.
 *
 * The contract verifies:
 *   signer = recover(ethSignedMessageHash(keccak256(claimRef, recipient, chainId)))
 * and checks that signer has SIGNER_ROLE.
 *
 * @param escrowRef       String escrow reference, e.g. "ESC-1234-5678"
 * @param recipientAddress Wallet address that will receive the USDC
 * @param chainId         Chain ID (43114 mainnet / 43113 fuji)
 */
export async function signEscrowClaim(
  escrowRef: string,
  recipientAddress: Address,
  chainId: number
): Promise<`0x${string}`> {
  const claimRefBytes32 = stringToBytes32(escrowRef);

  // Mirror the contract's digest construction:
  // keccak256(abi.encodePacked(claimRef, recipient, block.chainid))
  const digest = keccak256(
    encodePacked(
      ["bytes32", "address", "uint256"],
      [claimRefBytes32, recipientAddress, BigInt(chainId)]
    )
  );

  return signerAccount.signMessage({ message: { raw: toBytes(digest) } });
}
