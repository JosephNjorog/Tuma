import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  LogOut,
  Plus,
  ArrowUpRight,
  QrCode,
  Store,
  Activity,
  AlertCircle,
} from "lucide-react";
import { BalanceCard } from "@/components/BalanceCard";
import { TransactionRow } from "@/components/TransactionRow";
import { BottomNav } from "@/components/BottomNav";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { apiClient } from "@/lib/api";
import { useSessionStore } from "@/stores/sessionStore";
import { useWalletStore } from "@/stores/walletStore";
import { getGreeting, usdcToKes, formatUSD } from "@/lib/utils";
import { BALANCE_STALE_TIME_MS, TRANSACTIONS_STALE_TIME_MS } from "@/lib/constants";
import { useTransactionSocket } from "@/hooks/useTransactionSocket";
import type { WalletBalance, Transaction } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    if (!useSessionStore.getState().isAuthenticated()) {
      sessionStorage.setItem("autopayke_redirect_to", "/dashboard");
      throw redirect({ to: "/login", replace: true });
    }
  },
  head: () => ({ meta: [{ title: "Home · AutoPayKe" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const sessionStore = useSessionStore();
  const { setBalance, clearBalance } = useWalletStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const touchStartY = useRef(0);

  useTransactionSocket();

  const walletQuery = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => apiClient.get<WalletBalance>("/api/wallet/balance"),
    staleTime: BALANCE_STALE_TIME_MS,
    refetchInterval: 30000,
    retry: 1,
  });

  const transactionsQuery = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () =>
      apiClient.get<{ transactions: Transaction[] }>("/api/transactions?limit=5"),
    staleTime: TRANSACTIONS_STALE_TIME_MS,
    retry: 1,
  });

  useEffect(() => {
    if (walletQuery.data) {
      sessionStore.setKesRate(walletQuery.data.kes_rate);
      setBalance(walletQuery.data);
    }
  }, [walletQuery.data, sessionStore, setBalance]);

  const kesRate = sessionStore.kes_rate || 130;
  const totalUsd = walletQuery.data?.total_usd ?? "0";
  const totalKes = useMemo(() => usdcToKes(totalUsd, kesRate), [totalUsd, kesRate]);

  const handleLogout = () => {
    sessionStore.clearSession();
    clearBalance();
    void navigate({ to: "/login" });
  };

  const isRefetching = walletQuery.isRefetching || transactionsQuery.isRefetching;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? 0;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaY = (e.changedTouches[0]?.clientY ?? 0) - touchStartY.current;
    if (deltaY > 70 && window.scrollY === 0) {
      void walletQuery.refetch();
      void transactionsQuery.refetch();
    }
  };

  const greeting = getGreeting();
  const firstName = sessionStore.getFirstName();
  const walletAddress = sessionStore.wallet_address ?? "";

  return (
    <div
      className="min-h-screen bg-dark-gradient relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Radial glow */}
      <div className="pointer-events-none absolute -top-15 -right-15 w-50 h-50 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.12)_0%,transparent_70%)]" />

      {/* Pull-to-refresh indicator */}
      {isRefetching && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
          <LoadingSpinner size={16} color="muted" />
        </div>
      )}

      <div className="relative z-10 pb-28 max-w-97.5 mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-5">
          <div>
            <p className="text-[11px] text-white/30 font-medium">{greeting}</p>
            {firstName && (
              <p className="font-display text-[20px] font-extrabold text-white mt-0.5">
                {firstName}
              </p>
            )}
          </div>

          <div className="flex gap-2 relative">
            <button
              type="button"
              onClick={() => {}}
              aria-label="Notifications"
              className="w-9 h-9 rounded-xl bg-white/10 border border-navy-border flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange"
            >
              <Bell size={18} strokeWidth={1.5} className="text-white/50" />
            </button>

            <button
              type="button"
              onClick={() => setShowLogoutConfirm((v) => !v)}
              aria-label="Log out"
              className="w-9 h-9 rounded-xl bg-white/10 border border-navy-border flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange"
            >
              <LogOut size={18} strokeWidth={1.5} className="text-white/50" />
            </button>

            {showLogoutConfirm && (
              <div className="absolute top-11 right-0 bg-navy-surface border border-navy-border rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 w-52">
                <p className="text-[13px] font-semibold text-white mb-1">Log out?</p>
                <p className="text-[11px] text-white/50 leading-relaxed mb-3">
                  You will need to verify your identity to log back in.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/60 font-semibold focus-visible:outline-none"
                  >
                    Stay
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 py-1.5 rounded-lg bg-danger/15 border border-danger/30 text-[12px] text-danger font-semibold focus-visible:outline-none"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Balance Card */}
        <div className="px-4 mb-5">
          <BalanceCard
            totalUsd={totalUsd}
            totalKes={totalKes}
            walletAddress={walletAddress}
            isLoading={walletQuery.isLoading}
          />
        </div>

        {/* Assets */}
        <AssetsSection
          data={walletQuery.data}
          isLoading={walletQuery.isLoading}
          onViewAll={() => navigate({ to: "/wallet" })}
        />

        {/* Quick Actions */}
        <QuickActions
          onAddMoney={() => navigate({ to: "/fund" })}
          onSend={() => navigate({ to: "/send" })}
          onReceive={() => navigate({ to: "/receive" })}
          onMerchant={() => navigate({ to: "/merchant" })}
        />

        {/* Recent Activity */}
        <RecentActivity
          query={transactionsQuery}
          onViewAll={() => navigate({ to: "/history" })}
          onAddMoney={() => navigate({ to: "/fund" })}
        />
      </div>

      <BottomNav />
    </div>
  );
}

