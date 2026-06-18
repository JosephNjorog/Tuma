/**
 * MTN Mobile Money API (MoMo)
 * Covers Ghana (+233) and Uganda (+256)
 * Uses the MTN MoMo Disbursements API to send money to recipients.
 */

import { RailError } from "../../lib/errors";

const BASE_URL =
  process.env.MOMO_ENV === "production"
    ? "https://proxy.momoapi.mtn.com"
    : "https://sandbox.momodeveloper.mtn.com";

let momoToken: string | null = null;
let momoTokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (momoToken && Date.now() < momoTokenExpiry) return momoToken;

  const credentials = Buffer.from(
    `${process.env.MOMO_API_USER}:${process.env.MOMO_API_KEY}`
  ).toString("base64");

  const res = await fetch(`${BASE_URL}/disbursement/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Ocp-Apim-Subscription-Key": process.env.MOMO_SUBSCRIPTION_KEY!,
      "Content-Length": "0",
    },
  });

  if (!res.ok) throw new RailError("momo", "Failed to get MoMo token");

  const data = (await res.json()) as { access_token: string; expires_in: number };
  momoToken = data.access_token;
  momoTokenExpiry = Date.now() + data.expires_in * 1000 - 30_000;
  return momoToken;
}

export type MomoTransferResult = {
  railReference: string;
  status: "pending";
};

/**
 * Sends money to a recipient's MoMo wallet (Ghana/Uganda).
 * @param phone  E.164 format e.g. +233244567890
 * @param amount Amount in local currency (GHS or UGX)
 * @param currency  "GHS" or "UGX"
 * @param ref    Internal transaction reference
 */
function targetEnvironment(currency: "GHS" | "UGX"): string {
  if (process.env.MOMO_ENV !== "production") return "sandbox";
  return currency === "GHS" ? "mtnghana" : "mtnuganda";
}

export async function sendMomoTransfer(
  phone: string,
  amount: number,
  currency: "GHS" | "UGX",
  ref: string,
  idempotencyKey: string
): Promise<MomoTransferResult> {
  const token = await getAccessToken();

  // MoMo expects phone without '+'
  const msisdn = phone.replace("+", "");

  const payload = {
    amount: Math.round(amount).toString(),
    currency,
    externalId: idempotencyKey,
    payee: {
      partyIdType: "MSISDN",
      partyId: msisdn,
    },
    payerMessage: `Autopayke transfer ${ref}`,
    payeeNote: `Autopayke payment ${ref}`,
  };

  const res = await fetch(`${BASE_URL}/disbursement/v1_0/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": idempotencyKey,
      "X-Target-Environment": targetEnvironment(currency),
      "Ocp-Apim-Subscription-Key": process.env.MOMO_SUBSCRIPTION_KEY!,
      "Content-Type": "application/json",
      "X-Callback-Url": process.env.MOMO_CALLBACK_URL!,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new RailError("momo", `Transfer failed: ${body}`);
  }

  return {
    railReference: idempotencyKey,
    status: "pending",
  };
}

/** Poll transfer status — used by settlement worker. */
export async function getMomoTransferStatus(
  referenceId: string
): Promise<"pending" | "settled" | "failed"> {
  const token = await getAccessToken();

  const res = await fetch(
    `${BASE_URL}/disbursement/v1_0/transfer/${referenceId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Target-Environment": process.env.MOMO_ENV === "production" ? "mtnghana" : "sandbox",
        "Ocp-Apim-Subscription-Key": process.env.MOMO_SUBSCRIPTION_KEY!,
      },
    }
  );

  if (!res.ok) return "pending";

  const data = (await res.json()) as { status: string };
  switch (data.status) {
    case "SUCCESSFUL":
      return "settled";
    case "FAILED":
    case "REJECTED":
      return "failed";
    default:
      return "pending";
  }
}
