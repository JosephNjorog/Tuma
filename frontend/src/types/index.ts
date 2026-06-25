export type CountryConfig = {
  code: string;
  name: string;
  dial: string;
  rail: string;
  phoneLength: number;
};


export type AssetBalance = {
  symbol: string;
  balance: string;
  balanceUsd: number;
};

export type WalletBalance = {
  walletAddress: string | null;
  totalUsd: number;
  assets: AssetBalance[];
  network?: string;
  status?: "deploying" | "active";
};

export type Transaction = {
  id: string;
  reference: string;
  direction: "in" | "out";
  counterparty: string | null;
  amountUsd: number;
  amountLocal: number;
  localCurrency: string;
  fxRate: number;
  rail: string;
  status: "pending" | "completed" | "failed";
  note: string | null;
  failureStage: string | null;
  failureReason: string | null;
  createdAt: string;
  settledAt: string | null;
};

export type UserSession = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  phone: string;
  display_name: string | null;
  wallet_address: string | null;
};

export type ApiError = {
  code: number;
  message: string;
  detail: string | null;
};

export type SignupStoreState = {
  country_code: string;
  phone: string;
  email: string;
  otp_id: string | null;
  signup_token: string | null;
  pin_hash: string | null;
  passkey_registered: boolean;
};

export type WalletStatus = {
  status: "deploying" | "active";
  wallet_address: string | null;
};
