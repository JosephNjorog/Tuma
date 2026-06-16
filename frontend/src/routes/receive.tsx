import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Share2, Copy, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "@/components/MobileFrame";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { countries } from "@/lib/tuma-data";

export const Route = createFileRoute("/receive")({
  component: Receive,
});

function flagForPhone(phone: string) {
  const c = countries.find((c) => phone.startsWith(c.dial));
  return c?.flag ?? "🌍";
}

function Receive() {
  const navigate = useNavigate();
  const { accessToken, user, isLoggedIn } = useAuthStore();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.wallet.get(accessToken!),
    enabled: !!accessToken,
  });

  const phone = user?.phone ?? "—";
  const flag = flagForPhone(phone);
  const smartWallet = wallet?.walletAddress ?? null;

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-5">
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">My Autopayke Passport</h1>
          <button
            onClick={() => navigator.share?.({ title: "Autopayke — Pay me", text: `Send money to ${phone} on Autopayke` })}
            className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Share2 className="h-4 w-4" />
          </button>
        </header>

        <div className="mt-6 relative">
          <div className="absolute -inset-4 rounded-[2rem] opacity-30 blur-2xl" style={{ background: "var(--gradient-portfolio)" }} />
          <div className="relative rounded-[2rem] p-6 text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.3em] opacity-80">Autopayke Passport</span>
              <span className="text-2xl">{flag}</span>
            </div>
            <div className="mt-5 rounded-2xl bg-background p-5">
              <QrPattern seed={phone} />
            </div>
            <div className="mt-5">
              <p className="text-[10px] uppercase tracking-wider opacity-80">Pay this number</p>
              <p className="mt-1 text-2xl font-black">{phone}</p>
              <p className="text-xs opacity-80 mt-1">Autopayke · Avalanche C-Chain</p>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={() => { navigator.clipboard?.writeText(phone); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="w-full flex items-center justify-between rounded-2xl bg-card border border-border p-4"
          >
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone number</p>
              <p className="text-sm font-bold">{phone}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-primary-soft text-primary flex items-center justify-center">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </div>
          </button>

          <div className="flex items-center justify-between rounded-2xl bg-card border border-border p-4">
            <div className="text-left min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Smart wallet</p>
              {smartWallet
                ? <p className="text-sm font-mono truncate">{smartWallet.slice(0,12)}…{smartWallet.slice(-6)}</p>
                : <p className="text-sm text-muted-foreground">Deploying…</p>
              }
            </div>
            <Link to="/wallet" className="text-xs text-primary font-semibold shrink-0">View</Link>
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">Anyone can scan this QR or send to your number — even if they don't use Autopayke.</p>
      </div>
    </MobileFrame>
  );
}

function QrPattern({ seed }: { seed: string }) {
  const hash = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21, y = Math.floor(i / 21);
    const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    if (corner) {
      const cx = x < 7 ? 3 : 17, cy = y < 7 ? 3 : 17;
      const ring = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      return ring === 0 || ring === 2 || ring === 3 ? 1 : 0;
    }
    return ((x * 31 + y * 17 + x * y + hash) % 7) < 3 ? 1 : 0;
  });
  return (
    <div className="grid gap-0.5 aspect-square" style={{ gridTemplateColumns: "repeat(21, 1fr)" }}>
      {cells.map((c, i) => (
        <div key={i} className={c ? "bg-foreground rounded-[1px]" : "bg-transparent"} />
      ))}
    </div>
  );
}
