import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Check, Loader2, Share2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "@/components/MobileFrame";
import { api, type TxSummary } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/track/$id")({
  head: ({ params }) => ({ meta: [{ title: `Track ${params.id} · Autopayke` }, { name: "description", content: "Live cross-border settlement tracker." }] }),
  component: Track,
});

const STATUS_ORDER: TxSummary["status"][] = ["initiated", "onchain", "routed", "settled"];

function stepForStatus(status: TxSummary["status"]) {
  if (status === "requires_review" || status === "failed" || status === "expired") {
    return STATUS_ORDER.length - 1;
  }
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

function statusLabel(status: TxSummary["status"]) {
  if (status === "requires_review") return "Needs review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Track() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { accessToken, isLoggedIn } = useAuthStore();

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["track", id],
    queryFn: () => api.track.get(id, accessToken!),
    enabled: !!accessToken && !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.transaction?.status;
      if (
        !status ||
        status === "settled" ||
        status === "requires_review" ||
        status === "failed" ||
        status === "expired"
      ) return false;
      return 5_000;
    },
  });

  const tx = data?.transaction;
  const events = data?.events ?? [];

  if (isLoading) {
    return (
      <MobileFrame>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MobileFrame>
    );
  }

  if (error || !tx) {
    return (
      <MobileFrame>
        <div className="p-10 text-center">
          <p className="text-sm font-bold text-destructive">Couldn't load transaction</p>
          <Link to="/history" className="mt-4 inline-block text-sm text-primary font-semibold">Back to history</Link>
        </div>
      </MobileFrame>
    );
  }

  const currentStep = stepForStatus(tx.status);
  const isPending =
    tx.status !== "settled" &&
    tx.status !== "requires_review" &&
    tx.status !== "failed" &&
    tx.status !== "expired";
  const needsReview = tx.status === "requires_review";
  const isFailed = tx.status === "failed" || tx.status === "expired" || needsReview;

  const steps = [
    { title: "Initiated", desc: "You signed and broadcast the transfer" },
    { title: "On-chain confirmed", desc: "Avalanche finality reached in ~1s" },
    { title: "Routed to rail", desc: `Autopayke selected ${tx.rail}` },
    {
      title: needsReview ? "Needs review" : isFailed ? "Failed" : "Settled",
      desc: needsReview
        ? (tx.failureReason ?? "This transfer needs operator review")
        : isFailed
          ? (tx.status === "expired" ? "Transfer expired" : "Settlement failed")
          : isPending
            ? "Crediting recipient's account…"
            : `${tx.rail} confirmed credit`,
    },
  ];

  const localLine = tx.amountLocal ? `${tx.localCurrency} ${tx.amountLocal.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null;
  const fxLine = tx.fxRate ? `1 USDC = ${tx.fxRate.toFixed(2)} ${tx.localCurrency}` : null;
  const settledAt = tx.settledAt ? new Date(tx.settledAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <Link to="/history" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Transfer tracker</h1>
          <button onClick={() => navigator.share?.({ title: "Autopayke Transfer", text: `Ref: ${tx.reference}` })}
            className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <Share2 className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 mt-3">
          <div className="rounded-3xl p-5 text-primary-foreground shadow-(--shadow-elegant)" style={{ background: "var(--gradient-portfolio)" }}>
            <p className="text-xs opacity-80 uppercase tracking-wider">{tx.direction === "out" ? "Sent to" : "Received from"}</p>
            <p className="mt-1 text-2xl font-black">{tx.counterparty}</p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-4xl font-black">${tx.amountUsd.toFixed(2)}</p>
                {localLine && <p className="text-xs opacity-80 mt-0.5">{localLine}</p>}
              </div>
              <div className="text-right text-xs opacity-90">
                <p>via {tx.rail}</p>
                {fxLine && <p className="opacity-70">{fxLine}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 mt-6">
          <h2 className="text-sm font-bold mb-3">Settlement timeline</h2>
          <div className="relative pl-9">
            <div className="absolute left-3.75 top-2 bottom-2 w-px bg-border" />
            {steps.map((s, i) => {
              const done = i < currentStep || (i === currentStep && !isPending);
              const active = i === currentStep && isPending;
              const failed = isFailed && i === 3;
              return (
                <div key={i} className="relative pb-5 last:pb-0">
                  <div className={`absolute -left-9 top-0 h-7 w-7 rounded-full flex items-center justify-center ${
                    failed ? "bg-destructive text-destructive-foreground" :
                    done ? "bg-success text-success-foreground" :
                    active ? "bg-primary text-primary-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                  {events[i] && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(events[i].createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 mt-6">
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            <Row k="Status" v={statusLabel(tx.status)} />
            <Row k="Asset" v="USDC" />
            <Row k="Rail" v={tx.rail} />
            {fxLine && <Row k="FX rate" v={fxLine} />}
            <Row k="Reference" v={tx.reference} mono />
            {tx.failureStage && <Row k="Review stage" v={tx.failureStage} />}
            {tx.failureReason && <Row k="Review reason" v={tx.failureReason} />}
            {settledAt && <Row k="Settled at" v={settledAt} />}
            {tx.note && <Row k="Note" v={tx.note} />}
          </div>
        </div>

        <div className="px-5 mt-5 pb-8">
          <button onClick={() => navigator.share?.({ title: "Autopayke Receipt", text: `Transfer ref ${tx.reference} — ${tx.status}` })}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-primary-foreground shadow-(--shadow-elegant)"
            style={{ background: "var(--gradient-portfolio)" }}>
            Share receipt
          </button>
          <Link to="/dashboard" className="mt-2 block text-center text-xs text-muted-foreground py-2">Back to home</Link>
        </div>
      </div>
    </MobileFrame>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`text-xs font-semibold ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}
