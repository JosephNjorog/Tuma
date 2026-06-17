/**
 * Proves the DER-parsing / recovery-id / address-derivation logic in
 * kms-signer.ts is correct, without needing a real AWS KMS key.
 *
 * Approach: generate a real secp256k1 keypair locally, sign with it the
 * same way KMS would (raw ECDSA over a digest, DER-encoded), then feed that
 * DER signature and SPKI-wrapped public key through this module's actual
 * code paths by monkey-patching KMSClient.prototype.send. If the resulting
 * signature recovers to the same address viem's own privateKeyToAccount
 * produces for the same key, the conversion logic is correct — independent
 * of whether the bytes came from a real KMS instance or this simulation.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { KMSClient } from "@aws-sdk/client-kms";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  recoverMessageAddress,
  recoverTransactionAddress,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toKmsAccount } from "./kms-signer";

/** Wraps a raw 65-byte uncompressed EC point in a minimal SPKI DER structure,
 *  mirroring what AWS KMS's GetPublicKey returns for an ECC_SECG_P256K1 key. */
function wrapAsSpki(rawPoint: Uint8Array): Uint8Array {
  // A fixed-ish ASN.1 prefix is fine here — extractRawPublicKey only reads
  // the last 65 bytes, so the exact prefix bytes don't matter for this test,
  // only that the point is unambiguously at the tail.
  const prefix = new Uint8Array([0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  return new Uint8Array([...prefix, ...rawPoint]);
}

function mockKms(privateKey: Uint8Array) {
  const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed, 65 bytes

  const original = KMSClient.prototype.send;
  KMSClient.prototype.send = (async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
    if (command.constructor.name === "GetPublicKeyCommand") {
      return { PublicKey: wrapAsSpki(publicKey) };
    }
    if (command.constructor.name === "SignCommand") {
      const digest = command.input.Message as Uint8Array;
      const sig = secp256k1.sign(digest, privateKey, { lowS: true });
      return { Signature: sig.toDERRawBytes() };
    }
    throw new Error(`Unexpected KMS command: ${command.constructor.name}`);
  }) as typeof KMSClient.prototype.send;

  return () => {
    KMSClient.prototype.send = original;
  };
}

describe("kms-signer", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test("toKmsAccount derives the same address as privateKeyToAccount for the same key", async () => {
    const privateKey = secp256k1.utils.randomSecretKey();
    restore = mockKms(privateKey);

    const localAccount = privateKeyToAccount(toHex(privateKey));
    const kmsAccount = await toKmsAccount("test-key-id");

    expect(kmsAccount.address.toLowerCase()).toBe(localAccount.address.toLowerCase());
  });

  test("signMessage produces a signature that recovers to the correct address", async () => {
    const privateKey = secp256k1.utils.randomSecretKey();
    restore = mockKms(privateKey);

    const localAccount = privateKeyToAccount(toHex(privateKey));
    const kmsAccount = await toKmsAccount("test-key-id");

    const message = "Autopayke escrow claim authorization";
    const signature = await kmsAccount.signMessage({ message });

    const recovered = await recoverMessageAddress({ message, signature });
    expect(recovered.toLowerCase()).toBe(localAccount.address.toLowerCase());
  });

  test("signTransaction produces a signature that recovers to the correct address", async () => {
    const privateKey = secp256k1.utils.randomSecretKey();
    restore = mockKms(privateKey);

    const localAccount = privateKeyToAccount(toHex(privateKey));
    const kmsAccount = await toKmsAccount("test-key-id");

    const transaction = {
      to: "0x000000000000000000000000000000000000dEaD" as Hex,
      value: 0n,
      nonce: 0,
      chainId: 43113,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      gas: 21000n,
      type: "eip1559" as const,
    };

    const signedTx = await kmsAccount.signTransaction(transaction);
    const recovered = await recoverTransactionAddress({
      serializedTransaction: signedTx as `0x02${string}`,
    });
    expect(recovered.toLowerCase()).toBe(localAccount.address.toLowerCase());
  });

  test("works across many random keys and digests (recovery-id selection isn't biased toward one bit)", async () => {
    for (let i = 0; i < 10; i++) {
      const privateKey = secp256k1.utils.randomSecretKey();
      restore = mockKms(privateKey);

      const localAccount = privateKeyToAccount(toHex(privateKey));
      const kmsAccount = await toKmsAccount(`test-key-id-${i}`);
      const signature = await kmsAccount.signMessage({ message: `message ${i}` });

      const recovered = await recoverMessageAddress({ message: `message ${i}`, signature });
      expect(recovered.toLowerCase()).toBe(localAccount.address.toLowerCase());

      restore();
      restore = null;
    }
  });
});