// ── Assets Section ───────────────────────────────────────────────────────────

interface AssetChipData {
  key: string;
  name: string;
  color: string;
  letter: string;
  primaryAmount: string;
  secondaryAmount: string;
}

const AssetsSection = memo(function AssetsSection({
  data,
  isLoading,
  onViewAll,
}: {
  data: WalletBalance | undefined;
  isLoading: boolean;
  onViewAll: () => void;
}) {
  const chips = useMemo<AssetChipData[]>(() => {
    if (!data) return [];
    const avaxUsd = Math.max(
      0,
      parseFloat(data.total_usd) - parseFloat(data.usdc) - parseFloat(data.usdt)
    ).toFixed(2);
    return [
      {
        key: "usdc",
        name: "USDC",
        color: "#2775CA",
        letter: "U",
        primaryAmount: formatUSD(data.usdc),
        secondaryAmount: `${parseFloat(data.usdc).toFixed(2)} USDC`,
      },
      {
        key: "usdt",
        name: "USDT",
        color: "#26A17B",
        letter: "U",
        primaryAmount: formatUSD(data.usdt),
        secondaryAmount: `${parseFloat(data.usdt).toFixed(2)} USDT`,
      },
      {
        key: "avax",
        name: "AVAX",
        color: "#E84142",
        letter: "A",
        primaryAmount: formatUSD(avaxUsd),
        secondaryAmount: `${parseFloat(data.avax).toFixed(4)} AVAX`,
      },
    ];
  }, [data]);

  return (
    <div className="px-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-[13px] text-white">Assets</span>
        <button
          type="button"
          onClick={onViewAll}
          className="text-[12px] text-orange font-semibold cursor-pointer focus-visible:outline-none"
        >
          View all
        </button>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="shrink-0 w-22.5 h-22 rounded-2xl bg-navy-card animate-pulse"
              />
            ))
          : chips.map((chip) => (
              <div
                key={chip.key}
                className="shrink-0 bg-navy-card border border-navy-border rounded-2xl p-3 flex flex-col gap-1 min-w-22.5"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black mb-1"
                  style={{ backgroundColor: chip.color }}
                >
                  {chip.letter}
                </div>
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wide">
                  {chip.name}
                </span>
                <span className="text-[14px] font-bold text-white">{chip.primaryAmount}</span>
                <span className="text-[11px] text-white/30">{chip.secondaryAmount}</span>
              </div>
            ))}
      </div>
    </div>
  );
});

