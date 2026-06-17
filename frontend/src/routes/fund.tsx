import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CreditCard,
  Building2,
  Wallet as WalletIcon,
  Smartphone,
  ArrowRight,
  Check,
  Copy,
  Info,
  Loader2,
  AlertCircle,
  Lock,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useAccount,
  useWriteContract,
  usePublicClient,
  useReadContract,
} from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { parseUnits } from "viem";
import { MobileFrame } from "@/components/MobileFrame";
import { api, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function friendlyPayError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/exceeds balance|insufficient funds/i.test(msg)) {
    return "Your connected wallet doesn't have enough USDC for this amount.";
  }
  if (/user rejected|denied transaction/i.test(msg)) {
    return "Cancelled in wallet.";
  }
  if (/chain mismatch|does not match the target chain/i.test(msg)) {
    return "Switch your wallet to Avalanche and try again.";
  }
  return "Payment failed. Try again.";
}

export const Route = createFileRoute("/fund")({
  head: () => ({
    meta: [
      { title: "Add money · Autopayke" },
      {
        name: "description",
        content:
          "Top up your Autopayke wallet via card, M-Pesa, bank, or crypto.",
      },
    ],
  }),
  component: Fund,
});

type Method = "card" | "mobile" | "bank" | "crypto";

// Local currency quick amounts per country
const MOBILE_CURRENCY: Record<string, { code: string; quick: number[] }> = {
  "+254": { code: "KES", quick: [100, 500, 1_000, 2_500] },
  "+255": { code: "TZS", quick: [2_000, 5_000, 10_000, 25_000] },
  "+233": { code: "GHS", quick: [20, 50, 100, 200] },
  "+256": { code: "UGX", quick: [5_000, 10_000, 25_000, 50_000] },
};

function getMobileCurrency(phone: string) {
  for (const [prefix, cfg] of Object.entries(MOBILE_CURRENCY)) {
    if (phone.startsWith(prefix)) return cfg;
  }
  return { code: "KES", quick: [100, 500, 1_000, 2_500] };
}

