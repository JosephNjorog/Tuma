/**
 * Paystack — Nigeria NGN transfers and card collections.
 * Transfer API: sends NGN to a Nigerian bank account or mobile number.
 * Charge API: initiates card collection (used for TUMA fund via card).
 */

import { RailError } from "../../lib/errors";
import { createHash, createHmac } from "crypto";

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const BASE_URL = "https://api.paystack.co";

async function paystackFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = (await res.json()) as { status: boolean; message: string; data: T };

  if (!res.ok || !data.status) {
    throw new RailError("paystack", data.message ?? `HTTP ${res.status}`);
  }

  return data.data;
}

// ── Recipient management ──────────────────────────────────────────────────────

type RecipientType = "mobile_money" | "nuban";

export async function createTransferRecipient(
  type: RecipientType,
  name: string,
  accountNumber: string,
  bankCode: string,
  currency = "NGN"
): Promise<string> {
  const data = await paystackFetch<{ recipient_code: string }>(
    "/transferrecipient",
    {
      method: "POST",
      body: JSON.stringify({
        type,
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency,
      }),
    }
  );
  return data.recipient_code;
}

// ── Disbursements ─────────────────────────────────────────────────────────────

export type PaystackTransferResult = {
  railReference: string;
  transferCode: string;
  status: "pending" | "settled";
};

/**
 * Sends NGN to a Nigerian bank/mobile money account.
 * @param amount      Amount in NGN (kobo internally — we convert)
 * @param recipient   Paystack recipient code
 * @param ref         Internal reference
 */
export async function sendTransfer(
  amount: number,
  recipientCode: string,
  ref: string,
  idempotencyKey: string
): Promise<PaystackTransferResult> {
  const data = await paystackFetch<{
    transfer_code: string;
    reference: string;
    status: string;
  }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(amount * 100), // NGN to kobo
      recipient: recipientCode,
      reason: `Autopayke transfer ${ref}`,
      reference: idempotencyKey,
    }),
  });

  return {
    railReference: data.transfer_code,
    transferCode: data.transfer_code,
    status: data.status === "success" ? "settled" : "pending",
  };
}

// ── Mobile money collection (fund wallet via M-Pesa / MTN MoMo) ──────────────

type MobileMoneyProvider = "mpesa" | "mtn" | "vodafone" | "airtel" | "tigopesa";

type MobileMoneyResult = {
  reference: string;
  displayText: string;
  status: string;
};

/**
 * Initiates a mobile money charge via Paystack.
 * Supported: Kenya M-Pesa (KES), Ghana MTN MoMo (GHS),
 *            Uganda MTN MoMo (UGX), Tanzania M-Pesa (TZS).
 * On success, Paystack fires charge.success to /webhooks/paystack.
 */
export async function initiateMobileMoneyCharge(
  phone: string,
  amountLocal: number,
  currency: string,
  provider: MobileMoneyProvider,
  ref: string
): Promise<MobileMoneyResult> {
  const data = await paystackFetch<{
    reference: string;
    display_text?: string;
    status: string;
  }>("/charge", {
    method: "POST",
    body: JSON.stringify({
      email: `${phone.replace(/\D/g, "")}@autopayke.com`,
      amount: Math.round(amountLocal * 100),
      currency,
      reference: ref,
      mobile_money: { phone, provider },
      metadata: { tuma_ref: ref, channel: "mobile_money" },
    }),
  });

  return {
    reference: data.reference,
    displayText: data.display_text ?? "Follow the prompt on your phone to complete payment.",
    status: data.status,
  };
}

// ── Card collection (fund wallet) ─────────────────────────────────────────────

export async function initializeCardPayment(
  email: string,
  amountUsd: number,
  ref: string,
  callbackUrl: string
): Promise<{ authorizationUrl: string; accessCode: string }> {
  const data = await paystackFetch<{
    authorization_url: string;
    access_code: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount: Math.round(amountUsd * 100 * 100), // USD cents * NGN rate (simplified)
      currency: "USD",
      reference: ref,
      callback_url: callbackUrl,
      metadata: { tuma_ref: ref },
    }),
  });

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
  };
}

// ── Direct status check ────────────────────────────────────────────────────────
// Backstop for webhook delivery — Paystack's webhook is best-effort (and a free-
// tier Render web service can be cold and miss its delivery window entirely), so
// funding can't depend on it alone. Lets the backend ask Paystack directly.

export async function verifyTransaction(reference: string): Promise<{ status: string; amount: number; currency: string; channel: string }> {
  const data = await paystackFetch<{ status: string; amount: number; currency: string; channel: string }>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  return data;
}

// ── Webhook verification ──────────────────────────────────────────────────────

export function verifyPaystackWebhook(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Paystack] PAYSTACK_WEBHOOK_SECRET is not configured — rejecting webhook");
    return false;
  }
  const expected = createHmac("sha512", secret).update(payload).digest("hex");
  return expected === signature;
}

// ── Transfer status ───────────────────────────────────────────────────────────

export async function getTransferStatus(
  transferCode: string
): Promise<"pending" | "settled" | "failed"> {
  const data = await paystackFetch<{ status: string }>(
    `/transfer/${transferCode}`
  );

  switch (data.status) {
    case "success":
      return "settled";
    case "failed":
    case "reversed":
      return "failed";
    default:
      return "pending";
  }
}
