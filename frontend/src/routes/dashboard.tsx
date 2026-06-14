import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Copy, Send, QrCode, Plus, Store, ArrowUpRight, ArrowDownLeft, Bell, Check, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "@/components/MobileFrame";
import { BottomNav } from "@/components/BottomNav";
import { api, type WalletAsset, type TxSummary } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Home · TUMA" }, { name: "description", content: "Your TUMA wallet — balance, assets, send & receive." }] }),
  component: Dashboard,
});

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function assetColor(symbol: string) {
  if (symbol === "USDC") return "bg-blue-600";
  if (symbol === "USDT") return "bg-emerald-500";
  if (symbol === "AVAX") return "bg-red-500";
  return "bg-muted";
}

function Dashboard() {
  const navigate = useNavigate();
  const { accessToken, user, isLoggedIn } = useAuthStore();
  const [hide, setHide] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.wallet.get(accessToken!),
    enabled: !!accessToken,
    retry: 2,
    refetchInterval: wallet?.status === "deploying" ? 4_000 : false,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["history", "recent"],
    queryFn: () => api.history.list(accessToken!, { limit: 4 }),
    enabled: !!accessToken,
  });

  const walletAddress = wallet?.walletAddress ?? null;
  const isDeploying = wallet?.status === "deploying";
  const totalUsd = wallet?.totalUsd ?? 0;
  const assets: WalletAsset[] = wallet?.assets ?? [];
  const txs: TxSummary[] = historyData?.transactions ?? [];
  const short = walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : isDeploying ? "Deploying…" : "—";
  const phoneHint = user?.phone ? user.phone.slice(-4) : "";

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground font-black" style={{ background: "var(--gradient-portfolio)" }}>T</div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">Hello</p>
              <p className="text-sm font-bold leading-tight">…{phoneHint}</p>
            </div>
          </div>
          <button className="relative h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Bell className="h-4 w-4" />
          </button>
        </header>

        {isDeploying && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl bg-warning-soft px-4 py-2.5 text-xs text-warning-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            Smart wallet deploying on Avalanche — ready in a moment.
          </div>
        )}

        <div className="px-5 mt-3">
          <div className="relative overflow-hidden rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
            <div className="absolute -left-5 -bottom-10 h-32 w-32 rounded-full bg-black/10 blur-2xl" />
            <div className="relative flex items-center justify-between">
              <p className="text-xs opacity-80 uppercase tracking-wider">Total balance</p>
              <button onClick={() => setHide((h) => !h)} className="h-8 w-8 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                {hide ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {walletLoading ? (
              <div className="mt-2 h-10 w-32 rounded-xl bg-white/20 animate-pulse" />
            ) : (
              <p className="relative mt-2 text-4xl font-black tracking-tight">
                {hide ? "$••••••" : `$${totalUsd.toFixed(2)}`}
              </p>
            )}
            <div className="relative mt-4 flex items-center gap-3">
              <button
                onClick={() => { if (walletAddress) { navigator.clipboard?.writeText(walletAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1.5 text-xs font-medium"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : short}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 px-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">Assets</h2>
            <Link to="/wallet" className="text-xs text-primary font-semibold">View all</Link>
          </div>
          {walletLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {[0,1,2].map((i) => <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />)}
            </div>
          ) : assets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No assets yet. Fund your wallet to get started.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {assets.map((a) => (
                <div key={a.symbol} className="rounded-2xl border border-border bg-card p-3">
                  <div className={`h-7 w-7 rounded-full ${assetColor(a.symbol)} flex items-center justify-center text-[10px] font-bold text-white`}>{a.symbol[0]}</div>
                  <p className="mt-2 text-[10px] text-muted-foreground">{a.symbol}</p>
                  <p className="text-sm font-bold leading-tight">{parseFloat(a.balance).toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">${a.balanceUsd.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 px-5">
          <div className="grid grid-cols-4 gap-3">
            <Action to="/fund" icon={Plus} label="Add money" primary />
            <Action to="/send" icon={Send} label="Send" />
            <Action to="/receive" icon={QrCode} label="Receive" />
            <Action to="/merchant" icon={Store} label="Merchant" />
          </div>
        </div>

        <div className="mt-7 px-5 flex-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">Recent activity</h2>
            <Link to="/history" className="text-xs text-primary font-semibold">See all</Link>
          </div>
          {historyLoading ? (
            <div className="space-y-2">
              {[0,1,2].map((i) => <div key={i} className="h-16 rounded-2xl bg-card border border-border animate-pulse" />)}
            </div>
          ) : txs.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {txs.map((tx) => (
                <Link key={tx.id} to="/track/$id" params={{ id: tx.id }} className="flex items-center gap-3 p-3.5 hover:bg-muted transition">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${tx.direction === "in" ? "bg-success-soft text-success" : "bg-primary-soft text-primary"}`}>
                    {tx.direction === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{tx.counterparty}</p>
                    <p className="text-[11px] text-muted-foreground">{tx.rail} · {fmtDate(tx.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${tx.direction === "in" ? "text-success" : ""}`}>{tx.direction === "in" ? "+" : "−"}${tx.amountUsd.toFixed(2)}</p>
                    {tx.status === "initiated" && <p className="text-[10px] text-warning font-semibold">Pending</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="h-24" />
        <BottomNav />
      </div>
    </MobileFrame>
  );
}

function Action({ to, icon: Icon, label, primary }: { to: string; icon: typeof Send; label: string; primary?: boolean }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 group">
      <div
        className={`h-14 w-14 rounded-2xl flex items-center justify-center transition group-active:scale-95 ${
          primary ? "text-primary-foreground shadow-(--shadow-elegant)" : "bg-card border border-border text-foreground"
        }`}
        style={primary ? { background: "var(--gradient-portfolio)" } : undefined}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[11px] font-semibold">{label}</span>
    </Link>
  );
}
