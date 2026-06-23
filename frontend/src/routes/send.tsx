import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Search, UserPlus, Check, ArrowRight, Sparkles,
  Loader2, Lock, Send as SendIcon, MessageCircle, AlertCircle, BookUser,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "@/components/MobileFrame";
import { countries, midRates, type Contact } from "@/lib/tuma-data";
import { api, type FxQuote, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

type SendSearch = { to?: string; amount?: string };

export const Route = createFileRoute("/send")({
  head: () => ({ meta: [{ title: "Send · Autopayke" }, { name: "description", content: "Send money to any African phone number." }] }),
  validateSearch: (search: Record<string, unknown>): SendSearch => ({
    to: typeof search.to === "string" ? search.to : undefined,
    amount: typeof search.amount === "string" ? search.amount : undefined,
  }),
  component: SendPage,
});

type Step = "pick" | "amount" | "review" | "sending" | "done";

function dialToFlag(msisdn: string) {
  const norm = msisdn.startsWith("+") ? msisdn : "+" + msisdn;
  const c = countries.find((c) => norm.startsWith(c.dial));
  return c?.flag ?? "🌍";
}

function getLocalCurrency(msisdn: string) {
  const norm = msisdn.replace(/\s/g, "").replace(/^00/, "+");
  const c = countries.find((cc) => norm.startsWith(cc.dial));
  if (!c) return null;
  const m = midRates[c.code];
  return m ? { currency: m.ccy, rate: m.rate, code: c.code } : null;
}

function SendPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { accessToken, isLoggedIn } = useAuthStore();
  const [step, setStep] = useState<Step>("pick");
  const [recipient, setRecipient] = useState<Contact | null>(null);
  const [amount, setAmount] = useState("25"); // always USDC
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [sendResult, setSendResult] = useState<{
    id: string; type: "direct" | "escrow"; rail: string; amountLocal: number; localCurrency: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usd = Number(amount) || 0;

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  // Arrived from a scanned QR (or a deep link) with a recipient pre-filled.
  useEffect(() => {
    if (!search.to) return;
    const country = countries.find((c) => search.to!.startsWith(c.dial));
    setRecipient({ id: "scanned", name: search.to, msisdn: search.to, country: country?.name ?? "", flag: country?.flag ?? "🌍", rail: "" });
    if (search.amount) setAmount(search.amount);
    setStep("amount");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.wallet.get(accessToken!),
    enabled: !!accessToken,
  });

  const maxUsdc = wallet?.assets?.find((a) => a.symbol === "USDC")
    ? parseFloat(wallet.assets.find((a) => a.symbol === "USDC")!.balance)
    : 0;

  async function handleQuoteAndReview() {
    if (!recipient || !accessToken || usd <= 0) return;
    setError(null);
    setStep("sending");
    try {
      const q = await api.fx.quote(usd, recipient.msisdn, accessToken);
      setQuote(q);
      setStep("review");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't get quote. Try again.");
      setStep("amount");
    }
  }

  async function handleSend() {
    if (!quote || !recipient || !accessToken) return;
    setError(null);
    setStep("sending");
    try {
      const result = await api.send.send(
        { quoteId: quote.quoteId, recipientPhone: recipient.msisdn, amountUsd: usd, note: note || undefined },
        accessToken,
      );
      setSendResult({ id: result.transactionId, type: result.type, rail: result.rail, amountLocal: result.amountLocal, localCurrency: result.localCurrency });
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Send failed. Try again.");
      setStep("review");
    }
  }

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-4 flex items-center justify-between">
          <button
            onClick={() => {
              if (step === "pick") navigate({ to: "/dashboard" });
              else if (step === "amount") setStep("pick");
              else if (step === "review") setStep("amount");
              else navigate({ to: "/dashboard" });
            }}
            className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-bold">
            {step === "pick" && "Send money"}
            {step === "amount" && "Enter amount"}
            {step === "review" && "Review & confirm"}
            {(step === "sending" || step === "done") && "Sending"}
          </h1>
          <div className="w-9" />
        </header>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}

        {step === "pick" && (
          <PickRecipient accessToken={accessToken} onPick={(c) => { setRecipient(c); setStep("amount"); }} />
        )}

        {step === "amount" && recipient && (
          <AmountStep
            recipient={recipient} amount={amount} setAmount={setAmount}
            usd={usd} maxUsdc={maxUsdc} quote={quote}
            onNext={handleQuoteAndReview}
          />
        )}

        {step === "review" && recipient && quote && (
          <ReviewStep
            recipient={recipient} usd={usd} quote={quote}
            note={note} setNote={setNote} onSend={handleSend}
          />
        )}

        {step === "sending" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 rounded-full opacity-40 blur-2xl" style={{ background: "var(--gradient-portfolio)" }} />
              <div className="relative h-full w-full rounded-full flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-black">
              {quote ? `Sending to ${recipient?.msisdn.slice(-4)}` : "Getting quote…"}
            </h2>
            {quote && <p className="mt-2 text-xs text-muted-foreground">Broadcasting on Avalanche → routing to {quote.rail}</p>}
          </div>
        )}

        {step === "done" && sendResult && recipient && (
          <div className="flex-1 flex flex-col p-5">
            <div className="mt-8 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="mt-6 text-3xl font-black">{sendResult.type === "direct" ? "Sent!" : "Link sent!"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {sendResult.type === "direct"
                  ? `${sendResult.localCurrency} ${sendResult.amountLocal.toLocaleString("en-US", { maximumFractionDigits: 2 })} is settling via ${sendResult.rail}.`
                  : `We texted ${recipient.msisdn} a claim link. Funds stay in escrow until they verify their number.`}
              </p>
            </div>

            {sendResult.type === "escrow" && (
              <div className="mt-6 rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
                <MessageCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">SMS preview</p>
                  <p className="mt-1 text-[11px] text-muted-foreground italic">
                    "Someone sent you {sendResult.localCurrency} {sendResult.amountLocal.toFixed(2)} on Autopayke. Tap to claim: autopayke.com/claim/…"
                  </p>
                </div>
              </div>
            )}

            <div className="mt-auto pt-6 space-y-2">
              <Link to="/track/$id" params={{ id: sendResult.id }}
                className="w-full block text-center rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}>
                Track settlement
              </Link>
              <Link to="/dashboard" className="w-full block text-center rounded-2xl border border-border bg-card py-4 text-sm font-semibold">
                Back to home
              </Link>
            </div>
          </div>
        )}
        <div className="h-6" />
      </div>
    </MobileFrame>
  );
}

