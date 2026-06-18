/**
 * Wave Mobile Money — Senegal / Côte d'Ivoire (XOF)
 * Wave Checkout API: initiates a payment request to a Wave user.
 * Business Payout API: disbursements to Wave wallets.
 */

import { RailError } from "../../lib/errors";

const WAVE_API_KEY = process.env.WAVE_API_KEY!;
const WAVE_BUSINESS_ID = process.env.WAVE_BUSINESS_ID!;
const BASE_URL = "https://api.wave.com/v1";

async function waveFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${WAVE_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new RailError("wave", `Wave API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export type WavePayoutResult = {
  railReference: string;
  status: "pending" | "settled";
};

/**
 * Sends XOF to a Wave wallet (Senegal / CI).
 * @param phone   E.164 format e.g. +221771234567
 * @param amount  Amount in XOF
 * @param ref     Internal reference
 */
export async function sendWavePayout(
  phone: string,
  amount: number,
  ref: string,
  idempotencyKey: string
): Promise<WavePayoutResult> {
  const data = await waveFetch<{
    id: string;
    status: string;
  }>("/business/payout", {
    method: "POST",
    body: JSON.stringify({
      currency: "XOF",
      receive_amount: Math.round(amount).toString(),
      mobile: phone,
      name: "Autopayke recipient",
      client_reference: idempotencyKey,
      business_id: WAVE_BUSINESS_ID,
    }),
  });

  return {
    railReference: data.id,
    status: data.status === "succeeded" ? "settled" : "pending",
  };
}

export async function getWavePayoutStatus(
  payoutId: string
): Promise<"pending" | "settled" | "failed"> {
  const data = await waveFetch<{ status: string }>(`/business/payout/${payoutId}`);

  switch (data.status) {
    case "succeeded":
      return "settled";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "pending";
  }
}

/** Wave Checkout: generates a payment link for the customer to scan/tap. */
export async function createWaveCheckout(
  amount: number,
  ref: string,
  successUrl: string
): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const data = await waveFetch<{
    id: string;
    wave_launch_url: string;
  }>("/checkout/sessions", {
    method: "POST",
    body: JSON.stringify({
      currency: "XOF",
      amount: Math.round(amount).toString(),
      error_url: `${process.env.APP_URL}/fund?error=1`,
      success_url: successUrl,
      client_reference: ref,
      business_id: WAVE_BUSINESS_ID,
    }),
  });

  return {
    checkoutUrl: data.wave_launch_url,
    checkoutId: data.id,
  };
}
