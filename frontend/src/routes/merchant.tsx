import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, TrendingUp, Settings, ArrowDownLeft } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { BottomNav } from "@/components/BottomNav";
import { transactions } from "@/lib/tuma-data";

export const Route = createFileRoute("/merchant")({
  head: () => ({ meta: [{ title: "Merchant · TUMA" }, { name: "description", content: "Accept payments. Auto-settle to bank or MoMo." }] }),
  component: Merchant,
});

function Merchant() {
  const [enabled, setEnabled] = useState(true);
  const [schedule, setSchedule] = useState<"instant" | "daily" | "weekly">("daily");
  const merchantTx = transactions.filter((t) => t.merchant);

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <Link to="/dashboard" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Merchant mode</h1>
          <button className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Settings className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 mt-3">
          <div className="rounded-3xl p-5 text-primary-foreground shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-portfolio)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs opacity-80 uppercase tracking-wider">Today's revenue</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur px-2 py-0.5 text-[10px] font-semibold">
                <TrendingUp className="h-3 w-3" /> +18%
              </span>
            </div>
            <p className="mt-2 text-4xl font-black">GHS 4,210</p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
              {[["This week","28,140"],["Month","112,690"],["Customers","87"]].map(([k,v])=>(
                <div key={k} className="rounded-xl bg-white/15 backdrop-blur p-2.5">
                  <p className="opacity-80 text-[10px] uppercase tracking-wider">{k}</p>
                  <p className="font-bold text-sm mt-1">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 mt-4">
          <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Till is {enabled ? "open" : "closed"}</p>
              <p className="text-[11px] text-muted-foreground">Your QR is {enabled ? "accepting payments" : "paused"}</p>
            </div>
            <button
              onClick={() => setEnabled((e) => !e)}
              className={`relative h-7 w-12 rounded-full transition ${enabled ? "bg-primary" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition ${enabled ? "left-5" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="px-5 mt-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Auto-settle to</p>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            <div className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center font-bold">M</div>
              <div className="flex-1">
                <p className="text-sm font-semibold">MTN MoMo Float</p>
                <p className="text-[11px] text-muted-foreground">+233 24 567 8910</p>
              </div>
              <span className="text-[10px] font-bold text-success bg-success-soft px-2 py-0.5 rounded-full">Default</span>
            </div>
            <div className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center font-bold">G</div>
              <div className="flex-1">
                <p className="text-sm font-semibold">GCB Bank · ••4421</p>
                <p className="text-[11px] text-muted-foreground">Backup payout</p>
              </div>
            </div>
          </div>

          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 mt-4">Schedule</p>
          <div className="grid grid-cols-3 gap-2">
            {(["instant","daily","weekly"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSchedule(s)}
                className={`rounded-xl py-2.5 text-xs font-semibold capitalize border transition ${
                  schedule === s ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 mt-6 flex-1">
          <h2 className="text-sm font-bold mb-2">Recent payments</h2>
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {merchantTx.map((tx) => (
              <Link key={tx.id} to="/track/$id" params={{ id: tx.id }} className="flex items-center gap-3 p-3.5 hover:bg-muted transition">
                <div className="h-10 w-10 rounded-full bg-success-soft text-success flex items-center justify-center">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{tx.counterparty}</p>
                  <p className="text-[11px] text-muted-foreground">{tx.rail} · {tx.timestamp}</p>
                </div>
                <p className="text-sm font-bold text-success">{tx.amount} {tx.asset}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="h-24" />
        <BottomNav />
      </div>
    </MobileFrame>
  );
}