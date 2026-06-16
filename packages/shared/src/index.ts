import { z } from "zod";

// ── Country / Rail config ─────────────────────────────────────────────────────

export const SUPPORTED_RAILS = [
  "mpesa",
  "momo",
  "paystack",
  "wave",
  "orange_money",
  "bank",
] as const;
export type Rail = (typeof SUPPORTED_RAILS)[number];

export const SUPPORTED_TOKENS = ["USDC", "USDT"] as const;
export type Token = (typeof SUPPORTED_TOKENS)[number];

export type CountryConfig = {
  name: string;
  code: string;
  dialCode: string;
  currency: string;
  currencySymbol: string;
  primaryRail: Rail;
  fallbackRail?: Rail;
};

export const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  KE: {
    name: "Kenya",
    code: "KE",
    dialCode: "+254",
    currency: "KES",
    currencySymbol: "KSh",
    primaryRail: "mpesa",
  },
  GH: {
    name: "Ghana",
    code: "GH",
    dialCode: "+233",
    currency: "GHS",
    currencySymbol: "GH₵",
    primaryRail: "momo",
  },
  NG: {
    name: "Nigeria",
    code: "NG",
    dialCode: "+234",
    currency: "NGN",
    currencySymbol: "₦",
    primaryRail: "paystack",
  },
  SN: {
    name: "Senegal",
    code: "SN",
    dialCode: "+221",
    currency: "XOF",
    currencySymbol: "CFA",
    primaryRail: "wave",
    fallbackRail: "orange_money",
  },
  CI: {
    name: "Côte d'Ivoire",
    code: "CI",
    dialCode: "+225",
    currency: "XOF",
    currencySymbol: "CFA",
    primaryRail: "orange_money",
  },
  TZ: {
    name: "Tanzania",
    code: "TZ",
    dialCode: "+255",
    currency: "TZS",
    currencySymbol: "TSh",
    primaryRail: "mpesa",
  },
  UG: {
    name: "Uganda",
    code: "UG",
    dialCode: "+256",
    currency: "UGX",
    currencySymbol: "USh",
    primaryRail: "momo",
  },
};

export function dialCodeToCountry(phone: string): CountryConfig | null {
  const normalized = phone.replace(/\s+/g, "");
  for (const config of Object.values(COUNTRY_CONFIG)) {
    if (normalized.startsWith(config.dialCode)) return config;
  }
  return null;
}

// ── Shared Zod schemas ────────────────────────────────────────────────────────

export const PhoneSchema = z
  .string()
  .min(7)
  .max(20)
  .regex(/^\+[1-9]\d{6,18}$/, "Must be E.164 format e.g. +254712345678");

export const OtpCodeSchema = z
  .string()
  .length(6)
  .regex(/^\d{6}$/, "Must be 6 digits");

export const SendOtpSchema = z.object({
  phone: PhoneSchema,
});

export const VerifyOtpSchema = z.object({
  phone: PhoneSchema,
  code: OtpCodeSchema,
});

export const SetPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const FxQuoteRequestSchema = z.object({
  amountUsd: z.number().positive().max(10_000),
  recipientPhone: PhoneSchema,
  token: z.enum(SUPPORTED_TOKENS).default("USDC"),
});

export const SendMoneySchema = z.object({
  quoteId: z.string().uuid(),
  recipientPhone: PhoneSchema,
  amountUsd: z.number().positive().max(10_000),
  token: z.enum(SUPPORTED_TOKENS).default("USDC"),
  note: z.string().max(140).optional(),
});

export const ClaimPaymentSchema = z.object({
  ref: z.string().min(4).max(20),
  phone: PhoneSchema,
  code: OtpCodeSchema,
});

export const MerchantSettingsSchema = z.object({
  businessName: z.string().min(2).max(80),
  tillOpen: z.boolean(),
  autoSettleTo: z.string().min(7).max(20),
  settleRail: z.enum(SUPPORTED_RAILS),
  settleSchedule: z.enum(["instant", "daily", "weekly"]),
});

// ── Shared response types ─────────────────────────────────────────────────────

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export type FxQuote = {
  quoteId: string;
  fromToken: Token;
  fromAmountUsd: number;
  toAmount: number;
  toCurrency: string;
  tumaRate: number;
  midRate: number;
  savingsVsBank: number;
  rail: Rail;
  recipientCountry: string;
  lockedUntil: string;
};

export type TransactionStatus =
  | "initiated"
  | "onchain"
  | "routed"
  | "settled"
  | "failed"
  | "expired";

export type SettlementStep = {
  step: TransactionStatus;
  label: string;
  description: string;
  timestamp: string | null;
  done: boolean;
};

export type TransactionSummary = {
  id: string;
  reference: string;
  direction: "in" | "out";
  counterparty: string;
  amountUsd: number;
  amountLocal: number;
  localCurrency: string;
  fxRate: number;
  rail: Rail;
  status: TransactionStatus;
  note: string | null;
  createdAt: string;
  settledAt: string | null;
};

export type WalletAsset = {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  balanceUsd: number;
  decimals: number;
};
