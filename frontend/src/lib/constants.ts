import type { CountryConfig } from "@/types";

export const SUPPORTED_COUNTRIES: readonly CountryConfig[] = [
  { code: "KE", name: "Kenya", dial: "+254", rail: "M-Pesa", phoneLength: 9 },
  { code: "GH", name: "Ghana", dial: "+233", rail: "MTN MoMo", phoneLength: 9 },
  { code: "NG", name: "Nigeria", dial: "+234", rail: "Paystack", phoneLength: 10 },
  { code: "SN", name: "Senegal", dial: "+221", rail: "Wave", phoneLength: 9 },
  { code: "TZ", name: "Tanzania", dial: "+255", rail: "M-Pesa TZ", phoneLength: 9 },
  { code: "UG", name: "Uganda", dial: "+256", rail: "MTN MoMo", phoneLength: 9 },
] as const;

export const PIN_LENGTH = 4;
export const OTP_LENGTH = 6;
export const OTP_RESEND_SECONDS = 60;
export const MAX_PIN_ATTEMPTS = 5;
export const WALLET_POLL_INTERVAL_MS = 3000;
export const BALANCE_STALE_TIME_MS = 30000;
export const TRANSACTIONS_STALE_TIME_MS = 10000;