function fmtQuick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function Fund() {
  const navigate = useNavigate();
  const { accessToken, user, isLoggedIn } = useAuthStore();
  const [method, setMethod] = useState<Method>("card");
  const [amount, setAmount] = useState("50");
  const [stage, setStage] = useState<"pick" | "pay" | "done">("pick");
  const amt = Number(amount) || 0;

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const phone = user?.phone ?? "";
  const isKE = phone.startsWith("+254") || phone.startsWith("+255");
  const isGH = phone.startsWith("+233");
  const isUG = phone.startsWith("+256");
  const showMobile = isKE || isGH || isUG;
  const mobileCfg = getMobileCurrency(phone);

  // Fee/credit calculation
  const fee = method === "card" ? amt * 0.015 : method === "bank" ? 0.3 : 0;
  const creditedUsdc =
    method === "mobile"
      ? (
          amt /
          (mobileCfg.code === "KES"
            ? 130
            : mobileCfg.code === "GHS"
              ? 15
              : mobileCfg.code === "UGX"
                ? 3700
                : 130)
        ).toFixed(2)
      : (amt - fee).toFixed(2);

  // When switching to mobile, reset amount to a sensible local default
  function handleMethodChange(m: Method) {
    setMethod(m);
    if (m === "mobile") setAmount("500");
    else setAmount("50");
  }

  const pickAmountLabel = method === "mobile" ? mobileCfg.code : "USDC";
  const pickAmountQuick =
    method === "mobile" ? mobileCfg.quick : [20, 50, 100, 250];

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-5 pb-10">
        <header className="flex items-center justify-between">
          <button
            onClick={() =>
              stage === "pick"
                ? navigate({ to: "/dashboard" })
                : setStage("pick")
            }
            className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-bold">Add money</h1>
          <span className="w-9" />
        </header>

        {stage === "pick" && (
          <>
            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                You're funding
              </p>
              <div
                className="mt-3 rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}
              >
                <p className="text-xs opacity-90">
                  Amount in {pickAmountLabel}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-black opacity-80">
                    {pickAmountLabel}
                  </span>
                  <input
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    inputMode="decimal"
                    className="bg-transparent text-5xl font-black outline-none w-full min-w-0"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  {pickAmountQuick.map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(String(v))}
                      className={`flex-1 rounded-full py-1.5 text-xs font-semibold backdrop-blur ${amount === String(v) ? "bg-white text-foreground" : "bg-white/15"}`}
                    >
                      {fmtQuick(v)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-6 text-[10px] uppercase tracking-wider text-muted-foreground">
              Choose method
            </p>
            <div className="mt-2 space-y-2">
              <MethodCard
                active={method === "card"}
                onClick={() => handleMethodChange("card")}
                icon={CreditCard}
                title="Card payment"
                sub="Visa, Mastercard via Paystack · 1.5% fee"
                badge="Most popular"
              />
              {showMobile && (
                <MethodCard
                  active={method === "mobile"}
                  onClick={() => handleMethodChange("mobile")}
                  icon={Smartphone}
                  title="Mobile money"
                  sub={
                    isGH || isUG
                      ? "MTN MoMo via Paystack"
                      : "M-Pesa via Paystack"
                  }
                />
              )}
              <MethodCard
                active={method === "bank"}
                onClick={() => handleMethodChange("bank")}
                icon={Building2}
                title="Bank transfer"
                sub="Virtual account · $0.30 flat"
              />
              <MethodCard
                active={method === "crypto"}
                onClick={() => handleMethodChange("crypto")}
                icon={WalletIcon}
                title="Crypto deposit"
                sub="Send USDC/AVAX from Core or MetaMask"
                badge="Power user"
              />
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-xs space-y-2">
              <Row
                k="You pay"
                v={`${amt.toFixed(method === "mobile" ? 0 : 2)} ${pickAmountLabel}`}
              />
              <Row k="Fee" v={fee ? `${fee.toFixed(2)} USDC` : "Free"} />
              <div className="h-px bg-border my-1" />
              <Row k="Credited to wallet" v={`${creditedUsdc} USDC`} bold />
            </div>

            <div className="mt-auto pt-6">
              <button
                disabled={amt <= 0}
                onClick={() => setStage("pay")}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {stage === "pay" && method === "card" && (
          <PayCard
            amount={amt}
            token={accessToken!}
            onDone={() => setStage("done")}
          />
        )}
        {stage === "pay" && method === "mobile" && (
          <PayMobile
            amount={amt}
            currency={mobileCfg.code}
            token={accessToken!}
            onDone={() => setStage("done")}
          />
        )}
        {stage === "pay" && method === "bank" && (
          <PayBank token={accessToken!} onDone={() => setStage("done")} />
        )}
        {stage === "pay" && method === "crypto" && (
          <PayCrypto token={accessToken!} onDone={() => setStage("done")} />
        )}

        {stage === "done" && (
          <div className="flex-1 flex flex-col">
            <div className="mt-12 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="mt-6 text-3xl font-black">Wallet funded</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your USDC balance will update once the payment settles.
              </p>
            </div>
            <div className="mt-auto pt-6 space-y-2">
              <button
                onClick={() => navigate({ to: "/send" })}
                className="w-full rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}
              >
                Send money now
              </button>
              <button
                onClick={() => navigate({ to: "/dashboard" })}
                className="w-full rounded-2xl border border-border bg-card py-4 text-sm font-semibold"
              >
                Back to home
              </button>
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}

// ── Method card ───────────────────────────────────────────────────────────────

function MethodCard({
  active,
  onClick,
  icon: Icon,
  title,
  sub,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CreditCard;
  title: string;
  sub: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition ${active ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted/50"}`}
    >
      <div
        className={`h-11 w-11 rounded-xl flex items-center justify-center ${active ? "text-primary-foreground" : "bg-muted text-foreground"}`}
        style={active ? { background: "var(--gradient-portfolio)" } : undefined}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold">{title}</p>
          {badge && (
            <span className="text-[9px] uppercase tracking-wider bg-foreground text-background rounded-full px-1.5 py-0.5">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div
        className={`h-5 w-5 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-border"}`}
      >
        {active && <Check className="h-3 w-3 text-primary-foreground m-0.5" />}
      </div>
    </button>
  );
}

// ── Interactive card UI ───────────────────────────────────────────────────────

function formatCardNumber(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 4);
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

function cardFaceNumber(raw: string): string {
  const digits = raw.replace(/\s/g, "").padEnd(16, "•");
  return [
    digits.slice(0, 4),
    digits.slice(4, 8),
    digits.slice(8, 12),
    digits.slice(12, 16),
  ].join(" ");
}

function detectCardBrand(
  number: string,
): "visa" | "mastercard" | "amex" | "other" {
  const d = number.replace(/\s/g, "");
  if (d.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return "mastercard";
  if (/^3[47]/.test(d)) return "amex";
  return "other";
}

function CardBrandLogo({
  brand,
}: {
  brand: ReturnType<typeof detectCardBrand>;
}) {
  if (brand === "visa")
    return (
      <span
        className="text-white font-black text-lg italic tracking-tight"
        style={{ fontFamily: "serif" }}
      >
        VISA
      </span>
    );
  if (brand === "mastercard")
    return (
      <svg viewBox="0 0 38 24" width="38" height="24">
        <circle cx="13" cy="12" r="12" fill="rgba(255,255,255,0.35)" />
        <circle cx="25" cy="12" r="12" fill="rgba(255,255,255,0.2)" />
      </svg>
    );
  return <CreditCard className="h-6 w-6 text-white/50" />;
}

function MockCard({
  number,
  name,
  expiry,
  cvv,
  flipped,
}: {
  number: string;
  name: string;
  expiry: string;
  cvv: string;
  flipped: boolean;
}) {
  const brand = detectCardBrand(number);

  const wrapperStyle: React.CSSProperties = {
    perspective: "1000px",
    height: "192px",
    position: "relative",
  };
  const innerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    transition: "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
    transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
  };
  const faceStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "1rem",
    backfaceVisibility: "hidden",
    overflow: "hidden",
    background: "var(--gradient-portfolio)",
  };
  const backStyle: React.CSSProperties = {
    ...faceStyle,
    transform: "rotateY(180deg)",
  };

  return (
    <div style={wrapperStyle}>
      <div style={innerStyle}>
        {/* Front */}
        <div style={faceStyle} className="p-5 shadow-(--shadow-elegant)">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -left-6 -bottom-10 h-28 w-28 rounded-full bg-black/10 blur-2xl pointer-events-none" />
          <div className="relative flex justify-between items-start">
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
              Autopayke
            </p>
            <CardBrandLogo brand={brand} />
          </div>
          {/* Chip */}
          <div className="relative mt-3 h-7 w-10 rounded-md bg-white/30 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-1.5 w-2 rounded-sm bg-white/50" />
              ))}
            </div>
          </div>
          <p className="relative mt-3 font-mono text-base font-bold text-white tracking-widest leading-none">
            {cardFaceNumber(number)}
          </p>
          <div className="relative mt-3 flex items-end justify-between">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-[8px] uppercase text-white/40 mb-0.5">
                Card holder
              </p>
              <p className="text-xs font-semibold text-white uppercase truncate">
                {name || "YOUR NAME"}
              </p>
            </div>
            <div>
              <p className="text-[8px] uppercase text-white/40 mb-0.5">
                Expires
              </p>
              <p className="text-xs font-semibold text-white">
                {expiry || "MM/YY"}
              </p>
            </div>
          </div>
        </div>

        {/* Back */}
        <div style={backStyle} className="shadow-(--shadow-elegant)">
          <div className="mt-8 h-10 w-full bg-black/60" />
          <div className="mt-4 px-5">
            <div className="flex items-center gap-3">
              <div
                className="flex-1 h-9 rounded bg-white/20"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0px,rgba(255,255,255,.07) 4px,transparent 4px,transparent 8px)",
                }}
              />
              <div className="h-9 w-20 rounded bg-white flex items-center justify-center">
                <p className="text-sm font-bold text-gray-800 font-mono tracking-widest">
                  {cvv || "•••"}
                </p>
              </div>
            </div>
            <p className="mt-1 text-[9px] text-white/40 text-right uppercase tracking-widest">
              CVV / CVC
            </p>
          </div>
          <p className="mt-6 text-center text-[9px] text-white/30 uppercase tracking-widest">
            Autopayke · Powered by Paystack
          </p>
        </div>
      </div>
    </div>
  );
}

function PayCard({
  amount,
  token,
  onDone,
}: {
  amount: number;
  token: string;
  onDone: () => void;
}) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cvvFocused, setCvvFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allFilled =
    cardNumber.replace(/\s/g, "").length >= 15 &&
    cardName.trim().length >= 2 &&
    cardExpiry.length === 5 &&
    cardCvv.length >= 3;

  async function handlePay() {
    if (!allFilled) {
      setError("Please fill in all card details");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await api.fund.card(amount, token);
      window.location.href = result.authorizationUrl;
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Payment failed. Try again.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col mt-6">
      {/* Mock card */}
      <MockCard
        number={cardNumber}
        name={cardName}
        expiry={cardExpiry}
        cvv={cardCvv}
        flipped={cvvFocused}
      />

      {/* Form */}
      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Card number
          </p>
          <input
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            placeholder="1234 5678 9012 3456"
            inputMode="numeric"
            maxLength={19}
            className="mt-1 w-full bg-transparent text-sm font-mono font-semibold outline-none placeholder:text-muted-foreground/40"
          />
        </div>

        <div className="rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Cardholder name
          </p>
          <input
            value={cardName}
            onChange={(e) => setCardName(e.target.value.toUpperCase())}
            placeholder="JOHN DOE"
            autoCapitalize="characters"
            className="mt-1 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/40"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1 rounded-2xl border border-border bg-card p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Expiry
            </p>
            <input
              value={cardExpiry}
              onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
              placeholder="MM/YY"
              inputMode="numeric"
              maxLength={5}
              className="mt-1 w-full bg-transparent text-sm font-mono font-semibold outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="flex-1 rounded-2xl border border-border bg-card p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              CVV
            </p>
            <input
              value={cardCvv}
              onChange={(e) =>
                setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              onFocus={() => setCvvFocused(true)}
              onBlur={() => setCvvFocused(false)}
              placeholder="•••"
              inputMode="numeric"
              maxLength={4}
              type="password"
              className="mt-1 w-full bg-transparent text-sm font-mono font-semibold outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-auto pt-5">
        <button
          onClick={handlePay}
          disabled={loading || !allFilled}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant) disabled:opacity-40"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {loading ? "Processing…" : `Pay ${amount.toFixed(2)} USDC`}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Secured by Paystack · PCI DSS compliant
        </p>
      </div>
    </div>
  );
}

// ── Mobile money ──────────────────────────────────────────────────────────────

function PayMobile({
  amount,
  currency,
  token,
  onDone,
}: {
  amount: number;
  currency: string;
  token: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setError(null);
    setLoading(true);
    try {
      const result = await api.fund.mobile(amount, token);
      setDisplayText(result.displayText);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Failed to initiate mobile money. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (displayText) {
    return (
      <div className="flex-1 flex flex-col mt-6">
        <div className="flex flex-col items-center text-center">
          <div className="h-20 w-20 rounded-full bg-warning-soft flex items-center justify-center">
            <Smartphone className="h-10 w-10 text-warning" />
          </div>
          <h2 className="mt-5 text-2xl font-black">Check your phone</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            {displayText}
          </p>
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            What happens next
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">1.</span> Approve
              the {currency} {amount.toLocaleString()} payment prompt
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">2.</span> We
              receive confirmation from Paystack
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">3.</span> USDC is
              credited to your Autopayke wallet
            </li>
          </ul>
        </div>
        <div className="mt-auto pt-6">
          <button
            onClick={onDone}
            className="w-full rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
            style={{ background: "var(--gradient-portfolio)" }}
          >
            I've approved the prompt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col mt-6">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Mobile money
      </p>
      <h2 className="mt-2 text-2xl font-black">
        {currency} {amount.toLocaleString()} via M-Pesa / MoMo
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        A payment prompt will be sent to your registered mobile money number.
      </p>
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 flex items-start gap-2">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">
          Powered by Paystack. The STK push goes to your registered phone number
          on file.
        </p>
      </div>
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <div className="mt-auto pt-6">
        <button
          onClick={handlePay}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant) disabled:opacity-60"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Smartphone className="h-4 w-4" />
          )}
          {loading
            ? "Sending prompt…"
            : `Send ${currency} ${amount.toLocaleString()} payment prompt`}
        </button>
      </div>
    </div>
  );
}

// ── Bank transfer ─────────────────────────────────────────────────────────────

function PayBank({ token, onDone }: { token: string; onDone: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-bank"],
    queryFn: () => api.fund.bank(token),
    enabled: !!token,
  });

  return (
    <div className="flex-1 flex flex-col mt-6">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Bank transfer
      </p>
      <h2 className="mt-2 text-2xl font-black">Send to virtual account</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        We auto-detect your payment and credit your wallet.
      </p>
      {isLoading && (
        <div className="mt-5 h-40 rounded-3xl bg-card border border-border animate-pulse" />
      )}
      {error && (
        <p className="mt-4 text-xs text-destructive">
          Couldn't load bank details.
        </p>
      )}
      {data && (
        <div className="mt-5 rounded-3xl border border-border bg-card divide-y divide-border">
          <Row k="Bank" v={data.bankName} />
          <Row k="Account name" v={data.accountName} />
          <Row k="Account number" v={data.accountNumber} mono />
          <Row k="Reference" v={data.routingReference} mono />
          <Row k="Fee" v={data.fee ? `$${data.fee.toFixed(2)}` : "Free"} />
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground text-center">
        Reference is auto-detected for instant credit.
      </p>
      <div className="mt-auto pt-6">
        <button
          onClick={onDone}
          className="w-full rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          I've sent the transfer
        </button>
      </div>
    </div>
  );
}

// ── Crypto deposit ────────────────────────────────────────────────────────────

type PayStep = "idle" | "sending" | "confirming" | "recording" | "error";

function PayCrypto({ token, onDone }: { token: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("25");
  const [payStep, setPayStep] = useState<PayStep>("idle");
  const [payError, setPayError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fund-crypto"],
    queryFn: () => api.fund.crypto(token),
    enabled: !!token,
  });
  const address = data?.walletAddress ?? null;

  const { open } = useAppKit();
  const { address: connectedAddress, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const { data: connectedBalanceRaw } = useReadContract({
    address: data?.usdcAddress as `0x${string}` | undefined,
    abi: ERC20_TRANSFER_ABI,
    functionName: "balanceOf",
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: data?.chainId,
    query: {
      enabled: isConnected && !!connectedAddress && !!data?.usdcAddress,
    },
  });
  const connectedBalanceUsd =
    connectedBalanceRaw !== undefined
      ? Number(connectedBalanceRaw) / 1e6
      : null;
  const amountUsd = parseFloat(amount) || 0;
  const insufficientBalance =
    isConnected &&
    connectedBalanceUsd !== null &&
    amountUsd > connectedBalanceUsd;

  function copy(s: string) {
    navigator.clipboard?.writeText(s);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handlePayWithWallet() {
    if (!address || !data) return;
    if (!isConnected) {
      open();
      return;
    }

    const amountUsd = parseFloat(amount);
    if (!amountUsd || amountUsd <= 0) return;

    setPayError(null);
    setPayStep("sending");
    try {
      const hash = await writeContractAsync({
        address: data.usdcAddress as `0x${string}`,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [address as `0x${string}`, parseUnits(amount, 6)],
        chainId: data.chainId,
      });

      setPayStep("confirming");
      await publicClient?.waitForTransactionReceipt({ hash });

      setPayStep("recording");
      await api.fund.confirmCrypto(hash, token);

      onDone();
    } catch (e) {
      setPayError(friendlyPayError(e));
      setPayStep("error");
    }
  }

  const paying =
    payStep === "sending" ||
    payStep === "confirming" ||
    payStep === "recording";
  const payLabel: Record<PayStep, string> = {
    idle: isConnected ? "Pay with connected wallet" : "Connect wallet to pay",
    sending: "Approve in your wallet…",
    confirming: "Confirming on-chain…",
    recording: "Recording deposit…",
    error: "Try again",
  };

  return (
    <div className="flex-1 flex flex-col mt-6">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Crypto deposit
      </p>
      <h2 className="mt-2 text-2xl font-black">Send to your smart wallet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        USDC, USDT, or AVAX on Avalanche C-Chain.
      </p>
      {isLoading && (
        <div className="mt-5 h-24 rounded-3xl bg-card border border-border animate-pulse" />
      )}

      {address && (
        <>
          {/* Active flow — connect wallet and approve an exact amount */}
          <div className="mt-5 rounded-3xl border border-primary/30 bg-primary-soft/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-primary" /> Pay with a connected
              wallet
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-lg font-black">$</span>
              <input
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                }
                inputMode="decimal"
                disabled={paying}
                className="flex-1 bg-transparent text-2xl font-black outline-none disabled:opacity-50"
              />
              <span className="text-xs font-semibold text-muted-foreground">
                USDC
              </span>
            </div>
            {isConnected && connectedBalanceUsd !== null && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Connected wallet balance: {connectedBalanceUsd.toFixed(2)} USDC
              </p>
            )}
            <button
              onClick={handlePayWithWallet}
              disabled={
                paying || !amount || amountUsd <= 0 || insufficientBalance
              }
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 shadow-(--shadow-elegant)"
              style={{ background: "var(--gradient-portfolio)" }}
            >
              {paying && <Loader2 className="h-4 w-4 animate-spin" />}
              {payLabel[payStep]}
            </button>
            {insufficientBalance && !payError && (
              <p className="mt-2 text-[11px] text-destructive text-center">
                Connected wallet only has {connectedBalanceUsd?.toFixed(2)} USDC
                — reduce the amount or fund that wallet first.
              </p>
            )}
            {payError && (
              <p className="mt-2 text-[11px] text-destructive text-center">
                {payError}
              </p>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground text-center">
              Opens MetaMask, Core, or scan with any WalletConnect-compatible
              wallet.
            </p>
          </div>

          <div className="my-4 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or send manually{" "}
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Manual flow — paste the address into any wallet */}
          <div className="rounded-3xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Avalanche C-Chain address
            </p>
            <p className="mt-1 text-sm font-mono break-all">{address}</p>
            <button
              onClick={() => copy(address)}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-muted py-2.5 text-xs font-semibold"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Address copied" : "Copy address"}
            </button>
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] text-warning text-center font-semibold">
        Only send on Avalanche C-Chain. Other networks = lost funds.
      </p>
      <div className="mt-auto pt-6">
        <button
          onClick={onDone}
          className="w-full rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          I've sent the deposit
        </button>
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  bold,
}: {
  k: string;
  v: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {k}
      </span>
      <span
        className={`text-xs ${mono ? "font-mono" : ""} ${bold ? "font-black text-sm" : "font-semibold"}`}
      >
        {v}
      </span>
    </div>
  );
}
