import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Phone, Zap, Globe2, ShieldCheck, QrCode, Sparkles, Check, ArrowUpRight, Lock, MessageCircle, CreditCard, Wallet as WalletIcon, Smartphone, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TUMA — Phone-First Cross-Border Money for Africa" },
      { name: "description", content: "Send, receive and spend across Africa with just a phone number. Stablecoins under the hood, MoMo, M-Pesa, Wave and bank rails at the edge." },
      { property: "og:title", content: "TUMA — Phone-First Cross-Border Money" },
      { property: "og:description", content: "Just a number. No seed phrases. Instant cross-border settlement on MoMo, M-Pesa, Wave and bank rails." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* HERO with mesh */}
      <div className="relative" style={{ background: "var(--gradient-mesh)" }}>
        <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground font-black" style={{ background: "var(--gradient-portfolio)" }}>T</div>
            <span className="text-lg font-black tracking-tight">TUMA</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#how" className="hover:text-foreground transition">How it works</a>
            <a href="#rates" className="hover:text-foreground transition">Live rates</a>
            <a href="#merchant" className="hover:text-foreground transition">For merchants</a>
            <a href="#faq" className="hover:text-foreground transition">FAQ</a>
          </div>
          <Link to="/signup" className="rounded-full bg-foreground text-background px-5 py-2 text-sm font-semibold hover:opacity-90 transition">
            Get my number
          </Link>
        </nav>

        <section className="relative z-10 mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-6 md:grid-cols-[1.15fr_1fr] md:gap-16 md:pt-14">
          <div className="flex flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="relative flex h-2 w-2"><span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" /><span className="relative h-2 w-2 rounded-full bg-success" /></span>
              Live on Avalanche · 5 countries · 5 rails
            </span>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-tight md:text-[5.5rem]">
              Money that moves <br />
              like a <span className="italic relative inline-block" style={{ background: "var(--gradient-portfolio)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                text message.
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground leading-relaxed">
              Type a phone number. Type an amount. Done. TUMA settles on M-Pesa, MoMo, Wave, or bank — in seconds — while you never touch crypto.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup" className="group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)] transition active:scale-95" style={{ background: "var(--gradient-portfolio)" }}>
                Sign up with my number <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition" />
              </Link>
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-semibold hover:bg-muted transition">
                Try the live demo <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-3 max-w-lg gap-4 text-xs">
              <Stat n="< 12s" l="Settlement" />
              <Stat n="0 fees" l="Network" />
              <Stat n="5 rails" l="1 number" />
            </div>
          </div>

          {/* Quote card */}
          <div className="relative mx-auto">
            <div className="absolute -inset-10 rounded-full opacity-40 blur-3xl" style={{ background: "var(--gradient-portfolio)" }} />
            <div className="relative w-[340px] rounded-[2rem] border border-border bg-card p-5 shadow-[var(--shadow-elegant)]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> Today's rate</span>
                <span className="inline-flex items-center gap-1 text-success font-semibold"><Lock className="h-3 w-3" /> Locked 30s</span>
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-background p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">You send</p>
                <p className="mt-1 text-3xl font-black">$ 100.00 USDC</p>
              </div>
              <div className="my-3 flex items-center justify-center text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <ArrowRight className="h-4 w-4 mx-3 text-primary" />
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="rounded-2xl p-4 text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
                <p className="text-[10px] uppercase tracking-wider opacity-90">Recipient gets · Kenya 🇰🇪</p>
                <p className="mt-1 text-3xl font-black">KES 12,643</p>
                <p className="mt-1 text-[11px] opacity-80">via M-Pesa STK push</p>
              </div>
              <div className="mt-3 space-y-1.5 text-[11px]">
                <div className="flex justify-between text-muted-foreground"><span>1 USDC = 126.43 KES</span><span>Today's rate</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Network fee</span><span>0.00</span></div>
                <div className="flex justify-between text-success font-semibold"><span>You save vs bank</span><span>KES 297</span></div>
              </div>
              <button className="mt-4 w-full rounded-xl py-3 text-xs font-bold bg-foreground text-background">
                Slide to send (demo)
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* HOW IT WORKS — three-step ribbon */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">How it works</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl max-w-3xl">From phone to phone in three taps.</h2>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <Step n="01" icon={Smartphone} title="Sign up with your number" body="Enter your phone, verify via SMS. We derive a smart wallet on Avalanche under the hood — no seed phrase to remember." />
          <Step n="02" icon={CreditCard} title="Add money in seconds" body="Top up with card, instant bank transfer, or deposit USDC from any Avalanche wallet. Stablecoin lands in your TUMA balance." />
          <Step n="03" icon={Zap} title="Send to any number" body="Type a name or +234… number. TUMA auto-detects the country and routes the payout to M-Pesa, MoMo, Wave or bank." />
        </div>

        {/* Unclaimed link callout */}
        <div className="mt-10 rounded-3xl border border-border bg-card p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
          <div className="h-12 w-12 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shrink-0"><MessageCircle className="h-6 w-6" /></div>
          <div className="flex-1">
            <p className="text-sm font-bold">Recipient doesn't have TUMA?</p>
            <p className="text-xs text-muted-foreground mt-1">No problem. We text them a secure claim link. Funds stay in on-chain escrow until they verify their phone — exactly like Cash App's unclaimed payments.</p>
          </div>
          <Link to="/claim/$ref" params={{ ref: "T7791" }} className="text-xs font-semibold text-primary inline-flex items-center gap-1">See the claim flow <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </section>

      {/* LIVE RATES */}
      <section id="rates" className="bg-foreground text-background py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-background/60">Live corridor rates</p>
              <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Better than your bank. Quietly.</h2>
              <p className="mt-4 max-w-md text-background/70">No hidden fee lines. The rate you see is the rate you get — already better than Western Union, Wise, and your retail bank.</p>
            </div>
            <div className="text-xs text-background/60 inline-flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" /> Updated every 60s</div>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <RateCard from="🇺🇸" to="🇰🇪" pair="USDC → KES" rate="126.43" rail="M-Pesa STK" delta="+0.3%" />
            <RateCard from="🇺🇸" to="🇬🇭" pair="USDC → GHS" rate="14.85" rail="MTN MoMo" delta="−0.1%" />
            <RateCard from="🇺🇸" to="🇳🇬" pair="USDC → NGN" rate="1545.6" rail="Paystack bank" delta="+0.7%" />
            <RateCard from="🇺🇸" to="🇸🇳" pair="USDC → XOF" rate="591.1" rail="Wave" delta="+0.2%" />
          </div>
        </div>
      </section>

      {/* RAILS */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl border border-border p-8 md:p-12" style={{ background: "var(--gradient-mesh)" }}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">One app, every rail</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Settles where they already cash out.</h2>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">You never pick a rail. TUMA reads the destination number and routes to the channel the recipient uses every day.</p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { n: "M-Pesa", c: "🇰🇪 Kenya" },
              { n: "MTN MoMo", c: "🇬🇭 Ghana" },
              { n: "Paystack", c: "🇳🇬 Nigeria" },
              { n: "Wave", c: "🇸🇳 Senegal" },
              { n: "Orange Money", c: "🇸🇳 Senegal" },
            ].map(r => (
              <div key={r.n} className="rounded-2xl bg-card border border-border p-5">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center font-black text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>{r.n[0]}</div>
                <p className="mt-3 font-bold text-sm">{r.n}</p>
                <p className="text-xs text-muted-foreground">{r.c}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MERCHANT */}
      <section id="merchant" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-10 md:grid-cols-2 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Merchant mode</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Any number can be a till.</h2>
            <p className="mt-5 text-muted-foreground max-w-md">Flip merchant mode on and your QR accepts pay-anyone, dynamic checkout, or itemized invoices. Auto-settle to bank or MoMo float — same rail, lower fees.</p>
            <ul className="mt-6 space-y-2 text-sm">
              {["0.8% blended merchant fee","Daily auto-payout to MoMo/bank","Cross-border customers welcome","Live revenue dashboard"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {t}</li>
              ))}
            </ul>
            <Link to="/merchant" className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold hover:bg-muted transition">
              Explore merchant mode <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-card p-8">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Today's revenue</span>
              <span className="text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded-full">+18%</span>
            </div>
            <p className="mt-2 text-4xl font-black">GHS 4,210</p>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {[["This week","GHS 28k"],["This month","GHS 112k"],["Payouts","Daily"]].map(([k,v])=>(
                <div key={k}><p className="text-[10px] text-muted-foreground uppercase tracking-wider">{k}</p><p className="font-bold text-sm mt-1">{v}</p></div>
              ))}
            </div>
            <div className="mt-6 h-32 rounded-2xl flex items-end gap-1 p-3" style={{ background: "var(--gradient-mesh)" }}>
              {[40,65,50,80,55,90,72].map((h,i)=>(
                <div key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: "var(--gradient-portfolio)", opacity: 0.4 + i*0.08 }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 pb-24">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground text-center">Questions</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl text-center">The honest FAQ.</h2>
        <div className="mt-10 space-y-3">
          <Faq q="Do I need to know anything about crypto?" a="No. You see local currency only. TUMA hides USDC, addresses, and the word 'blockchain'. Under the hood we use account abstraction so a smart wallet is derived from your phone number." />
          <Faq q="How does TUMA make money?" a="A small FX spread baked into the quoted rate — about 2%. Industry standard for Wise, Western Union, M-Pesa. No surprise fees on top." />
          <Faq q="What if my recipient doesn't have TUMA?" a="We text them a claim link. The funds sit in on-chain escrow until they verify their number. If they never claim, you get a refund after 7 days." />
          <Faq q="Is my money safe?" a="Your wallet is non-custodial — you control it via SIM ownership. Funds live in USDC on Avalanche, audited and pegged 1:1 to USD." />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl p-10 md:p-16 text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -left-10 -bottom-20 h-60 w-60 rounded-full bg-black/10 blur-3xl" />
          <div className="relative">
            <h2 className="text-4xl md:text-6xl font-black tracking-tight max-w-3xl">Your number<br />is enough.</h2>
            <p className="mt-4 max-w-lg opacity-90 text-lg">Sign up in 30 seconds. The first send is on us.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-full bg-background text-foreground px-6 py-3.5 text-sm font-semibold hover:opacity-90 transition">
                Claim my TUMA number <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-6 py-3.5 text-sm font-semibold">
                Open the demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} TUMA — Built for Africa, on Avalanche.</p>
          <p>M-Pesa · MoMo · Paystack · Wave · Orange · USDC · USDT · AVAX</p>
        </div>
      </footer>
    </main>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <p className="text-2xl font-black tracking-tight">{n}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</p>
    </div>
  );
}

