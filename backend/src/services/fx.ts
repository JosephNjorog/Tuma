import { randomUUID } from "crypto";
import { setex, getJson, keys } from "../lib/redis";
import { db } from "../db";
import { fxRates } from "../db/schema";
import { dialCodeToCountry, type FxQuote, type Rail } from "@tuma/shared";
import { desc, eq } from "drizzle-orm";

const SPREAD = parseFloat(process.env.FX_SPREAD ?? "0.023");
const OXR_APP_ID = process.env.OPEN_EXCHANGE_RATES_APP_ID!;
const QUOTE_TTL_SECONDS = 35; // 30s lock + 5s grace
const RATE_CACHE_TTL = 60;

// ── Cash-out fee (flat, tiered) ────────────────────────────────────────────────
// Tiers are denominated in KES (our reference market) then converted to a USD
// equivalent using a fixed baseline rate, so the same "network fee" cost applies
// consistently regardless of the recipient's local currency.
const KES_BASELINE_RATE = 130;
const CASHOUT_FEE_TIERS_KES = [
  { maxUsd: 10, feeKes: 15 },
  { maxUsd: 50, feeKes: 30 },
  { maxUsd: Infinity, feeKes: 50 },
];

export function computeCashoutFeeUsd(amountUsd: number): number {
  const tier = CASHOUT_FEE_TIERS_KES.find((t) => amountUsd <= t.maxUsd)!;
  return parseFloat((tier.feeKes / KES_BASELINE_RATE).toFixed(4));
}

type OxrRates = { rates: Record<string, number> };

// ── Rate fetching ─────────────────────────────────────────────────────────────

async function fetchMidRates(): Promise<Record<string, number>> {
  const cached = await getJson<Record<string, number>>("fx_rates:all");
  if (cached) return cached;

  const res = await fetch(
    `https://openexchangerates.org/api/latest.json?app_id=${OXR_APP_ID}&base=USD`
  );
  if (!res.ok) throw new Error("[FX] Failed to fetch OXR rates");

  const data = (await res.json()) as OxrRates;
  const rates = data.rates;

  // Cache in Redis
  await setex("fx_rates:all", RATE_CACHE_TTL, rates);

  // Persist to DB for audit trail
  const relevantCurrencies = ["KES", "GHS", "NGN", "XOF", "TZS", "UGX"];
  for (const currency of relevantCurrencies) {
    if (rates[currency]) {
      const mid = rates[currency];
      const tuma = mid * (1 - SPREAD);
      await db
        .insert(fxRates)
        .values({
          fromCurrency: "USD",
          toCurrency: currency,
          midRate: mid.toFixed(8),
          tumaRate: tuma.toFixed(8),
          spread: SPREAD.toFixed(4),
          source: "openexchangerates",
        })
        .onConflictDoNothing();
    }
  }

  return rates;
}

export async function getMidRate(toCurrency: string): Promise<number> {
  const cacheKey = keys.fxRate(toCurrency);
  const cached = await getJson<number>(cacheKey);
  if (cached) return cached;

  const rates = await fetchMidRates();
  const rate = rates[toCurrency];
  if (!rate) throw new Error(`[FX] No rate found for ${toCurrency}`);

  await setex(cacheKey, RATE_CACHE_TTL, rate);
  return rate;
}

// ── Quote creation ────────────────────────────────────────────────────────────

type QuotePayload = FxQuote & { recipientPhone: string };

export async function createFxQuote(
  amountUsd: number,
  recipientPhone: string,
  token: "USDC" | "USDT" = "USDC"
): Promise<FxQuote> {
  const country = dialCodeToCountry(recipientPhone);
  if (!country) {
    throw new Error(`Unsupported country for phone: ${recipientPhone}`);
  }

  const midRate = await getMidRate(country.currency);
  const tumaRate = midRate * (1 - SPREAD);
  const toAmount = parseFloat((amountUsd * tumaRate).toFixed(2));

  // Estimate what a bank would charge (typically 5% worse rate)
  const bankRate = midRate * 0.95;
  const bankAmount = amountUsd * bankRate;
  const savingsVsBank = parseFloat((toAmount - bankAmount).toFixed(2));

  const quoteId = randomUUID();
  const lockedUntil = new Date(Date.now() + 30_000).toISOString();

  const quote: FxQuote = {
    quoteId,
    fromToken: token,
    fromAmountUsd: amountUsd,
    toAmount,
    toCurrency: country.currency,
    tumaRate,
    midRate,
    savingsVsBank,
    rail: country.primaryRail as Rail,
    recipientCountry: country.code,
    lockedUntil,
  };

  // Store quote in Redis with TTL — verified at send time
  await setex<QuotePayload>(
    keys.fxQuote(quoteId),
    QUOTE_TTL_SECONDS,
    { ...quote, recipientPhone }
  );

  return quote;
}

export async function consumeQuote(quoteId: string): Promise<QuotePayload> {
  const quote = await getJson<QuotePayload>(keys.fxQuote(quoteId));
  if (!quote) throw new Error("FX quote expired or not found");

  // One-time use: delete after consumption
  const { del } = await import("../lib/redis");
  await del(keys.fxQuote(quoteId));

  return quote;
}

export async function getLatestRates(): Promise<
  { currency: string; mid: number; tuma: number; savings: string }[]
> {
  const currencies = ["KES", "GHS", "NGN", "XOF", "TZS", "UGX"];
  const rates = await fetchMidRates();

  return currencies
    .filter((c) => rates[c])
    .map((c) => {
      const mid = rates[c];
      const tuma = mid * (1 - SPREAD);
      const bankRate = mid * 0.95;
      const savings = (((tuma - bankRate) / bankRate) * 100).toFixed(1);
      return { currency: c, mid, tuma, savings: `${savings}%` };
    });
}
