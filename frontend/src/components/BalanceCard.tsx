import { useState, useRef } from "react";
import { Copy, Check } from "lucide-react";
import { cn, formatUSD, formatKES, truncateAddress } from "@/lib/utils";

export interface BalanceCardProps {
  totalUsd: string;
  totalKes: string;
  walletAddress: string;
  isLoading?: boolean;
  className?: string;
}

export function BalanceCard({ totalUsd, totalKes, walletAddress, isLoading = false, className }: BalanceCardProps) {
  const [currency, setCurrency] = useState<"USD" | "KES">("USD");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCopy = () => {
    void navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const primaryAmount = currency === "USD" ? formatUSD(totalUsd) : formatKES(totalKes);
  const secondaryAmount = currency === "USD" ? formatKES(totalKes) : formatUSD(totalUsd);

  return (
    <div
      className={cn(
        "rounded-3xl p-5 relative overflow-hidden shadow-[0_8px_32px_rgba(249,115,22,0.25)] bg-balance-gradient",
        className
      )}
    >
      {/* Decorative circles */}
      <div className="absolute -top-7.5 -right-7.5 w-30 h-30 rounded-full bg-white/8 pointer-events-none" />
      <div className="absolute -bottom-5 -left-5 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

      {/* Top row */}
      <div className="flex items-center justify-between mb-1 relative z-10">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-white/70">
          Total balance
        </span>
        <div className="flex gap-1 bg-black/20 rounded-full p-0.5">
          {(["USD", "KES"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn(
                "text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50",
                currency === c ? "bg-white/25 text-white" : "text-white/60"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Primary amount */}
      <div className="relative z-10 mt-1.5">
        {isLoading ? (
          <div className="h-10 w-32 rounded-xl bg-white/20 animate-pulse" />
        ) : (
          <span className="font-display text-[38px] font-black text-white leading-none">
            {primaryAmount}
          </span>
        )}
      </div>

      {/* Secondary amount */}
      <div className="relative z-10 mt-1 min-h-5">
        {!isLoading && (
          <span className="text-[13px] text-white/60">{secondaryAmount}</span>
        )}
      </div>

      {/* Wallet address */}
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "flex items-center gap-1.5 mt-3 relative z-10 group",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded"
        )}
        aria-label="Copy wallet address"
      >
        <span className="text-[11px] text-white/50 font-mono">
          {truncateAddress(walletAddress)}
        </span>
        {copied ? (
          <Check size={12} className="text-white/60 opacity-60" />
        ) : (
          <Copy size={12} className="text-white/60 opacity-60 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    </div>
  );
}
