import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Filter, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "@/components/MobileFrame";
import { BottomNav } from "@/components/BottomNav";
import { api, type TxSummary } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History · Autopayke" }, { name: "description", content: "All your Autopayke transactions." }] }),
  component: History,
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

function statusBadge(status: TxSummary["status"]) {
  if (status === "initiated" || status === "onchain" || status === "routed") return "Pending";
  if (status === "requires_review") return "Needs review";
  if (status === "failed") return "Failed";
  if (status === "expired") return "Expired";
  return null;
}

function History() {
  const navigate = useNavigate();
  const { accessToken, isLoggedIn } = useAuthStore();
  const [tab, setTab] = useState<"all" | "in" | "out">("all");

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["history", tab],
    queryFn: () => api.history.list(accessToken!, { filter: tab }),
    enabled: !!accessToken,
  });

  const txs = data?.transactions ?? [];

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <Link to="/dashboard" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Activity</h1>
          <button className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Filter className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 mt-4">
          <div className="inline-flex w-full p-1 rounded-2xl bg-muted">
            {(["all","in","out"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl capitalize transition ${tab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                {t === "in" ? "Received" : t === "out" ? "Sent" : "All"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 mt-5 flex-1">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <p className="py-12 text-center text-sm text-destructive">Failed to load transactions. Pull to refresh.</p>
          )}

          {!isLoading && !error && txs.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">No transactions yet.</p>
          )}

          <div className="space-y-2">
            {txs.map((tx) => {
              const badge = statusBadge(tx.status);
              const localLine = tx.amountLocal ? `${tx.localCurrency} ${tx.amountLocal.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null;
              const fxLine = tx.fxRate ? `1 USDC = ${tx.fxRate.toFixed(2)} ${tx.localCurrency}` : null;

              return (
                <Link key={tx.id} to="/track/$id" params={{ id: tx.id }} className="block rounded-2xl border border-border bg-card p-3.5 hover:bg-muted/40 transition">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${tx.direction === "in" ? "bg-success-soft text-success" : "bg-primary-soft text-primary"}`}>
                      {tx.direction === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{tx.counterparty}</p>
                      <p className="text-[11px] text-muted-foreground">{tx.rail} · {fmtDate(tx.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${tx.direction === "in" ? "text-success" : ""}`}>
                        {tx.direction === "in" ? "+" : "−"}${tx.amountUsd.toFixed(2)}
                      </p>
                      {localLine && <p className="text-[10px] text-muted-foreground">{localLine}</p>}
                    </div>
                  </div>
                  {(fxLine || badge) && (
                    <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5 text-[10px]">
                      {fxLine && <span className="text-muted-foreground">{fxLine}</span>}
                      {badge && (
                        <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                          tx.status === "failed" || tx.status === "expired" || tx.status === "requires_review"
                            ? "text-destructive bg-destructive/10"
                            : "text-warning bg-warning-soft"
                        }`}>
                          {badge !== "Pending" ? null : <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />}
                          {badge}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="h-24" />
        <BottomNav />
      </div>
    </MobileFrame>
  );
}
