/**
 * Africa's Talking WhatsApp Business API.
 * Template messages must be pre-approved by Meta before use.
 * Sandbox mode returns success without actually sending — flip AT_ENV=production to go live.
 */

const AT_API_KEY = process.env.AT_API_KEY!;
const AT_USERNAME = process.env.AT_USERNAME!;
const AT_SENDER = process.env.AT_WHATSAPP_SENDER!;
const AT_OTP_TEMPLATE = process.env.AT_WHATSAPP_OTP_TEMPLATE ?? "tuma_otp";

const BASE_URL = "https://content.africastalking.com/version1/messaging/whatsapp";

type SendTemplateParams = {
  to: string;
  templateName: string;
  params: string[];
};

async function sendTemplate({ to, templateName, params }: SendTemplateParams): Promise<void> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      apiKey: AT_API_KEY,
    },
    body: JSON.stringify({
      username: AT_USERNAME,
      to,
      from: AT_SENDER,
      template: {
        name: templateName,
        params,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[WhatsApp] Africa's Talking error ${res.status}: ${body}`);
  }
}

/**
 * Sends a 6-digit OTP via WhatsApp.
 * Template: "Your TUMA code is {{1}}. Valid for 5 minutes. Never share this."
 */
export async function sendOtpWhatsApp(phone: string, otp: string): Promise<void> {
  await sendTemplate({
    to: phone,
    templateName: AT_OTP_TEMPLATE,
    params: [otp],
  });
  console.log(`[WhatsApp] OTP sent to ${phone}`);
}

/**
 * Sends a claim link to a non-TUMA user.
 * Template: "{{1}} sent you {{2}} {{3}} on TUMA. Claim it here: {{4}}"
 */
export async function sendClaimLink(
  recipientPhone: string,
  senderName: string,
  amount: string,
  currency: string,
  claimUrl: string
): Promise<void> {
  await sendTemplate({
    to: recipientPhone,
    templateName: "tuma_claim_link",
    params: [senderName, amount, currency, claimUrl],
  });
  console.log(`[WhatsApp] Claim link sent to ${recipientPhone}`);
}

/**
 * Sends a payment received notification.
 * Template: "You received {{1}} {{2}} from {{3}} on TUMA."
 */
export async function sendReceivedNotification(
  recipientPhone: string,
  amount: string,
  currency: string,
  senderDisplay: string
): Promise<void> {
  await sendTemplate({
    to: recipientPhone,
    templateName: "tuma_received",
    params: [amount, currency, senderDisplay],
  });
}
