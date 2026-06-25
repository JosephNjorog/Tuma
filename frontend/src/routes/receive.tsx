import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { useEffect, useState } from "react";
import { ArrowLeft, Share2, Copy, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { MobileFrame } from "@/components/MobileFrame";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { countries } from "@/lib/tuma-data";
import { buildPayUrl } from "@/lib/pay-link";

export const Route = createFileRoute("/receive")({
  beforeLoad: () => {
    if (!useSessionStore.getState().isAuthenticated()) {
      sessionStorage.setItem("autopayke_redirect_to", "/receive");
      throw redirect({ to: "/login", replace: true });
    }
  },
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
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!user?.phone) return;
    QRCode.toDataURL(buildPayUrl(user.phone), { margin: 1, width: 320 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [user?.phone]);

  function copyWallet() {
    if (!smartWallet) return;
    navigator.clipboard?.writeText(smartWallet);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 1500);
  }

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
            <div className="mt-5 rounded-2xl bg-white p-5">
              {qrDataUrl
                ? <img src={qrDataUrl} alt="Scan to pay" className="w-full aspect-square" />
                : <div className="w-full aspect-square animate-pulse bg-muted rounded-xl" />}
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

          <div className="flex items-center justify-between gap-2 rounded-2xl bg-card border border-border p-4">
            <div className="text-left min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Smart wallet</p>
              {smartWallet
                ? <p className="text-sm font-mono truncate">{smartWallet.slice(0,12)}…{smartWallet.slice(-6)}</p>
                : <p className="text-sm text-muted-foreground">Deploying…</p>
              }
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {smartWallet && (
                <button
                  onClick={copyWallet}
                  aria-label="Copy wallet address"
                  className="h-9 w-9 rounded-full bg-primary-soft text-primary flex items-center justify-center"
                >
                  {copiedWallet ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              )}
              <Link to="/wallet" className="text-xs text-primary font-semibold px-2">View</Link>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">Anyone can scan this QR or send to your number — even if they don't use Autopayke.</p>
      </div>
    </MobileFrame>
  );
}