// ── Quick Actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    label: "Add money",
    icon: Plus,
    isOrange: true,
    key: "add",
  },
  {
    label: "Send",
    icon: ArrowUpRight,
    isOrange: false,
    key: "send",
  },
  {
    label: "Receive",
    icon: QrCode,
    isOrange: false,
    key: "receive",
  },
  {
    label: "Merchant",
    icon: Store,
    isOrange: false,
    key: "merchant",
  },
] as const;

function QuickActions({
  onAddMoney,
  onSend,
  onReceive,
  onMerchant,
}: {
  onAddMoney: () => void;
  onSend: () => void;
  onReceive: () => void;
  onMerchant: () => void;
}) {
  const handlers: Record<string, () => void> = {
    add: onAddMoney,
    send: onSend,
    receive: onReceive,
    merchant: onMerchant,
  };

  return (
    <div className="px-4 mb-5">
      <div className="grid grid-cols-4 gap-2">
        {QUICK_ACTIONS.map(({ label, icon: Icon, isOrange, key }) => (
          <button
            key={key}
            type="button"
            onClick={handlers[key]}
            className="flex flex-col items-center gap-2 cursor-pointer focus-visible:outline-none group"
          >
            <div
              className={cn(
                "w-13 h-13 rounded-[18px] flex items-center justify-center active:scale-90 transition-transform",
                isOrange
                  ? "bg-orange-gradient shadow-[0_4px_16px_rgba(249,115,22,0.35)]"
                  : "bg-navy-surface border border-navy-border"
              )}
            >
              {isOrange ? (
                <Icon size={22} strokeWidth={2.5} className="text-white" />
              ) : (
                <Icon size={20} strokeWidth={1.5} className="text-white" />
              )}
            </div>
            <span className="text-[11px] font-semibold text-white/60">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Recent Activity ───────────────────────────────────────────────────────────

function TransactionSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/5">
      <div className="w-9.5 h-9.5 rounded-xl bg-navy-card animate-pulse shrink-0" />
      <div className="flex-1">
        <div className="h-3.5 w-32 rounded bg-navy-card animate-pulse" />
        <div className="h-3 w-20 rounded bg-navy-card animate-pulse mt-1.5" />
      </div>
      <div className="h-4 w-14 rounded bg-navy-card animate-pulse ml-auto" />
    </div>
  );
}

function RecentActivity({
  query,
  onViewAll,
  onAddMoney,
}: {
  query: ReturnType<typeof useQuery<{ transactions: Transaction[] }>>;
  onViewAll: () => void;
  onAddMoney: () => void;
}) {
  const transactions = query.data?.transactions ?? [];

  return (
    <div className="px-4">
      <div className="flex items-center justify-between mb-4">
        <span className="font-bold text-[13px] text-white">Recent activity</span>
        {transactions.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[12px] text-orange font-semibold cursor-pointer focus-visible:outline-none"
          >
            See all
          </button>
        )}
      </div>

      {query.isLoading && (
        <div className="flex flex-col">
          <TransactionSkeleton />
          <TransactionSkeleton />
          <TransactionSkeleton />
        </div>
      )}

      {!query.isLoading && query.isError && (
        <div className="flex flex-col items-center py-8 text-center">
          <AlertCircle size={24} strokeWidth={1.5} className="text-white/20 mb-2" />
          <p className="text-[13px] text-white/30">Could not load transactions.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 text-[12px] text-orange font-semibold cursor-pointer focus-visible:outline-none"
          >
            Retry
          </button>
        </div>
      )}

      {!query.isLoading && !query.isError && transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity size={28} strokeWidth={1.5} className="text-white/20 mb-3" />
          <p className="text-[14px] font-bold text-white/40 mb-1">No transactions yet</p>
          <p className="text-[12px] text-white/25">Add money to get started.</p>
          <button
            type="button"
            onClick={onAddMoney}
            className="mt-4 px-5 py-2.5 rounded-xl bg-orange/15 border border-orange/25 text-orange text-[13px] font-semibold focus-visible:outline-none"
          >
            Add money
          </button>
        </div>
      )}

      {!query.isLoading && !query.isError && transactions.length > 0 && (
        <div className="flex flex-col">
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} transaction={tx} />
          ))}
        </div>
      )}
    </div>
  );
}
