import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, TrendingUp, Settings } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { BottomNav } from "@/components/BottomNav";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/merchant")({
  component: Merchant,
});

function Merchant() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuthStore();
  const [enabled, setEnabled] = useState(true);
  const [schedule, setSchedule] = useState<"instant" | "daily" | "weekly">("daily");

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

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
          <div className="rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs opacity-80 uppercase tracking-wider">Today's revenue</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur px-2 py-0.5 text-[10px] font-semibold">
                <TrendingUp className="h-3 w-3" /> Live
              </span>
            </div>
            <p className="mt-2 text-4xl font-black">—</p>
            <p className="mt-2 text-xs opacity-70">Revenue data available once payments come in</p>
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
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 mt-4">Auto-settle schedule</p>
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
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm font-semibold">No payments yet</p>
            <p className="text-[11px] text-muted-foreground mt-1">Share your QR from the Receive screen to start accepting payments.</p>
            <Link to="/receive" className="mt-4 inline-block text-xs text-primary font-semibold">Go to my QR →</Link>
          </div>
        </div>

        <div className="h-24" />
        <BottomNav />
      </div>
    </MobileFrame>
  );
}
