import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Gift, ShieldCheck, Loader2, Check, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "@/components/MobileFrame";
import { api, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/claim/$ref")({
  head: ({ params }) => ({ meta: [{ title: `Claim ${params.ref} · TUMA` }, { name: "description", content: "Someone sent you money on TUMA. Claim it with your phone." }] }),
  component: Claim,
});

function Claim() {
  const { ref } = Route.useParams();
  const navigate = useNavigate();
  const { accessToken, isLoggedIn } = useAuthStore();
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{ amountLocal: number; localCurrency: string; rail: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: claimInfo, isLoading, error: loadError } = useQuery({
    queryKey: ["claim", ref],
    queryFn: () => api.claim.get(ref),
    retry: 1,
  });

  async function handleClaim() {
    if (!accessToken) {
      navigate({ to: "/signup" });
      return;
    }
    setError(null);
    setClaiming(true);
    try {
      const result = await api.claim.claim(ref, accessToken);
      setClaimResult({ amountLocal: result.amountLocal, localCurrency: result.localCurrency, rail: result.rail });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to claim. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  if (claimResult) {
    return (
      <MobileFrame>
        <div className="flex min-h-full flex-col p-6 pb-10">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="h-20 w-20 rounded-full bg-success-soft flex items-center justify-center">
              <Check className="h-10 w-10 text-success" />
            </div>
            <h2 className="mt-6 text-3xl font-black tracking-tight">Claimed!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {claimResult.localCurrency} {claimResult.amountLocal.toLocaleString("en-US", { maximumFractionDigits: 2 })} is being sent to your wallet via {claimResult.rail}.
            </p>
          </div>
          <div className="space-y-2">
            <button onClick={() => navigate({ to: "/dashboard" })}
              className="w-full rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
              style={{ background: "var(--gradient-portfolio)" }}>
              Go to dashboard
            </button>
          </div>
        </div>
      </MobileFrame>
    );
  }

  if (isLoading) {
    return (
      <MobileFrame>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MobileFrame>
    );
  }

  if (loadError || (claimInfo && claimInfo.status !== "pending")) {
    const msg = claimInfo?.message ?? (claimInfo?.status === "claimed" ? "This transfer has already been claimed." : claimInfo?.status === "expired" ? "This transfer has expired." : "This claim link is invalid or not found.");
    return (
      <MobileFrame>
        <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-xl font-black">Unable to claim</h2>
          <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
          <Link to="/" className="mt-6 text-sm text-primary font-semibold">Go home</Link>
        </div>
      </MobileFrame>
    );
  }

  const senderPhone = claimInfo?.senderPhone ?? "Someone";
  const amountUsdc = claimInfo?.amountUsdc ?? 0;
  const expiresAt = claimInfo?.expiresAt ? new Date(claimInfo.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-6 pb-10">
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 rounded-full opacity-40 blur-2xl" style={{ background: "var(--gradient-portfolio)" }} />
            <div className="relative h-full w-full rounded-full flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-portfolio)" }}>
              <Gift className="h-10 w-10" />
            </div>
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-muted-foreground">You've got money waiting</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">
            {senderPhone.length > 5 ? `…${senderPhone.slice(-4)}` : senderPhone} sent you<br />${amountUsdc.toFixed(2)} USDC
          </h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">
            Held in escrow on Avalanche · ref <span className="font-mono">{ref}</span>
            {expiresAt && <> · expires {expiresAt}</>}
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Claim in 60 seconds</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isLoggedIn()
                  ? "You're signed in. Tap below to claim your funds."
                  : "Verify your phone number → we deposit straight to your mobile money. No app required, no fees."}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}

        <div className="mt-auto pt-8 space-y-2">
          <button onClick={handleClaim} disabled={claiming}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant) disabled:opacity-60"
            style={{ background: "var(--gradient-portfolio)" }}>
            {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {claiming ? "Claiming…" : isLoggedIn() ? `Claim $${amountUsdc.toFixed(2)}` : "Sign in to claim"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">Powered by TUMA · Settled on Avalanche</p>
        </div>
      </div>
    </MobileFrame>
  );
}
