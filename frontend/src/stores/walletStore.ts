import { create } from "zustand";
import type { WalletBalance } from "@/types";

type WalletState = {
  usdc_balance: string;
  usdt_balance: string;
  avax_balance: string;
  total_usd: string;
  last_fetched: number | null;

  setBalance: (balance: WalletBalance) => void;
  clearBalance: () => void;
};

export const useWalletStore = create<WalletState>()((set) => ({
  usdc_balance: "0",
  usdt_balance: "0",
  avax_balance: "0",
  total_usd: "0",
  last_fetched: null,

  setBalance: (balance) =>
    set({
      usdc_balance: balance.assets.find((a) => a.symbol === "USDC")?.balance ?? "0",
      usdt_balance: balance.assets.find((a) => a.symbol === "USDT")?.balance ?? "0",
      avax_balance: balance.assets.find((a) => a.symbol === "AVAX")?.balance ?? "0",
      total_usd: balance.totalUsd.toFixed(2),
      last_fetched: Date.now(),
    }),

  clearBalance: () =>
    set({
      usdc_balance: "0",
      usdt_balance: "0",
      avax_balance: "0",
      total_usd: "0",
      last_fetched: null,
    }),
}));
