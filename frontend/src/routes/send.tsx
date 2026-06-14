import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, UserPlus, Check, ArrowRight, Sparkles, Loader2, Lock, Send as SendIcon, MessageCircle } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { contacts, quoteFx, dialToCountry, isTumaUser, countries, assets, type Contact } from "@/lib/tuma-data";

export const Route = createFileRoute("/send")({
  head: () => ({ meta: [{ title: "Send · TUMA" }, { name: "description", content: "Send money to any African phone number." }] }),
  component: SendPage,
});

type Step = "pick" | "amount" | "review" | "sending" | "done";

function SendPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("pick");
  const [recipient, setRecipient] = useState<Contact | null>(null);
  const [amount, setAmount] = useState("25");
  const [asset, setAsset] = useState<"USDC" | "USDT">("USDC");
  const [lockSec, setLockSec] = useState(30);
  const [note, setNote] = useState("");

  // rate lock countdown on amount step
  useEffect(() => {
    if (step !== "amount" && step !== "review") return;
    setLockSec(30);
    const t = setInterval(() => setLockSec((s) => (s > 0 ? s - 1 : 30)), 1000);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (step !== "sending") return;
    const t = setTimeout(() => setStep("done"), 2200);
    return () => clearTimeout(t);
  }, [step]);

  const country = recipient ? dialToCountry("+" + recipient.msisdn.replace(/\D/g, "").slice(0, 3)) : "GH";
  const fx = quoteFx(country);
  const usd = Number(amount) || 0;
  const localOut = usd * fx.tumaRate;
  const midOut = usd * fx.mid;
  const tumaUser = recipient ? isTumaUser(recipient.msisdn) : true;

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-4 flex items-center justify-between">
          <button onClick={() => {
            if (step === "pick") navigate({ to: "/dashboard" });
            else if (step === "amount") setStep("pick");
            else if (step === "review") setStep("amount");
            else navigate({ to: "/dashboard" });
          }} className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
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

        {step === "pick" && <PickRecipient onPick={(c) => { setRecipient(c); setStep("amount"); }} />}

        {step === "amount" && recipient && (
          <AmountStep
            recipient={recipient} amount={amount} setAmount={setAmount}
            asset={asset} setAsset={setAsset}
            fx={fx} usd={usd} localOut={localOut} midOut={midOut} lockSec={lockSec}
            tumaUser={tumaUser}
            onNext={() => setStep("review")}
          />
        )}

        {step === "review" && recipient && (
          <ReviewStep
            recipient={recipient} usd={usd} localOut={localOut} fx={fx}
            asset={asset} note={note} setNote={setNote} lockSec={lockSec} tumaUser={tumaUser}
            onSend={() => setStep("sending")}
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
            <h2 className="mt-6 text-2xl font-black">Sending to {recipient?.name.split(" ")[0]}</h2>
            <p className="mt-2 text-xs text-muted-foreground">Broadcasting on Avalanche → routing to {fx.rail}</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex-1 flex flex-col p-5">
            <div className="mt-8 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="mt-6 text-3xl font-black">{tumaUser ? "Sent!" : "Link sent!"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {tumaUser ? `${fx.ccy} ${localOut.toLocaleString("en-US", { maximumFractionDigits: 2 })} is settling to ${recipient?.name.split(" ")[0]} via ${fx.rail}.` :
                  `We texted ${recipient?.name.split(" ")[0]} a claim link. They have 7 days to verify their number — funds stay in escrow until then.`}
              </p>
            </div>

            {!tumaUser && (
              <div className="mt-6 rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
                <MessageCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">SMS preview</p>
                  <p className="mt-1 text-[11px] text-muted-foreground italic">"Hi — Ama sent you {fx.ccy} {localOut.toFixed(2)} on TUMA. Tap to claim: tuma.app/claim/T7791"</p>
                </div>
              </div>
            )}

            <div className="mt-auto pt-6 space-y-2">
              <Link to="/track/$id" params={{ id: "tx1" }} className="w-full block text-center rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
                Track settlement
              </Link>
              <Link to="/dashboard" className="w-full block text-center rounded-2xl border border-border bg-card py-4 text-sm font-semibold">Back to home</Link>
            </div>
          </div>
        )}
        <div className="h-6" />
      </div>
    </MobileFrame>
  );
}

function PickRecipient({ onPick }: { onPick: (c: Contact) => void }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(s) || c.msisdn.includes(s));
  }, [q]);

  // detect free-typed phone → non-TUMA user
  const typed = q.replace(/\s/g, "");
  const isPhone = /^\+?\d{8,}$/.test(typed);
  const newC = isPhone && filtered.length === 0;
  const dial = typed.startsWith("+") ? typed.slice(0, 4) : "+233";
  const cc = countries.find((c) => dial.startsWith(c.dial)) ?? countries[0];

  return (
    <>
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2 rounded-2xl bg-card border border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or +234… phone number" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </div>

        {newC && (
          <button onClick={() => onPick({ id: "new", name: typed, msisdn: typed, country: cc.name, flag: cc.flag, rail: quoteFx(cc.code).rail })}
            className="mt-4 w-full flex items-center gap-3 rounded-2xl border border-dashed border-primary bg-primary-soft/50 p-4 text-left">
            <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><UserPlus className="h-4 w-4" /></div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Send to {typed} {cc.flag}</p>
              <p className="text-[11px] text-muted-foreground">Not on TUMA yet — we'll text them a claim link</p>
            </div>
            <ArrowRight className="h-4 w-4 text-primary" />
          </button>
        )}
      </div>

      <div className="px-5 mt-5 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Recent contacts</p>
        <div className="space-y-2">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => onPick(c)} className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card hover:bg-muted/50 p-3.5 text-left transition">
              <div className="relative h-11 w-11 rounded-full bg-muted flex items-center justify-center text-xl">{c.flag}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate flex items-center gap-1.5">{c.name} <span className="text-[9px] uppercase tracking-wider bg-success-soft text-success rounded-full px-1.5 py-0.5">On TUMA</span></p>
                <p className="text-[11px] text-muted-foreground">{c.msisdn} · {c.rail}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && !newC && <p className="py-12 text-center text-sm text-muted-foreground">No contacts match "{q}"</p>}
        </div>
      </div>
    </>
  );
}

