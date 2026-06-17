const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, ...init } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const json = (await res.json()) as { ok: boolean; data?: T; error?: string; code?: string };
  if (!res.ok || !json.ok) {
    throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`, json.code);
  }
  return json.data as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  phone: string;
  walletAddress: string | null;
  isMerchant: boolean;
};

export type AuthResponse = {
  isNewUser: boolean;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

// ── FX ────────────────────────────────────────────────────────────────────────

export type FxQuote = {
  quoteId: string;
  fromToken: string;
  fromAmountUsd: number;
  toAmount: number;
  toCurrency: string;
  tumaRate: number;
  midRate: number;
  savingsVsBank: number;
  rail: string;
  recipientCountry: string;
  lockedUntil: string;
};

// ── Transactions ──────────────────────────────────────────────────────────────

export type TxStatus =
  | "initiated"
  | "onchain"
  | "routed"
  | "settled"
  | "requires_review"
  | "failed"
  | "expired";

export type Notification = {
  id: string;
  kind: "received" | "settled" | "failed";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};

export type TxSummary = {
  id: string;
  reference: string;
  direction: "in" | "out";
  counterparty: string;
  amountUsd: number;
  amountLocal: number;
  localCurrency: string;
  fxRate: number;
  rail: string;
  status: TxStatus;
  note: string | null;
  failureStage?: string | null;
  failureReason?: string | null;
  failedAt?: string | null;
  createdAt: string;
  settledAt: string | null;
};

// ── Wallet ────────────────────────────────────────────────────────────────────

export type WalletAsset = {
  symbol: string;
  address: string;
  balance: string;
  balanceUsd: number;
  decimals: number;
};

export type WalletData = {
  walletAddress: string | null;
  status?: "deploying";
  message?: string;
  explorerUrl?: string;
  totalUsd?: number;
  assets?: WalletAsset[];
  network?: string;
  externalWalletAddress?: string | null;
  externalWalletType?: string | null;
};

// ── API client ────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    sendOtp: (phone: string, email?: string) =>
      request<{ message: string; expiresIn: number; channel: "email" | "sms" }>("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone, email }),
      }),

    verifyOtp: (phone: string, code: string) =>
      request<AuthResponse>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      }),

    refresh: (refreshToken: string) =>
      request<{ accessToken: string }>("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }),

    logout: (refreshToken: string, token: string) =>
      request<void>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        token,
      }),

    setPassword: (email: string, password: string, token: string) =>
      request<{ message: string }>("/api/auth/set-password", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        token,
      }),

    login: (email: string, password: string) =>
      request<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
  },

  wallet: {
    get: (token: string) => request<WalletData>("/api/wallet", { token }),

    connect: (address: string, walletType: string, token: string) =>
      request<{ address: string; walletType: string }>("/api/wallet/connect", {
        method: "POST",
        body: JSON.stringify({ address, walletType }),
        token,
      }),

    disconnect: (token: string) =>
      request<void>("/api/wallet/connect", { method: "DELETE", token }),

    balances: (address: string, token: string) =>
      request<{ address: string; totalUsd: number; assets: WalletAsset[]; explorerUrl: string }>(
        `/api/wallet/balances/${address}`,
        { token }
      ),
  },

  fx: {
    quote: (amountUsd: number, recipientPhone: string, token: string) =>
      request<FxQuote>("/api/fx/quote", {
        method: "POST",
        body: JSON.stringify({ amountUsd, recipientPhone }),
        token,
      }),

    rates: (token: string) =>
      request<{ currency: string; mid: number; tuma: number; savings: string }[]>(
        "/api/fx/rates",
        { token }
      ),
  },

  send: {
    send: (
      body: {
        quoteId: string;
        recipientPhone: string;
        amountUsd: number;
        token?: string;
        note?: string;
        idempotencyKey?: string;
      },
      token: string
    ) =>
      request<{
        transactionId: string;
        reference: string;
        type: "direct" | "escrow";
        rail: string;
        amountLocal: number;
        localCurrency: string;
        status: string;
        escrowRef?: string;
        claimUrl?: string;
        expiresAt?: string;
        failureStage?: string | null;
        failureReason?: string | null;
        idempotentReplay?: boolean;
      }>("/api/send", { method: "POST", body: JSON.stringify(body), token }),
  },

  fund: {
    card: (amountUsd: number, token: string) =>
      request<{
        authorizationUrl: string;
        accessCode: string;
        reference: string;
        fee: number;
        youReceive: number;
      }>("/api/fund/card", { method: "POST", body: JSON.stringify({ amountUsd }), token }),

    mobile: (amountLocal: number, token: string) =>
      request<{
        reference: string;
        amountLocal: number;
        currency: string;
        provider: string;
        displayText: string;
        estimatedUsdc: number;
      }>("/api/fund/mobile", { method: "POST", body: JSON.stringify({ amountLocal }), token }),

    bank: (token: string) =>
      request<{
        bankName: string;
        accountName: string;
        accountNumber: string;
        routingReference: string;
        fee: number;
      }>("/api/fund/bank", { token }),

    crypto: (token: string) =>
      request<{
        walletAddress: string | null;
        network: string;
        chainId: number;
        supportedTokens: string[];
        usdcAddress: string;
        usdtAddress: string | null;
      }>("/api/fund/crypto", { token }),

    confirmCrypto: (txHash: string, token: string) =>
      request<{ transactionId: string; amountUsd?: number; token?: string; alreadyRecorded?: boolean }>(
        "/api/fund/crypto/confirm",
        { method: "POST", body: JSON.stringify({ txHash }), token }
      ),
  },

  history: {
    list: (
      token: string,
      params: { filter?: "all" | "in" | "out"; page?: number; limit?: number } = {}
    ) => {
      const q = new URLSearchParams({
        filter: params.filter ?? "all",
        page: String(params.page ?? 1),
        limit: String(params.limit ?? 20),
      });
      return request<{
        transactions: TxSummary[];
        pagination: { total: number; page: number; limit: number; pages: number };
      }>(`/api/history?${q}`, { token });
    },
  },

  track: {
    get: (id: string, token: string) =>
      request<{
        transaction: TxSummary;
        events: { step: string; metadata: Record<string, unknown>; createdAt: string }[];
      }>(`/api/track/${id}`, { token }),
  },

  claim: {
    get: (ref: string) =>
      request<{
        ref?: string;
        senderPhone?: string;
        amountUsdc?: number;
        expiresAt?: string;
        status: string;
        message?: string;
      }>(`/api/claim/${ref}`),

    claim: (ref: string, token: string) =>
      request<{
        ref: string;
        amountUsdc: number;
        amountLocal: number;
        localCurrency: string;
        rail: string;
      }>("/api/claim", { method: "POST", body: JSON.stringify({ ref }), token }),
  },

  notifications: {
    list: (token: string) =>
      request<{ notifications: Notification[]; unread: number }>("/api/notifications", { token }),

    markSeen: (token: string) =>
      request<Record<string, never>>("/api/notifications/seen", { method: "POST", token }),
  },
};
