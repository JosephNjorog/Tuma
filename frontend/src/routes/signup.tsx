import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, ChevronDown, Check, Loader2, Sparkles, AlertCircle, Mail, Lock } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { countries } from "@/lib/tuma-data";
import { api, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up · Autopayke" }, { name: "description", content: "Your number becomes your wallet. No seed phrases." }] }),
  component: Signup,
});

type Step = "phone" | "otp" | "creating" | "secure" | "done";

function Signup() {
  const navigate = useNavigate();
  const { setAuth, accessToken } = useAuthStore();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState(countries[0]);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const fullPhone = `${country.dial}${phone.replace(/\D/g, "")}`;
  const valid = phone.replace(/\D/g, "").length >= 9;
  const otpComplete = otp.every((c) => c !== "");

  useEffect(() => {
    if (step !== "otp") return;
    setResendIn(30);
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (step !== "creating") return;
    const t = setTimeout(() => setStep("secure"), 2200);
    return () => clearTimeout(t);
  }, [step]);

  async function handleSetPassword() {
    setError(null);
    setLoading(true);
    try {
      await api.auth.setPassword(email, password, accessToken!);
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to set password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setError(null);
    setLoading(true);
    try {
      await api.auth.sendOtp(fullPhone);
      setStep("otp");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to send OTP. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);
    setLoading(true);
    try {
      const code = otp.join("");
      const result = await api.auth.verifyOtp(fullPhone, code);
      setAuth({ accessToken: result.accessToken, refreshToken: result.refreshToken }, result.user);
      setStep("creating");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Incorrect code. Try again.");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      await api.auth.sendOtp(fullPhone);
      setResendIn(30);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to resend OTP.");
    }
  }

  function handleOtp(i: number, v: string) {
    const ch = v.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = ch;
    setOtp(next);
    if (ch && i < 5) otpRefs.current[i + 1]?.focus();
  }

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-6 pb-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex gap-1.5">
            {(["phone", "otp", "done"] as const).map((s, i) => {
              const idx = ["phone", "otp", "creating", "secure", "done"].indexOf(step);
              const active = i <= [0, 1, 2, 2, 2][idx];
              return <span key={s} className={`h-1.5 w-6 rounded-full transition ${active ? "bg-primary" : "bg-border"}`} />;
            })}
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {step === "phone" && (
          <>
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Step 1 of 3</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight leading-[1.05]">What's your<br />number?</h1>
              <p className="mt-3 text-sm text-muted-foreground">It becomes your global wallet ID. We'll send a 6-digit code via WhatsApp.</p>
            </div>

            <div className="mt-8 space-y-3">
              <div className="relative">
                <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left">
                  <span className="text-2xl">{country.flag}</span>
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Country</p>
                    <p className="font-semibold text-sm">{country.name} <span className="text-muted-foreground font-normal">({country.dial})</span></p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {open && (
                  <div className="absolute z-20 mt-2 w-full max-h-64 overflow-y-auto rounded-2xl border border-border bg-card shadow-(--shadow-card)">
                    {countries.map((c) => (
                      <button key={c.code} onClick={() => { setCountry(c); setOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-muted text-left">
                        <span className="text-xl">{c.flag}</span>
                        <span className="flex-1 text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.dial}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone number</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-lg">{country.dial}</span>
                  <input
                    type="tel" inputMode="tel" placeholder="24 567 8910"
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-primary-soft p-4 flex gap-3">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">No seed phrase. Ever.</p>
                <p className="text-xs text-muted-foreground mt-1">A smart wallet is derived from your number on Avalanche. Recover by re-verifying your SIM.</p>
              </div>
            </div>

            <div className="mt-auto pt-8">
              <button disabled={!valid || loading} onClick={handleSendOtp}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground transition disabled:opacity-40 disabled:cursor-not-allowed shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Sending code…" : "Send verification code"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">By continuing you agree to Autopayke's Terms.</p>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Step 2 of 3</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight leading-[1.05]">Enter the<br />6-digit code</h1>
              <p className="mt-3 text-sm text-muted-foreground">Sent via WhatsApp to <span className="font-semibold text-foreground">{country.dial} {phone}</span></p>
            </div>

            <div className="mt-8 grid grid-cols-6 gap-2">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOtp(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus(); }}
                  className="aspect-square rounded-2xl border-2 border-border bg-card text-center text-2xl font-black outline-none focus:border-primary focus:bg-primary-soft transition"
                />
              ))}
            </div>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              {resendIn > 0
                ? `Resend code in ${resendIn}s`
                : <button className="text-primary font-semibold" onClick={handleResend}>Resend code</button>
              }
            </div>

            <div className="mt-auto pt-8">
              <button disabled={!otpComplete || loading} onClick={handleVerifyOtp}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground transition disabled:opacity-40 shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Verifying…" : "Verify"} {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
              <button onClick={() => { setStep("phone"); setError(null); }} className="mt-3 w-full text-center text-[11px] text-muted-foreground">Change number</button>
            </div>
          </>
        )}

        {step === "creating" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 rounded-full opacity-40 blur-2xl" style={{ background: "var(--gradient-portfolio)" }} />
              <div className="relative h-full w-full rounded-full flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            </div>
            <h2 className="mt-6 text-2xl font-black">Spinning up your wallet</h2>
            <ul className="mt-6 space-y-2 text-left text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" /> Number verified</li>
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" /> Smart account deployed on Avalanche</li>
              <li className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Linking to your local rail…</li>
            </ul>
          </div>
        )}

        {step === "secure" && (
          <>
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Step 3 of 3</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight leading-[1.05]">Skip the code<br />next time</h1>
              <p className="mt-3 text-sm text-muted-foreground">Set an email and password so you can log in instantly on any device — no waiting on a text message.</p>
            </div>

            <div className="mt-8 space-y-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3" /> Email</p>
                <input
                  type="email" inputMode="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/40"
                />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Lock className="h-3 w-3" /> Password</p>
                <input
                  type="password" placeholder="At least 8 characters"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/40"
                />
              </div>
            </div>

            <div className="mt-auto pt-8 space-y-2">
              <button
                disabled={!email || password.length < 8 || loading}
                onClick={handleSetPassword}
                className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground transition disabled:opacity-40 disabled:cursor-not-allowed shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Saving…" : "Set it up"} {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
              <button onClick={() => { setError(null); setStep("done"); }} className="w-full text-center text-[11px] text-muted-foreground py-2">Skip for now</button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="flex-1 flex flex-col">
            <div className="mt-10 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
                <Check className="h-10 w-10 text-success" />
              </div>
              <h2 className="mt-6 text-3xl font-black tracking-tight">You're in.</h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs">Your Autopayke wallet is live. Fund it to start sending across Africa.</p>
            </div>

            <div className="mt-8 rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>
              <div className="flex items-center gap-2 text-xs opacity-90">
                <Sparkles className="h-3.5 w-3.5" /> Your Autopayke number
              </div>
              <p className="mt-1 text-2xl font-black">{country.dial} {phone || "24 567 8910"}</p>
              <p className="mt-1 text-[11px] opacity-80">Smart wallet linked · ready to receive</p>
            </div>

            <div className="mt-auto pt-8 space-y-2">
              <button onClick={() => navigate({ to: "/fund" })}
                className="w-full rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
                style={{ background: "var(--gradient-portfolio)" }}>
                Add money to wallet
              </button>
              <button onClick={() => navigate({ to: "/dashboard" })}
                className="w-full rounded-2xl border border-border bg-card py-4 text-sm font-semibold">
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