function AmountStep({ recipient, amount, setAmount, asset, setAsset, fx, usd, localOut, midOut, lockSec, tumaUser, onNext }: any) {
  const max = asset === "USDC" ? assets[0].balance : assets[1].balance;
  const savings = midOut - localOut;
  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-lg">{recipient.flag}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{recipient.name}</p>
          <p className="text-[11px] text-muted-foreground">{recipient.msisdn} · {fx.rail}</p>
        </div>
        {!tumaUser && <span className="text-[9px] uppercase tracking-wider bg-warning-soft text-warning-foreground rounded-full px-1.5 py-0.5">Claim link</span>}
      </div>

      <div className="mt-6 rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
        <div className="flex items-center justify-between text-xs opacity-90">
          <span>You send</span>
          <button onClick={() => setAsset(asset === "USDC" ? "USDT" : "USDC")} className="rounded-full bg-white/20 backdrop-blur px-2.5 py-1 font-semibold">{asset} ⇅</button>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-black opacity-80">$</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal" className="bg-transparent text-5xl font-black outline-none w-full" />
        </div>
        <p className="mt-2 text-[11px] opacity-80">Available: {max.toFixed(2)} {asset}</p>
        <div className="mt-3 flex gap-2">
          {[10, 25, 50, 100].map((v) => (
            <button key={v} onClick={() => setAmount(String(v))} className="flex-1 rounded-full bg-white/15 backdrop-blur py-1.5 text-xs font-semibold">${v}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Recipient gets</span>
          <span className="inline-flex items-center gap-1 text-success normal-case">
            <Lock className="h-3 w-3" /> Rate locks in {lockSec}s
          </span>
        </div>
        <p className="mt-1 text-3xl font-black">{fx.ccy} {localOut.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">1 {asset} = {fx.tumaRate.toFixed(2)} {fx.ccy} · Today's rate</p>

        <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-[11px]">
          <div className="flex justify-between text-muted-foreground"><span>Network fee</span><span>0.00</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Settles via</span><span className="font-semibold text-foreground">{fx.rail} {recipient.flag}</span></div>
          <div className="flex justify-between"><span className="text-success font-semibold inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> You're saving</span><span className="text-success font-semibold">{fx.ccy} {(savings).toLocaleString("en-US", { maximumFractionDigits: 2 })} vs banks</span></div>
        </div>
      </div>

      <div className="mt-auto pt-6">
        <button disabled={usd <= 0 || usd > max} onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 shadow-[var(--shadow-elegant)]"
          style={{ background: "var(--gradient-portfolio)" }}>
          Review transfer <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ReviewStep({ recipient, usd, localOut, fx, asset, note, setNote, lockSec, tumaUser, onSend }: any) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-5 pb-6">
      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        <div className="p-5 text-center" style={{ background: "var(--gradient-mesh)" }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">You send</p>
          <p className="mt-1 text-3xl font-black">{usd.toFixed(2)} {asset}</p>
          <div className="my-3 flex items-center justify-center text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <SendIcon className="h-4 w-4 mx-3 text-primary" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recipient gets</p>
          <p className="mt-1 text-3xl font-black">{fx.ccy} {localOut.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="divide-y divide-border text-xs">
          <KV k="To" v={`${recipient.name} ${recipient.flag}`} />
          <KV k="Number" v={recipient.msisdn} mono />
          <KV k="Settles via" v={tumaUser ? fx.rail : "Claim link → " + fx.rail} />
          <KV k="Today's rate" v={`1 ${asset} = ${fx.tumaRate.toFixed(2)} ${fx.ccy}`} />
          <KV k="Rate lock" v={`${lockSec}s remaining`} accent />
          <KV k="Network fee" v="Free" />
          <KV k="Arrival" v="≈ 12 seconds" />
        </div>
      </div>

      <label className="mt-4 block rounded-2xl border border-border bg-card p-3.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Add a note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rent · groceries · birthday 🎁"
          className="mt-1 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/50" />
      </label>

      <div className="mt-auto pt-6">
        <button onClick={onSend}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)]"
          style={{ background: "var(--gradient-portfolio)" }}>
          <Lock className="h-4 w-4" /> Slide to confirm & send
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Signed on-device · Settled on Avalanche</p>
      </div>
    </div>
  );
}

function KV({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`text-xs font-semibold ${mono ? "font-mono" : ""} ${accent ? "text-success" : ""}`}>{v}</span>
    </div>
  );
}