function Step({ n, icon: Icon, title, body }: { n: string; icon: typeof Phone; title: string; body: string }) {
  return (
    <div className="group rounded-3xl border border-border bg-card p-7 transition hover:shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-xs font-mono text-muted-foreground">{n}</span>
      </div>
      <h3 className="mt-6 text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function RateCard({ from, to, pair, rate, rail, delta }: { from: string; to: string; pair: string; rate: string; rail: string; delta: string }) {
  const up = delta.startsWith("+");
  return (
    <div className="rounded-2xl border border-background/10 bg-background/5 backdrop-blur p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-2xl">{from}<ArrowRight className="h-3.5 w-3.5 text-background/40" />{to}</div>
        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${up ? "bg-success/20 text-success" : "bg-background/10 text-background/70"}`}>{delta}</span>
      </div>
      <p className="mt-4 text-2xl font-black">{rate}</p>
      <p className="text-[10px] uppercase tracking-wider text-background/60 mt-0.5">{pair}</p>
      <p className="mt-3 text-[11px] text-background/70 inline-flex items-center gap-1.5"><WalletIcon className="h-3 w-3" /> Settles via {rail}</p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border border-border bg-card p-5 open:shadow-[var(--shadow-card)]">
      <summary className="flex items-center justify-between cursor-pointer list-none">
        <span className="text-sm font-bold pr-4">{q}</span>
        <span className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-open:rotate-45 transition">+</span>
      </summary>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{a}</p>
    </details>
  );
}
