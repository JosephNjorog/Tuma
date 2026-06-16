/**
 * Africa's Talking SMS service.
 *
 * Demo mode (AT_API_KEY / AT_USERNAME not set):
 *   OTP is printed to the server console. Check Render logs.
 *
 * Sandbox mode (AT_ENV=sandbox):
 *   Messages appear in the AT sandbox simulator — not delivered to real phones.
 *   Username must be "sandbox", API key from sandbox dashboard.
 *
 * Production (AT_ENV=production):
 *   Real SMS delivered. Set AT_SENDER_ID to your approved alphanumeric sender.
 */

const AT_API_KEY = process.env.AT_API_KEY;
const AT_USERNAME = process.env.AT_USERNAME;
const AT_SENDER_ID = process.env.AT_SENDER_ID;
const IS_PRODUCTION = process.env.AT_ENV === "production";

const SMS_URL = IS_PRODUCTION
  ? "https://api.africastalking.com/version1/messaging"
  : "https://api.sandbox.africastalking.com/version1/messaging";

const DEMO_MODE = !AT_API_KEY || !AT_USERNAME;

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const message = `Your Autopayke code is ${otp}. Valid for 5 minutes. Never share this with anyone.`;

  if (DEMO_MODE) {
    console.log(`\n[SMS DEMO] ──────────────────────────────`);
    console.log(`[SMS DEMO] OTP for ${phone}: ${otp}`);
    console.log(`[SMS DEMO] ──────────────────────────────\n`);
    return;
  }

  const params = new URLSearchParams({
    username: AT_USERNAME!,
    to: phone,
    message,
  });
  if (AT_SENDER_ID) params.set("from", AT_SENDER_ID);

  const res = await fetch(SMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      apiKey: AT_API_KEY!,
    },
    body: params.toString(),
  });

  const json = await res.json() as {
    SMSMessageData: { Recipients: Array<{ status: string; number: string }> };
  };

  if (!res.ok) {
    throw new Error(`[SMS] AT error ${res.status}: ${JSON.stringify(json)}`);
  }

  const recipients = json.SMSMessageData?.Recipients ?? [];
  const failed = recipients.filter((r) => !["Success", "Sent"].includes(r.status));
  if (failed.length > 0) {
    throw new Error(`[SMS] Delivery failed for: ${failed.map((r) => r.number).join(", ")}`);
  }

  console.log(`[SMS] OTP sent to ${phone} (${IS_PRODUCTION ? "live" : "sandbox"})`);
}

export async function sendClaimSms(
  recipientPhone: string,
  senderDisplay: string,
  amount: string,
  currency: string,
  claimUrl: string
): Promise<void> {
  const message = `${senderDisplay} sent you ${amount} ${currency} via Autopayke. Claim it here: ${claimUrl}`;

  if (DEMO_MODE) {
    console.log(`[SMS DEMO] Claim SMS for ${recipientPhone}: ${message}`);
    return;
  }

  const params = new URLSearchParams({
    username: AT_USERNAME!,
    to: recipientPhone,
    message,
  });
  if (AT_SENDER_ID) params.set("from", AT_SENDER_ID);

  await fetch(SMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      apiKey: AT_API_KEY!,
    },
    body: params.toString(),
  });
}
