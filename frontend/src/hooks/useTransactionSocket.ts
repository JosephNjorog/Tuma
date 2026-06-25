import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/stores/sessionStore";
import type { Transaction } from "@/types";

export function useTransactionSocket() {
  const queryClient = useQueryClient();
  const access_token = useSessionStore((s) => s.access_token);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(5000);
  const unmountedRef = useRef(false);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!access_token || !wsUrl) return;
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const ws = new WebSocket(
        `${wsUrl}/ws/transactions?token=${access_token}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelayRef.current = 5000;
      };

      ws.onmessage = (event) => {
        try {
          const tx = JSON.parse(event.data as string) as Transaction;
          if (!tx?.id || !tx?.amount_usdc) return;

          queryClient.setQueryData<{ transactions: Transaction[] }>(
            ["transactions", "recent"],
            (old) => {
              if (!old) return old;
              if (old.transactions.some((t) => t.id === tx.id)) return old;
              return { transactions: [tx, ...old.transactions.slice(0, 4)] };
            }
          );
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        // silent — reconnect on close
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, 30000);
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [access_token, queryClient]);
}
