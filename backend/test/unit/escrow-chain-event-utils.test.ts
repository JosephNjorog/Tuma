import { describe, expect, test } from "bun:test";
import {
  amountUsdc,
  bytes32ToString,
  expiryDate,
} from "../../src/services/escrow-chain-event-utils";

function bytes32(value: string): `0x${string}` {
  return `0x${Buffer.from(value, "utf8").toString("hex").padEnd(64, "0")}`;
}

describe("escrow chain-event helpers", () => {
  test("decodes null-padded bytes32 claim refs", () => {
    expect(bytes32ToString(bytes32("escrow-123"))).toBe("escrow-123");
  });

  test("decodes an empty bytes32 as an empty claim ref", () => {
    expect(bytes32ToString(`0x${"0".repeat(64)}`)).toBe("");
  });

  test("formats USDC base units with six decimal places", () => {
    expect(amountUsdc(1n)).toBe("0.000001");
    expect(amountUsdc(1_234_567n)).toBe("1.234567");
    expect(amountUsdc(25_000_000n)).toBe("25.000000");
  });

  test("converts on-chain expiry seconds to a Date", () => {
    expect(expiryDate(0n).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(expiryDate(1_800_000_000n).toISOString()).toBe(
      "2027-01-15T08:00:00.000Z"
    );
  });
});
