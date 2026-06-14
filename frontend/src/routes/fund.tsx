import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, Building2, Wallet as WalletIcon, Smartphone, ArrowRight, Check, Copy, Info, Loader2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "@/components/MobileFrame";
import { api, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/fund")({
  head: () => ({ meta: [{ title: "Add money · TUMA" }, { name: "description", content: "Top up your TUMA wallet via card, M-Pesa, bank, or crypto." }] }),
  component: Fund,
});

type Method = "card" | "mobile" | "bank" | "crypto";

function Fund() {
  const navigate = useNavigate();
  const { accessToken, user, isLoggedIn } = useAuthStore();
  const [method, setMethod] = useState<Method>("card");
  const [amount, setAmount] = useState("50");
  const [stage, setStage] = useState<"pick" | "pay" | "done">("pick");
  const amt = Number(amount) || 0;
  const fee = method === "card" ? amt * 0.015 : method === "bank" ? 0.3 : 0;

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const phone = user?.phone ?? "";
  const isKE = phone.startsWith("+254") || phone.startsWith("+255");
  const isGH = phone.startsWith("+233");
  const isUG = phone.startsWith("+256");
  const showMobile = isKE || isGH || isUG;

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-5 pb-10">
        <header className="flex items-center justify-between">
          <button onClick={() => stage === "pick" ? navigate({ to: "/dashboard" }) : setStage("pick")}
            className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-bold">Add money</h1>
          <span className="w-9" />
        </header>

        {stage === "pick" && (
          <>
            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">You're funding</p>
              <div className="mt-3 rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>
                <p className="text-xs opacity-90">Amount in USD</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black opacity-80">$</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal" className="bg-transparent text-5xl font-black outline-none w-full" />
                </div>
                <div className="mt-3 flex gap-2">
                  {["20","50","100","250"].map((v) => (
                    <button key={v} onClick={() => setAmount(v)} className={`flex-1 rounded-full py-1.5 text-xs font-semibold backdrop-blur ${amount===v ? "bg-white text-foreground" : "bg-white/15"}`}>${v}</button>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-6 text-[10px] uppercase tracking-wider text-muted-foreground">Choose method</p>
            <div className="mt-2 space-y-2">
              <MethodCard active={method==="card"} onClick={() => setMethod("card")} icon={CreditCard} title="Card payment" sub="Visa, Mastercard via Paystack · 1.5% fee" badge="Most popular" />
              {showMobile && <MethodCard active={method==="mobile"} onClick={() => setMethod("mobile")} icon={Smartphone} title="Mobile money" sub={isGH || isUG ? "MTN MoMo via Paystack" : "M-Pesa via Paystack"} />}
              <MethodCard active={method==="bank"} onClick={() => setMethod("bank")} icon={Building2} title="Bank transfer" sub="Virtual account · $0.30 flat" />
              <MethodCard active={method==="crypto"} onClick={() => setMethod("crypto")} icon={WalletIcon} title="Crypto deposit" sub="Send USDC/AVAX from Core or MetaMask" badge="Power user" />
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-xs space-y-2">
              <Row k="You pay" v={`$${amt.toFixed(2)}`} />
              <Row k="Fee" v={fee ? `$${fee.toFixed(2)}` : "Free"} />
              <div className="h-px bg-border my-1" />
              <Row k="Credited to wallet" v={`${(amt - fee).toFixed(2)} USDC`} bold />
            </div>

            <div className="mt-auto pt-6">
              <button disabled={amt <= 0} onClick={() => setStage("pay")}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}>
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {stage === "pay" && method === "card" && <PayCard amount={amt} token={accessToken!} onDone={() => setStage("done")} />}
        {stage === "pay" && method === "mobile" && <PayMobile amount={amt} token={accessToken!} onDone={() => setStage("done")} />}
        {stage === "pay" && method === "bank" && <PayBank token={accessToken!} onDone={() => setStage("done")} />}
        {stage === "pay" && method === "crypto" && <PayCrypto token={accessToken!} onDone={() => setStage("done")} />}

        {stage === "done" && (
          <div className="flex-1 flex flex-col">
            <div className="mt-12 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="mt-6 text-3xl font-black">Wallet funded</h2>
              <p className="mt-2 text-sm text-muted-foreground">Your USDC balance will update once the payment settles.</p>
            </div>
            <div className="mt-auto pt-6 space-y-2">
              <button onClick={() => navigate({ to: "/send" })} className="w-full rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>Send money now</button>
              <button onClick={() => navigate({ to: "/dashboard" })} className="w-full rounded-2xl border border-border bg-card py-4 text-sm font-semibold">Back to home</button>
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}

function MethodCard({ active, onClick, icon: Icon, title, sub, badge }: { active: boolean; onClick: () => void; icon: typeof CreditCard; title: string; sub: string; badge?: string }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition ${active ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted/50"}`}>
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${active ? "text-primary-foreground" : "bg-muted text-foreground"}`} style={active ? { background: "var(--gradient-portfolio)" } : undefined}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold">{title}</p>
          {badge && <span className="text-[9px] uppercase tracking-wider bg-foreground text-background rounded-full px-1.5 py-0.5">{badge}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className={`h-5 w-5 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-border"}`}>
        {active && <Check className="h-3 w-3 text-primary-foreground m-0.5" />}
      </div>
    </button>
  );
}

function PayCard({ amount, token, onDone }: { amount: number; token: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setError(null);
    setLoading(true);
    try {
      const result = await api.fund.card(amount, token);
      window.location.href = result.authorizationUrl;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Payment failed. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col mt-6">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Pay with card</p>
      <h2 className="mt-2 text-2xl font-black">${amount.toFixed(2)} via Paystack</h2>
      <div className="mt-4 rounded-2xl border border-border bg-card p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">You'll be redirected to Paystack's secure card payment page. Your TUMA wallet is credited once payment settles.</p>
      </div>
      {error && <div className="mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <div className="mt-auto pt-6">
        <button onClick={handlePay} disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant) disabled:opacity-60"
          style={{ background: "var(--gradient-portfolio)" }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Redirecting…" : `Pay $${amount.toFixed(2)} with card`}
        </button>
      </div>
    </div>
  );
}

function PayMobile({ amount, token, onDone }: { amount: number; token: string; onDone: () => void }) {
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
      setError(e instanceof ApiError ? e.message : "Failed to initiate mobile money. Try again.");
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
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">{displayText}</p>
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">What happens next</p>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">1.</span> Approve the payment prompt on your phone</li>
            <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">2.</span> We receive confirmation from Paystack</li>
            <li className="flex items-start gap-2"><span className="text-primary font-bold mt-0.5">3.</span> USDC is credited to your TUMA wallet</li>
          </ul>
        </div>
        <div className="mt-auto pt-6">
          <button onClick={onDone} className="w-full rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>
            I've approved the prompt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col mt-6">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Mobile money</p>
      <h2 className="mt-2 text-2xl font-black">${amount.toFixed(2)} via M-Pesa / MoMo</h2>
      <p className="mt-2 text-sm text-muted-foreground">A payment prompt will be sent to your registered mobile money number.</p>
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 flex items-start gap-2">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">Powered by Paystack. Your phone number on file: <span className="font-semibold text-foreground">{token ? "••••" : "—"}</span></p>
      </div>
      {error && <div className="mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <div className="mt-auto pt-6">
        <button onClick={handlePay} disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant) disabled:opacity-60"
          style={{ background: "var(--gradient-portfolio)" }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
          {loading ? "Sending prompt…" : "Send payment prompt"}
        </button>
      </div>
    </div>
  );
}

function PayBank({ token, onDone }: { token: string; onDone: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-bank"],
    queryFn: () => api.fund.bank(token),
    enabled: !!token,
  });

  return (
    <div className="flex-1 flex flex-col mt-6">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Bank transfer</p>
      <h2 className="mt-2 text-2xl font-black">Send to virtual account</h2>
      <p className="mt-2 text-sm text-muted-foreground">Use these details. We auto-detect your payment and credit your wallet.</p>
      {isLoading && <div className="mt-5 h-40 rounded-3xl bg-card border border-border animate-pulse" />}
      {error && <p className="mt-4 text-xs text-destructive">Couldn't load bank details. Pull to refresh.</p>}
      {data && (
        <div className="mt-5 rounded-3xl border border-border bg-card divide-y divide-border">
          <Row k="Bank" v={data.bankName} />
          <Row k="Account name" v={data.accountName} />
          <Row k="Account number" v={data.accountNumber} mono />
          <Row k="Reference" v={data.routingReference} mono />
          <Row k="Fee" v={data.fee ? `$${data.fee.toFixed(2)}` : "Free"} />
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground text-center">Reference is auto-detected for instant credit.</p>
      <div className="mt-auto pt-6">
        <button onClick={onDone} className="w-full rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>I've sent the transfer</button>
      </div>
    </div>
  );
}

function PayCrypto({ token, onDone }: { token: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["fund-crypto"],
    queryFn: () => api.fund.crypto(token),
    enabled: !!token,
  });
  const address = data?.walletAddress ?? null;

  function copy(s: string) { navigator.clipboard?.writeText(s); setCopied(true); setTimeout(() => setCopied(false), 1500); }

  return (
    <div className="flex-1 flex flex-col mt-6">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Crypto deposit</p>
      <h2 className="mt-2 text-2xl font-black">Send to your smart wallet</h2>
      <p className="mt-2 text-sm text-muted-foreground">USDC, USDT, or AVAX on Avalanche C-Chain.</p>
      {isLoading && <div className="mt-5 h-24 rounded-3xl bg-card border border-border animate-pulse" />}
      {address && (
        <div className="mt-5 rounded-3xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avalanche C-Chain address</p>
          <p className="mt-1 text-sm font-mono break-all">{address}</p>
          <button onClick={() => copy(address)} className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-muted py-2.5 text-xs font-semibold">
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Address copied" : "Copy address"}
          </button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-warning text-center font-semibold">Only send on Avalanche C-Chain. Other networks = lost funds.</p>
      <div className="mt-auto pt-6">
        <button onClick={onDone} className="w-full rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>I've sent the deposit</button>
      </div>
    </div>
  );
}

function Row({ k, v, mono, bold }: { k: string; v: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${bold ? "font-black text-sm" : "font-semibold"}`}>{v}</span>
    </div>
  );
}