// ── Contact picker ────────────────────────────────────────────────────────────

function PickRecipient({ accessToken, onPick }: { accessToken: string | null; onPick: (c: Contact) => void }) {
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const [debouncedPhone, setDebouncedPhone] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasContactPicker = typeof navigator !== "undefined" && "contacts" in (navigator as any);

  // Recent recipients, built from real send history — no mock contacts.
  const { data: history } = useQuery({
    queryKey: ["history", "out", "recents"],
    queryFn: () => api.history.list(accessToken!, { filter: "out", limit: 20 }),
    enabled: !!accessToken,
  });

  const recents: Contact[] = [];
  const seen = new Set<string>();
  for (const tx of history?.transactions ?? []) {
    if (seen.has(tx.counterparty)) continue;
    seen.add(tx.counterparty);
    const country = countries.find((c) => tx.counterparty.startsWith(c.dial));
    recents.push({
      id: tx.id,
      name: tx.counterparty,
      msisdn: tx.counterparty,
      country: country?.name ?? "",
      flag: country?.flag ?? "🌍",
      rail: tx.rail,
    });
  }

  const filtered = q
    ? recents.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.msisdn.includes(q))
    : recents;
  const typed = q.replace(/\s/g, "");
  const isPhone = /^\+?\d{8,}$/.test(typed);
  const noMatch = filtered.length === 0;
  const newContact = isPhone && noMatch;
  const cc = countries.find((c) => typed.startsWith(c.dial))
    ?? countries.find((c) => typed.startsWith(c.dial.slice(1)))
    ?? countries[0];

  // Debounce the phone input by 400 ms before firing the lookup query.
  useEffect(() => {
    if (!isPhone) { setDebouncedPhone(""); return; }
    const t = setTimeout(() => {
      const e164 = typed.startsWith("+") ? typed : `+${typed}`;
      setDebouncedPhone(e164);
    }, 400);
    return () => clearTimeout(t);
  }, [typed, isPhone]);

  const { data: lookupData, isFetching: lookupFetching } = useQuery({
    queryKey: ["lookup", debouncedPhone],
    queryFn: () => api.send.lookup(debouncedPhone, accessToken!),
    enabled: !!debouncedPhone && !!accessToken,
    staleTime: 60_000,
  });

  const isRegistered = lookupData?.registered;
  // True while the debounce hasn't settled or the request is in-flight.
  const lookupPending = (isPhone && debouncedPhone === "") || lookupFetching;

  async function importFromContacts() {
    if (!hasContactPicker) return;
    setImporting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (navigator as any).contacts.select(["name", "tel"], { multiple: false });
      if (results.length > 0) {
        const first = results[0];
        const raw = (first.tel?.[0] ?? "").replace(/[\s\-().]/g, "");
        const tel = raw.startsWith("+") ? raw : raw.startsWith("00") ? "+" + raw.slice(2) : "+" + raw;
        const name = first.name?.[0] ?? tel;
        if (tel.length >= 8) {
          const country = countries.find((c) => tel.startsWith(c.dial)) ?? countries[0];
          let registered: boolean | undefined;
          try {
            if (accessToken) {
              const res = await api.send.lookup(tel, accessToken);
              registered = res.registered;
            }
          } catch { /* non-fatal */ }
          onPick({ id: "device", name, msisdn: tel, country: country.name, flag: country.flag, rail: "MoMo", registered });
        }
      }
    } catch {
      // user dismissed or permission denied
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2 rounded-2xl bg-card border border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type or paste a phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {hasContactPicker && (
            <button
              onClick={importFromContacts}
              title="Import from phone contacts"
              className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0 hover:bg-primary/10 transition"
            >
              {importing
                ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                : <BookUser className="h-4 w-4 text-primary" />}
            </button>
          )}
        </div>

        {hasContactPicker && (
          <button
            onClick={importFromContacts}
            className="mt-3 w-full flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/50 transition"
          >
            {importing
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : <BookUser className="h-4 w-4 text-primary" />}
            <span className="text-sm font-semibold">Choose from phone contacts</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
          </button>
        )}

        {newContact && (
          <button
            onClick={() => onPick({
              id: "new", name: typed, msisdn: typed.startsWith("+") ? typed : `+${typed}`,
              country: cc.name, flag: cc.flag, rail: "MoMo",
              registered: lookupData?.registered,
            })}
            className={`mt-4 w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
              isRegistered
                ? "border-success/50 bg-success/5"
                : "border-dashed border-primary bg-primary-soft/50"
            }`}
          >
            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-primary-foreground ${
              isRegistered ? "bg-success" : "bg-primary"
            }`}>
              {lookupPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : isRegistered
                  ? <Check className="h-4 w-4" />
                  : <UserPlus className="h-4 w-4" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Send to {typed.startsWith("+") ? typed : `+${typed}`} {cc.flag}</p>
              {lookupPending ? (
                <p className="text-[11px] text-muted-foreground">Checking Autopayke…</p>
              ) : isRegistered ? (
                <p className="text-[11px] text-success font-medium">On Autopayke · instant settlement</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Not on Autopayke yet — we'll text them a claim link</p>
              )}
            </div>
            <ArrowRight className={`h-4 w-4 ${isRegistered ? "text-success" : "text-primary"}`} />
          </button>
        )}
      </div>

      <div className="px-5 mt-5 flex-1">
        {filtered.length > 0 && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Recent</p>
        )}
        <div className="space-y-2">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => onPick(c)}
              className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card hover:bg-muted/50 p-3.5 text-left transition">
              <div className="relative h-11 w-11 rounded-full bg-muted flex items-center justify-center text-xl">{c.flag}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">{c.msisdn} · {c.rail}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && !newContact && q && (
            <p className="py-12 text-center text-sm text-muted-foreground">No match for "{q}"</p>
          )}
          {filtered.length === 0 && !newContact && !q && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No recent recipients yet — type a phone number or import from contacts above.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Amount step with currency toggle ─────────────────────────────────────────

type AmountMode = "usdc" | "local";

const LOCAL_QUICK_AMOUNTS: Record<string, number[]> = {
  KE: [500, 1_000, 2_500, 5_000],
  TZ: [2_000, 5_000, 10_000, 25_000],
  GH: [50, 100, 250, 500],
  NG: [2_000, 5_000, 10_000, 25_000],
  UG: [10_000, 25_000, 50_000, 100_000],
  SN: [2_000, 5_000, 10_000, 25_000],
  CI: [2_000, 5_000, 10_000, 25_000],
};

function fmtQuick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function AmountStep({ recipient, amount, setAmount, usd, maxUsdc, quote, onNext }: {
  recipient: Contact; amount: string; setAmount: (v: string) => void;
  usd: number; maxUsdc: number; quote: FxQuote | null;
  onNext: () => void;
}) {
  const [mode, setMode] = useState<AmountMode>("usdc");
  const [localInput, setLocalInput] = useState("");

  const flag = dialToFlag(recipient.msisdn);
  const localCurrData = getLocalCurrency(recipient.msisdn);
  const localCurrency = localCurrData?.currency ?? null;
  const localRate = localCurrData?.rate ?? null;
  const countryCode = localCurrData?.code ?? null;

  const quickLocal = countryCode ? (LOCAL_QUICK_AMOUNTS[countryCode] ?? [500, 1_000, 2_500, 5_000]) : [];

  function switchMode(next: AmountMode) {
    if (next === "local" && localRate) {
      setLocalInput(((parseFloat(amount) || 0) * localRate).toFixed(0));
    }
    setMode(next);
  }

  function handleLocalChange(v: string) {
    setLocalInput(v);
    if (localRate) {
      const usdc = (parseFloat(v) || 0) / localRate;
      setAmount(usdc.toFixed(6));
    }
  }

  function handleQuickAmount(v: number) {
    if (mode === "local") {
      setLocalInput(String(v));
      if (localRate) setAmount((v / localRate).toFixed(6));
    } else {
      setAmount(String(v));
    }
  }

  const displayValue = mode === "local" ? localInput : amount;
  const displayCurrency = mode === "local" && localCurrency ? localCurrency : "USDC";

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      {/* Recipient row */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-lg">{flag}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {recipient.name !== recipient.msisdn ? recipient.name : recipient.msisdn}
          </p>
          <p className="text-[11px] text-muted-foreground">{recipient.msisdn}</p>
        </div>
      </div>

      {/* Amount card with toggle */}
      <div className="mt-6 rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs opacity-90">You send</p>
          {localCurrency && (
            <div className="flex items-center rounded-full bg-white/20 p-0.5">
              <button
                onClick={() => switchMode("usdc")}
                className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${mode === "usdc" ? "bg-white text-foreground shadow" : "text-white/70"}`}
              >
                USDC
              </button>
              <button
                onClick={() => switchMode("local")}
                className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${mode === "local" ? "bg-white text-foreground shadow" : "text-white/70"}`}
              >
                {localCurrency}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-xl font-black opacity-80">{displayCurrency}</span>
          <input
            value={displayValue}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              if (mode === "local") handleLocalChange(v);
              else setAmount(v);
            }}
            inputMode="decimal"
            className="bg-transparent text-5xl font-black outline-none min-w-0 w-full"
          />
        </div>

        {mode === "local" && localRate && (
          <p className="mt-1 text-[11px] opacity-80">
            ≈ {((parseFloat(localInput) || 0) / localRate).toFixed(2)} USDC
          </p>
        )}
        {mode === "usdc" && (
          <p className="mt-2 text-[11px] opacity-80">Available: {maxUsdc.toFixed(2)} USDC</p>
        )}

        <div className="mt-3 flex gap-2">
          {(mode === "local" ? quickLocal : [10, 25, 50, 100]).map((v) => (
            <button
              key={v}
              onClick={() => handleQuickAmount(v)}
              className="flex-1 rounded-full bg-white/15 backdrop-blur py-1.5 text-xs font-semibold"
            >
              {mode === "local" ? fmtQuick(v) : `${v}`}
            </button>
          ))}
        </div>
      </div>

      {quote && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Recipient gets</span>
            <span className="text-success normal-case flex items-center gap-1">
              <Lock className="h-3 w-3" /> Rate locked
            </span>
          </div>
          <p className="mt-1 text-3xl font-black">
            {quote.toCurrency} {quote.toAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">1 USDC = {quote.tumaRate.toFixed(2)} {quote.toCurrency}</p>
          <div className="mt-3 pt-3 border-t border-border text-[11px] flex justify-between">
            <span className="text-success font-semibold flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Saving vs banks
            </span>
            <span className="text-success font-semibold">
              {quote.toCurrency} {((quote.midRate - quote.tumaRate) * usd).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      <div className="mt-auto pt-6">
        <button
          disabled={usd <= 0 || (maxUsdc > 0 && usd > maxUsdc)}
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 shadow-(--shadow-elegant)"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          Review transfer <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Review step ───────────────────────────────────────────────────────────────

function ReviewStep({ recipient, usd, quote, note, setNote, onSend }: {
  recipient: Contact; usd: number; quote: FxQuote;
  note: string; setNote: (v: string) => void; onSend: () => void;
}) {
  const flag = dialToFlag(recipient.msisdn);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setLoading(true);
    await onSend();
    setLoading(false);
  }

  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        <div className="p-5 text-center" style={{ background: "var(--gradient-mesh)" }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">You send</p>
          <p className="mt-1 text-3xl font-black">{usd.toFixed(2)} USDC</p>
          <div className="my-3 flex items-center justify-center text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <SendIcon className="h-4 w-4 mx-3 text-primary" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recipient gets</p>
          <p className="mt-1 text-3xl font-black">
            {quote.toCurrency} {quote.toAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="divide-y divide-border text-xs">
          <KV k="To" v={`${recipient.name !== recipient.msisdn ? recipient.name : recipient.msisdn} ${flag}`} />
          <KV k="Number" v={recipient.msisdn} mono />
          <KV k="Settles via" v={quote.rail} />
          <KV k="Rate" v={`1 USDC = ${quote.tumaRate.toFixed(2)} ${quote.toCurrency}`} />
          <KV k="Network fee" v="Free" />
          <KV k="Arrival" v="≈ 12 seconds" />
        </div>
      </div>

      <label className="mt-4 block rounded-2xl border border-border bg-card p-3.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Add a note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Rent · groceries · birthday 🎁"
          className="mt-1 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50"
        />
      </label>

      <div className="mt-auto pt-6">
        <button
          onClick={handleSend}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant) disabled:opacity-60"
          style={{ background: "var(--gradient-portfolio)" }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {loading ? "Processing…" : "Confirm & send"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Signed on-device · Settled on Avalanche</p>
      </div>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`text-xs font-semibold ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}
