import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Check, ExternalLink, ShieldCheck, Wallet2, Unlink, Loader2, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { avalanche } from "@reown/appkit/networks";
import { MobileFrame } from "@/components/MobileFrame";
import { BottomNav } from "@/components/BottomNav";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { api, type WalletAsset, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { useCurrencyStore } from "@/lib/currency-store";
import { useKesRate } from "@/hooks/use-kes-rate";
import { formatMoney } from "@/lib/tuma-data";

export const Route = createFileRoute("/wallet")({
  beforeLoad: () => {
    const s = useSessionStore.getState();
    if (!s.isAuthenticated() || !s.is_unlocked) {
      sessionStorage.setItem("autopayke_redirect_to", "/wallet");
      throw redirect({ to: "/login", replace: true });
    }
  },
  head: () => ({ meta: [{ title: "Wallet · Autopayke" }, { name: "description", content: "Your non-custodial smart wallet on Avalanche." }] }),
  component: Wallet,
});

function assetColor(symbol: string) {
  if (symbol === "USDC") return "bg-blue-600";
  if (symbol === "USDT") return "bg-emerald-500";
  if (symbol === "AVAX") return "bg-red-500";
  return "bg-muted";
}

function Wallet() {
  const navigate = useNavigate();
  const { accessToken, user, isLoggedIn } = useAuthStore();
  const { displayCurrency } = useCurrencyStore();
  const kesRate = useKesRate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [extCopied, setExtCopied] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const { open } = useAppKit();
  const { address: wagmiAddress, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== undefined && chainId !== avalanche.id;

  useEffect(() => {
    if (!isLoggedIn()) navigate({ to: "/signup" });
  }, [isLoggedIn, navigate]);

  const { data: wallet, isLoading } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.wallet.get(accessToken!),
    enabled: !!accessToken,
    refetchInterval: (q) => q.state.data?.status === "deploying" ? 4_000 : false,
  });

  const extAddress = wagmiAddress ?? wallet?.externalWalletAddress ?? null;

  const { data: extBalances, isLoading: extLoading } = useQuery({
    queryKey: ["ext-balances", extAddress],
    queryFn: () => api.wallet.balances(extAddress!, accessToken!),
    enabled: !!accessToken && !!extAddress,
  });

  const connectMutation = useMutation({
    mutationFn: ({ address, walletType }: { address: string; walletType: string }) =>
      api.wallet.connect(address, walletType, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["ext-balances"] });
      setConnectError(null);
    },
    onError: (e) => {
      setConnectError(e instanceof ApiError ? e.message : "Failed to link wallet.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.wallet.disconnect(accessToken!),
    onSuccess: () => {
      disconnect();
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["ext-balances"] });
    },
  });

  useEffect(() => {
    if (!isConnected || !wagmiAddress || !accessToken) return;
    // Avoid redundant calls if this address is already linked, or a link
    // request for it is already in flight — mobile wallets can emit the
    // connection event more than once in quick succession.
    if (wallet?.externalWalletAddress === wagmiAddress) return;
    if (connectMutation.isPending) return;
    connectMutation.mutate({ address: wagmiAddress, walletType: "walletconnect" });
  }, [isConnected, wagmiAddress, accessToken, wallet?.externalWalletAddress]);

  const tumaAddress = wallet?.walletAddress;
  const assets: WalletAsset[] = wallet?.assets ?? [];
  const totalUsd = wallet?.totalUsd ?? 0;
  const isDeploying = wallet?.status === "deploying";
  const explorerUrl = wallet?.explorerUrl;
  const short = tumaAddress ? `${tumaAddress.slice(0, 6)}…${tumaAddress.slice(-4)}` : "—";

  function copy(s: string, ext?: boolean) {
    navigator.clipboard?.writeText(s);
    if (ext) { setExtCopied(true); setTimeout(() => setExtCopied(false), 1500); }
    else { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  }

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-2">
          <Link to="/dashboard" className="h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Smart wallet</h1>
          <span className="text-[10px] font-bold text-success bg-success-soft px-2 py-1 rounded-full">Avalanche</span>
        </header>

        {isDeploying && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl bg-warning-soft px-4 py-2.5 text-xs text-warning-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            Smart wallet is deploying on Avalanche…
          </div>
        )}

        {/* Autopayke smart wallet */}
        <div className="px-5 mt-3">
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <img src="/autopay_iconlogo.svg" alt="Autopayke" className="h-9 w-9 rounded-xl" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Autopayke smart wallet</p>
                <p className="text-sm font-bold">{user?.phone ?? "—"}</p>
              </div>
            </div>
            {isLoading ? (
              <div className="mt-3 h-8 w-48 rounded-xl bg-muted animate-pulse" />
            ) : (
              <>
                <p className="mt-4 text-[10px] uppercase tracking-wider text-muted-foreground">Address</p>
                <p className="font-mono text-xs break-all mt-1">{tumaAddress ?? (isDeploying ? "Deploying…" : "—")}</p>
              </>
            )}
            {tumaAddress && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => copy(tumaAddress)}
                  className="rounded-xl border border-border bg-background py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                </button>
                {explorerUrl ? (
                  <a href={explorerUrl} target="_blank" rel="noreferrer"
                    className="rounded-xl border border-border bg-background py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> Snowtrace
                  </a>
                ) : (
                  <span className="rounded-xl border border-border bg-background py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 opacity-40">
                    <ExternalLink className="h-3.5 w-3.5" /> Snowtrace
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* On-chain balance */}
        <div className="px-5 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">On-chain total</p>
            <CurrencyToggle />
          </div>
          <p className="mt-1 text-2xl font-black text-right">{formatMoney(totalUsd, displayCurrency, kesRate)}</p>
        </div>

        <div className="px-5 mt-3 space-y-2">
          {isLoading && [0,1].map((i) => <div key={i} className="h-16 rounded-2xl bg-card border border-border animate-pulse" />)}
          {!isLoading && assets.length === 0 && !isDeploying && (
            <p className="text-xs text-muted-foreground py-2">No assets yet. Fund your wallet to get started.</p>
          )}
          {assets.map((a) => (
            <div key={a.symbol} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
              <div className={`h-11 w-11 rounded-full ${assetColor(a.symbol)} flex items-center justify-center text-sm font-bold text-white`}>{a.symbol[0]}</div>
              <div className="flex-1">
                <p className="text-sm font-bold">{a.symbol}</p>
                <p className="text-[11px] text-muted-foreground">Avalanche C-Chain</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{parseFloat(a.balance).toFixed(4)}</p>
                <p className="text-[11px] text-muted-foreground">{formatMoney(a.balanceUsd, displayCurrency, kesRate)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* External wallet connect */}
        <div className="px-5 mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">External wallet</p>
            {extAddress && (
              <button onClick={() => disconnectMutation.mutate()}
                className="text-[10px] text-destructive font-semibold flex items-center gap-1">
                <Unlink className="h-3 w-3" /> Disconnect
              </button>
            )}
          </div>

          {!extAddress ? (
            <button onClick={() => open()} disabled={connectMutation.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold hover:bg-muted/50 transition disabled:opacity-60">
              {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Wallet2 className="h-4 w-4 text-primary" />}
              {connectMutation.isPending ? "Linking wallet…" : "Connect MetaMask / Core / WalletConnect"}
            </button>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Wallet2 className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Connected</p>
                  <p className="font-mono text-xs truncate">{extAddress}</p>
                </div>
                <button onClick={() => copy(extAddress, true)}
                  className="h-7 w-7 rounded-xl border border-border bg-background flex items-center justify-center">
                  {extCopied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>

              {wrongChain && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
                  <span>Wrong network — switch to Avalanche to see your balance.</span>
                  <button
                    onClick={() => switchChain({ chainId: avalanche.id })}
                    disabled={isSwitchingChain}
                    className="shrink-0 rounded-full bg-warning-foreground/10 px-2.5 py-1 font-semibold disabled:opacity-50"
                  >
                    {isSwitchingChain ? "Switching…" : "Switch"}
                  </button>
                </div>
              )}

              {extLoading && <div className="mt-3 h-16 rounded-2xl bg-muted animate-pulse" />}

              {extBalances && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">On-chain balance</p>
                    <p className="text-sm font-black">{formatMoney(extBalances.totalUsd, displayCurrency, kesRate)}</p>
                  </div>
                  <div className="space-y-1.5">
                    {extBalances.assets.map((a) => (
                      <div key={a.symbol} className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{a.symbol}</span>
                        <span className="text-muted-foreground">{parseFloat(a.balance).toFixed(4)} · {formatMoney(a.balanceUsd, displayCurrency, kesRate)}</span>
                      </div>
                    ))}
                  </div>
                  {extBalances.explorerUrl && (
                    <a href={extBalances.explorerUrl} target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary font-semibold">
                      <ExternalLink className="h-3 w-3" /> View on Snowtrace
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {connectError && (
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{connectError}
            </div>
          )}
        </div>

        {/* Security note */}
        <div className="px-5 mt-4">
          <div className="rounded-2xl bg-primary-soft p-4 flex gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Self-custodial. No seed phrase.</p>
              <p className="text-[11px] text-muted-foreground mt-1">Your Autopayke wallet is derived on-device from your phone number. We can't see your keys or move your funds.</p>
            </div>
          </div>
        </div>

        <div className="h-24" />
        <BottomNav />
      </div>
    </MobileFrame>
  );
}
