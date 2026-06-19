# Autopayke

> Money that moves like a text message.

Autopayke is a mobile-first, phone-number-based cross-border money transfer and payments application built for Africa. It lets users send, receive, and spend money across African countries using just a phone number — no bank account, no crypto wallet setup, no seed phrases.

Under the hood, Autopayke runs on the Avalanche blockchain with USDC/USDT stablecoins, but that complexity is completely invisible to the user. Payments settle to local rails (M-Pesa, MTN MoMo, Wave, Orange Money, bank transfers) in under 12 seconds with no network fees — costs are covered by a 2.3% FX spread baked into the exchange rate.

---

## What Makes Autopayke Different

| Feature | Autopayke | Traditional Transfer |
|---|---|---|
| Identity | Phone number | Account + password |
| Wallet setup | Automatic, no seed phrase | Manual, technical |
| Settlement | ~12 seconds | 1–3 business days |
| Network fee | $0 | $5–$15+ |
| Non-user transfers | SMS claim link | Requires account |
| Local rails | M-Pesa, MoMo, Wave, OrangeMoney | SWIFT / slow |

---

## Tech Stack

**Framework:** React 19 + TanStack Start (SSR) + TanStack Router (file-based routing)
**Styling:** Tailwind CSS 4 + Radix UI + shadcn/ui component library
**Forms:** React Hook Form + Zod validation
**Charts:** Recharts
**Build:** Vite 7 + Bun + TypeScript 5
**Deployment target:** Cloudflare (via Nitro)

---

## Features

### Authentication & Identity
- Phone number is the only identity required — no email, no password
- 6-digit SMS OTP verification
- Smart wallet automatically deployed on Avalanche C-Chain on first login
- Key derived from passkey (biometrics) — no seed phrase to write down or lose
- Non-custodial: user always owns their keys

### Send Money
- Search contacts by name or phone number, or type any phone number
- Amount entry in USD; recipient sees local currency equivalent in real time
- FX rate locked for 30 seconds during review
- Savings calculator shows how much cheaper Autopayke is vs. a bank
- Recipient rail auto-selected based on their country (M-Pesa, MoMo, Wave, etc.)
- One-line optional note field
- Slide-to-confirm gesture for the final send action
- Settlement timeline tracking after send

### Unclaimed Payments
- Send to any phone number, even if they don't have a Autopayke account
- Recipient gets an SMS with a claim link (e.g., `autopayke.com/claim/T7791`)
- Funds held in escrow for 7 days; returned to sender if unclaimed

### Receive Money
- Autopayke Passport: a personal QR code + phone number display
- Anyone can scan or look up the number to send
- Download QR for printing or sharing
- Copy phone number to clipboard

### Fund Wallet
Three methods to top up:
- **Card** — via Paystack (1.5% fee)
- **Bank transfer** — unique one-time account details generated per deposit ($0.30 flat)
- **Crypto** — direct deposit to Avalanche address (free)

### Merchant Mode
- Toggle a "till" open or closed to accept payments
- Revenue dashboard: today, weekly, monthly, unique customer count
- Auto-settlement: choose to settle to MTN MoMo or a bank account
- Settlement schedule: Instant, Daily, or Weekly
- Separate transaction view filtered to merchant payments only

### Wallet Management
- View your non-custodial Avalanche C-Chain address
- Multi-asset support: USDC, USDT, AVAX
- Per-asset balances with USD equivalents
- Link to Snowtrace block explorer
- Copy address to clipboard

### Transaction History
- Full activity feed with direction indicators (in / out)
- Filter tabs: All, Received, Sent
- Each entry shows: counterparty, rail used, local currency amount, FX rate, timestamp, status (settled / pending)

### Settlement Tracker
- Live 4-step timeline for every outbound transaction:
  1. Initiated — signed and broadcast to Avalanche
  2. On-chain confirmed — Avalanche finality (~1.2s)
  3. Routed to rail — handed off to M-Pesa / MoMo / Wave / etc.
  4. Settled — credited to recipient's mobile money or bank account
- Shows reference number, asset, rail, and locked FX rate
- Share receipt button

### QR Scanner
- Full-screen scanner with animated corner markers
- Handles four QR types: personal Autopayke number, static merchant, dynamic checkout, invoice

---

## Supported Countries & Rails

| Country | Dial Code | Rail |
|---|---|---|
| Kenya | +254 | M-Pesa |
| Ghana | +233 | MTN MoMo |
| Nigeria | +234 | Paystack |
| Senegal | +221 | Wave, Orange Money |
| Tanzania | +255 | M-Pesa Tanzania |
| Uganda | +256 | MTN MoMo Uganda |
| Côte d'Ivoire | +225 | Orange Money |

---

## User Flows

### New User: Sign Up & Send

```
Landing Page
  └─ "Get my number" CTA
       └─ /signup
            ├─ Step 1: Select country + enter phone number
            ├─ Step 2: Enter 6-digit OTP
            └─ Step 3: Wallet spinning up (Avalanche deploy)
                 └─ Success: "Your Autopayke number is ready"
                      ├─ "Add money to wallet" → /fund
                      └─ "Skip" → /dashboard
```

```
/fund (optional)
  ├─ Card (Paystack)
  ├─ Bank transfer
  └─ Crypto deposit
       └─ Success → /dashboard
```

```
/dashboard
  └─ "Send" quick action
       └─ /send
            ├─ Step 1: Pick recipient (contacts or type phone)
            ├─ Step 2: Enter amount (USD → local FX, 30s rate lock)
            ├─ Step 3: Review (from/to, rail, rate, fee, ETA)
            └─ Step 4: Slide to confirm
                 ├─ Autopayke user → "Sent!" → /track/:id
                 └─ Non-Autopayke → "Link sent!" (SMS claim dispatched)
```

### Recipient: Claim an Unclaimed Payment

```
SMS: "Ama sent you GHS 380. Tap to claim: autopayke.com/claim/T7791"
  └─ /claim/:ref
       ├─ Shows sender, amount, reference
       └─ "Claim my GHS 380"
            └─ /signup (if not already a user)
```

### Merchant: Accept a Payment

```
/merchant
  └─ Toggle till: Open
       └─ Customer scans merchant QR (/receive)
            └─ Funds arrive → auto-settled to MoMo / bank per schedule
```

### Track a Settlement

```
/track/:id
  ├─ ✓ Initiated
  ├─ ✓ On-chain confirmed
  ├─ ✓ Routed to MTN MoMo
  └─ ⏳ Settled (live polling)
```

---

## Project Structure

```
frontend/
└─ src/
   ├─ routes/          # One file per page (file-based routing)
   │   ├─ index.tsx           Landing page
   │   ├─ signup.tsx          Phone + OTP + wallet creation
   │   ├─ dashboard.tsx       Balance, assets, quick actions
   │   ├─ send.tsx            4-step send flow
   │   ├─ receive.tsx         Autopayke Passport (QR + phone)
   │   ├─ fund.tsx            Add money (card/bank/crypto)
   │   ├─ wallet.tsx          On-chain asset view
   │   ├─ merchant.tsx        Merchant dashboard + till
   │   ├─ history.tsx         Transaction activity feed
   │   ├─ track.$id.tsx       Settlement timeline
   │   ├─ claim.$ref.tsx      Unclaimed payment claim
   │   └─ scan.tsx            QR scanner
   ├─ components/      # Shared UI (MobileFrame, BottomNav, shadcn/ui)
   ├─ lib/
   │   └─ tuma-data.ts # Mock contacts, rates, transactions
   └─ styles.css       # Tailwind + design tokens
```

---

## Repository Structure

```
tuma/
├── frontend/          React + TanStack Start (prototype UI)
├── backend/           Hono + Bun API server
├── packages/shared/   Zod schemas + TypeScript types (shared by frontend + backend)
└── contracts/         Solidity smart contracts (Foundry)
```

---

## Running Locally

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- PostgreSQL 15+
- Redis 7+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for contracts)

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example backend/.env
# Fill in all values — see .env.example for documentation
# Set OPERATIONS_API_TOKEN to enable /api/ops/* recovery endpoints.
```

### 3. Start the database

```bash
# Start PostgreSQL + Redis (Docker example)
docker run -d --name tuma-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:15
docker run -d --name tuma-redis -p 6379:6379 redis:7

# Run DB migrations
bun db:push
```

### 4. Start the backend

```bash
bun run dev:backend          # API server on http://localhost:3001
bun run worker:settlement    # Settlement polling worker (separate terminal)
bun run worker:escrow        # Escrow expiry and claim reconciliation worker
bun run worker:rail          # Rail payout worker (separate terminal)
bun run worker:notify        # WhatsApp notification worker (separate terminal)
```

### 5. Start the frontend

```bash
bun run dev:frontend         # Frontend on http://localhost:3000
```

---

## Backend API

Base URL: `http://localhost:3001/api`

| Method | Route | Auth | Description |
| ------ | ----- | ---- | ----------- |
| POST | `/auth/send-otp` | — | Send WhatsApp OTP |
| POST | `/auth/verify-otp` | — | Verify OTP → get JWT |
| POST | `/auth/refresh` | — | Refresh access token |
| POST | `/auth/logout` | — | Invalidate session |
| GET | `/wallet` | ✓ | Wallet address + on-chain balances |
| GET | `/wallet/assets` | ✓ | Per-token breakdown |
| GET | `/fx/rates` | — | Live FX rates (public) |
| POST | `/fx/quote` | ✓ | Lock FX rate for 30s |
| POST | `/send` | ✓ | Execute a transfer |
| GET | `/receive` | ✓ | QR payload + deep link |
| POST | `/fund/card` | ✓ | Paystack card checkout |
| GET | `/fund/bank` | ✓ | Virtual bank account |
| GET | `/fund/crypto` | ✓ | Crypto deposit address |
| GET | `/history` | ✓ | Transaction history |
| GET | `/track/:id` | ✓ | Settlement timeline |
| GET | `/claim/:ref` | — | Preview unclaimed payment |
| POST | `/claim` | ✓ | Claim an escrow payment |
| GET | `/merchant/settings` | ✓ | Merchant config |
| PUT | `/merchant/settings` | ✓ | Update merchant config |
| GET | `/merchant/stats` | ✓ | Revenue dashboard |
| PATCH | `/merchant/till` | ✓ | Toggle till open/closed |

Webhooks (no auth — signature-verified internally):

- `POST /webhooks/paystack` — Paystack payment confirmation
- `POST /webhooks/mpesa/result` — M-Pesa B2C result
- `POST /webhooks/mpesa/stk` — M-Pesa STK Push result
- `POST /webhooks/momo` — MTN MoMo callback

---

## Testing And CI

Common local checks:

```bash
# Shared + backend TypeScript
bun run typecheck

# Backend unit tests
bun run --cwd backend test:unit

# Backend integration tests (requires Postgres + Redis)
DATABASE_URL=postgresql://tuma:password@localhost:5432/tuma_db \
DATABASE_SSL=false \
REDIS_URL=redis://localhost:6379 \
JWT_ACCESS_SECRET=test-access-secret-with-enough-length \
JWT_REFRESH_SECRET=test-refresh-secret-with-enough-length \
OPERATIONS_API_TOKEN=test-ops-token \
WALLET_DERIVE_SECRET=test-wallet-derive-secret \
bun run --cwd backend test:integration

# Frontend production build
bun run --cwd frontend build
```

The GitHub Actions workflow in [.github/workflows/ci.yml](.github/workflows/ci.yml) runs backend typecheck, backend unit tests, backend integration tests with Postgres/Redis services, frontend build, and contract build/tests with Foundry.

Tradeoffs and current gaps:

- Integration tests run migrations and reset Postgres/Redis between specs, so they are slower but catch route, DB, and queue regressions together.
- The first resilience integration clusters cover heartbeat alert visibility and rail dead-letter retry queue handoff.
- Frontend lint is not yet a CI gate because the current frontend has a pre-existing Prettier baseline to clean up.
- Local contract tests need Foundry installed; CI installs Foundry before running contract checks.

---

## Smart Contracts

All contracts are in [contracts/src/](contracts/src/) and written in Solidity 0.8.24.

| Contract | Description |
| -------- | ----------- |
| `AutopayRegistry` | Maps hashed phone numbers → wallet addresses. Privacy-preserving on-chain phone book. |
| `AutopaySmartWallet` | ERC-4337 smart account per user. Owner + guardian model. Supports `execute`, `executeBatch`, `transferToken`. |
| `AutopayWalletFactory` | CREATE2 factory for `AutopaySmartWallet`. Deterministic addresses — predict before deployment. |
| `AutopayEscrow` | Holds USDC for unclaimed payments. 7-day expiry with auto-refund. Claim requires backend signature. |
| `AutopayPaymaster` | ERC-4337 Paymaster. Sponsors gas for all Autopayke wallet operations so users pay zero network fees. |

### Build & test

```bash
# Install Foundry dependencies
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
forge install eth-infinitism/account-abstraction

# Compile
forge build

# Run tests
forge test -vvv

# Deploy to Fuji testnet
forge script script/Deploy.s.sol --rpc-url fuji --broadcast --verify
```

### Contract addresses

| Network | Contract | Address |
| ------- | -------- | ------- |
| Fuji Testnet | AutopayRegistry | *(deploy and update)* |
| Fuji Testnet | AutopayWalletFactory | *(deploy and update)* |
| Fuji Testnet | AutopayEscrow | *(deploy and update)* |
| Fuji Testnet | AutopayPaymaster | *(deploy and update)* |
| Avalanche Mainnet | All | *(after audit)* |

---

## WhatsApp OTP

Verification codes are sent via **Africa's Talking WhatsApp Business API**.

Required Meta-approved templates:

- `autopayke_otp` — `"Your Autopayke code is {{1}}. Valid for 5 minutes. Never share this."`
- `autopayke_claim_link` — `"{{1}} sent you {{2}} {{3}} on Autopayke. Claim it here: {{4}}"`
- `autopayke_received` — `"You received {{1}} {{2}} from {{3}} on Autopayke."`

---

## Payment Rails

| Country | Dial | Rail | API |
| ------- | ---- | ---- | --- |
| Kenya | +254 | M-Pesa | Daraja B2C / STK Push |
| Ghana | +233 | MTN MoMo | MoMo Disbursements |
| Nigeria | +234 | Paystack | Paystack Transfer |
| Senegal | +221 | Wave | Wave Business Payout |
| Côte d'Ivoire | +225 | Orange Money | *(pending)* |
| Tanzania | +255 | M-Pesa TZ | Daraja |
| Uganda | +256 | MTN MoMo | MoMo Disbursements |

**Card payments** (fund wallet): Paystack card checkout across all markets.

---

## Architecture

### Component View

```mermaid
flowchart LR
  app["Mobile app / web client"]
  api["Hono API (Bun)"]
  db[("PostgreSQL\nusers, transactions, settlement_events, escrow_payments")]
  redis[("Redis\nOTP, sessions, FX cache, locks")]
  queues["BullMQ queues\nrail_disburse, whatsapp_notify, settlement_poll, escrow_expire"]
  chain["Avalanche C-Chain\nAutopayWallet, AutopayEscrow, Paymaster"]
  fx["Open Exchange Rates"]
  whatsapp["Africa's Talking WhatsApp"]
  rails["Local rails\nM-Pesa, MoMo, Paystack, Wave"]

  railWorker["rail.worker\nretry payouts"]
  notifyWorker["notify.worker\nretry messages"]
  settlementWorker["settlement.worker\npoll rail status"]
  escrowWorker["escrow.worker\nrefund expired escrow + reconcile claims"]

  app -->|JWT, idempotency key| api
  api -->|read/write state| db
  api -->|OTP, sessions, quote cache, locks| redis
  api -->|quote rates| fx
  api -->|smart wallet transfer, escrow deposit, claim| chain
  api -->|enqueue side effects| queues
  api -->|local/dev fallback only| rails
  api -->|local/dev fallback only| whatsapp

  queues --> railWorker
  queues --> notifyWorker
  queues --> settlementWorker
  queues --> escrowWorker

  railWorker -->|submit payout| rails
  notifyWorker -->|send OTP, claim link, receipt| whatsapp
  settlementWorker -->|poll pending payout| rails
  escrowWorker -->|refund unclaimed escrow| chain

  rails -->|webhooks| api
  api -->|record settled, failed, requires_review| db

  classDef core fill:#eef6ff,stroke:#1d4ed8,color:#0f172a;
  classDef state fill:#f8fafc,stroke:#64748b,color:#0f172a;
  classDef external fill:#fff7ed,stroke:#ea580c,color:#0f172a;
  classDef worker fill:#ecfdf5,stroke:#059669,color:#0f172a;

  class api,app core;
  class db,redis,queues state;
  class chain,fx,whatsapp,rails external;
  class railWorker,notifyWorker,settlementWorker,escrowWorker worker;
```

### Send/Escrow Success And Failure Paths

Legend: green is successful state progression, blue is active processing, amber is retry/review, and red is terminal failure or no-money-moved request failure.

```mermaid
flowchart TD
  start["POST /api/send"]
  idem{"Idempotency key seen before?"}
  replay["Return original transaction\nno new quote or transfer"]
  lock["Acquire sender-scoped idempotency lock"]
  validate["Consume quote\nvalidate sender wallet and balance"]
  requestFail["Request fails\nno money moved"]
  tx["Create transaction\nstatus: initiated"]
  recipient{"Recipient has Autopayke wallet?"}

  directChain["Direct on-chain USDC transfer"]
  directOnchain["Store txHash\nrecord status: onchain"]
  escrowDeposit["Approve + deposit into AutopayEscrow"]
  escrowOnchain["Store escrowRef + txHash\nrecord status: onchain"]
  claimLink["Queue WhatsApp claim link"]
  recipientClaim["Recipient verifies OTP\nclaims escrow on-chain"]
  claimRecorded["Store claimTxHash\nattach recipient wallet"]
  claimScan["Claim reconciliation scanner\nrepairs post-chain DB updates"]
  chainEventScan["Escrow chain-event scanner\nDeposited + Claimed + Refunded"]

  railQueue["Queue rail_disburse job"]
  railWorker["rail.worker submits payout"]
  railDeadLetter["Rail dead-letter API\nlist + retry with same provider key"]
  routed["Record status: routed\nstore railReference"]
  settleWait{"Settlement confirmation"}
  settled["Record status: settled"]
  failed["Record status: failed"]
  retry["Retry with backoff"]
  review["Record status: requires_review\ninclude failureStage + failureReason"]
  reviewOps["Ops review API\nresend link + attach txHash + retry refund"]

  expiry["Escrow reaches expiresAt\nescrow.worker refund"]
  expired["Record status: expired\nsender refunded"]
  scanner["Expiry scanner\nrepairs missed delayed jobs"]

  start --> idem
  idem -->|yes| replay
  idem -->|no| lock
  lock --> validate
  validate -->|quote expired, wallet missing, insufficient funds| requestFail
  validate -->|valid| tx
  tx --> recipient

  recipient -->|yes| directChain
  directChain -->|broadcast or outcome unclear fails| review
  review -->|operator supplies confirmed txHash| reviewOps
  reviewOps -->|attach chain anchor, still needs review| review
  directChain -->|confirmed| directOnchain
  directOnchain --> railQueue

  recipient -->|no| escrowDeposit
  escrowDeposit -->|deposit fails or outcome unclear| review
  escrowDeposit -->|DB unavailable after chain event| chainEventScan
  escrowDeposit -->|confirmed| escrowOnchain
  chainEventScan -->|Deposited event repairs local anchor| escrowOnchain
  escrowOnchain --> claimLink
  claimLink -->|delivery fails after final retry| review
  reviewOps -->|resend claim link| claimLink
  claimLink -->|sent or queued| recipientClaim
  recipientClaim -->|invalid, expired, wrong phone, wallet not ready| requestFail
  recipientClaim -->|post-chain DB update unclear| review
  recipientClaim -->|DB unavailable before review metadata| chainEventScan
  review -->|failureStage: escrow_claim_db_update| claimScan
  claimScan -->|replay local claim persistence| claimRecorded
  chainEventScan -->|Claimed event replays local claim persistence| claimRecorded
  recipientClaim -->|confirmed| claimRecorded
  claimRecorded --> railQueue
  escrowOnchain -->|not claimed by expiry| expiry
  expiry -->|refund confirmed| expired
  expiry -->|refund retry exhausted| review
  expiry -->|DB unavailable after refund event| chainEventScan
  reviewOps -->|retry escrow refund| expiry
  chainEventScan -->|Refunded event repairs local refund| expired
  scanner -->|finds expired pending escrow| expiry

  railQueue -->|queue add fails| review
  railQueue -->|queued| railWorker
  railWorker -->|transient provider failure| retry
  retry --> railWorker
  railWorker -->|final retry failure| review
  review -->|rail failureStage| railDeadLetter
  railDeadLetter -->|operator retry| railQueue
  railWorker -->|provider accepted| routed
  routed --> settleWait
  settleWait -->|webhook or poll success| settled
  settleWait -->|definite provider failure| failed
  settleWait -->|stale or ambiguous| review

  classDef success fill:#ecfdf5,stroke:#059669,color:#0f172a;
  classDef pending fill:#eff6ff,stroke:#2563eb,color:#0f172a;
  classDef warning fill:#fffbeb,stroke:#d97706,color:#0f172a;
  classDef failure fill:#fef2f2,stroke:#dc2626,color:#0f172a;

  class replay,directOnchain,escrowOnchain,claimLink,claimRecorded,routed,settled,expired success;
  class start,lock,validate,tx,recipient,directChain,escrowDeposit,recipientClaim,claimScan,chainEventScan,railQueue,railWorker,railDeadLetter,reviewOps,settleWait,scanner pending;
  class retry,review warning;
  class requestFail,failed failure;
```

---

## Send/Escrow Resilience

The send and escrow flow treats on-chain movement as the money boundary. Once funds have moved on-chain, later side effects such as rail payout, claim-link delivery, and settlement confirmation are retried or marked for operator review instead of being reported as a simple request failure.

Implemented guardrails:

- `/api/send` accepts an `idempotencyKey` in the JSON body or `Idempotency-Key` / `X-Idempotency-Key` headers. Replays by the same sender return the original transaction instead of consuming another quote or sending again.
- Transactions record `requires_review`, `failureStage`, `failureReason`, and `failedAt` when the outcome is unclear after money movement.
- Rail payouts for direct sends and escrow claims go through the `rail_disburse` queue, with inline fallback only when Redis queues are disabled for local/demo runs.
- Rail payout jobs carry stable provider idempotency keys; MoMo, Paystack, Wave, and M-Pesa receive the same key on retry instead of a fresh payout identity.
- Rail final failures are visible through `GET /api/ops/rail/dead-letter`, and operators can retry with `POST /api/ops/rail/dead-letter/:transactionId/retry` using `X-Operations-Token`.
- Non-rail review actions are exposed through `POST /api/ops/review/:transactionId/resend-claim-link`, `POST /api/ops/review/:transactionId/reconcile-chain-hash`, and `POST /api/ops/review/:transactionId/refund-escrow`.
- Escrow claim-link notifications use the notification queue and can move a transaction to `requires_review` after final delivery failure.
- Escrow claims use a tokenized escrow-ref lock to serialize duplicate taps, then replay the claimed state for the same recipient after the first claim succeeds.
- Claim retries and `escrow.worker` reconciliation both retry local claim persistence and rail handoff for `escrow_claim_db_update` review records after an on-chain claim has already succeeded.
- Escrow expiry uses deterministic delayed jobs plus a periodic scanner in `escrow.worker`, so expired pending escrows are re-enqueued or refunded even if the original delayed job was missed.
- `escrow.worker` also scans `TumaEscrow` `Deposited`, `Claimed`, and `Refunded` events using the persistent `chain_scan_cursors` table, repairing escrow deposits, claims, and refunds that succeeded on-chain before local review metadata could be written.
- Workers and scanners write liveness rows to `worker_heartbeats`; operators can query `GET /api/ops/health/heartbeats` and use `failOnStale=true` for external monitors.
- Backend resilience tests now include unit coverage for provider idempotency, heartbeat status, and escrow chain-event helpers, plus Postgres/Redis integration coverage for duplicate send/claim idempotency, expiry scanner repair, claim DB reconciliation, escrow chain-event repairs, rail dead-letter retry, operator recovery routes, and heartbeat health.
- History and tracking APIs expose review metadata so the frontend can stop polling and show "Needs review" rather than spinning forever.

Design decisions and tradeoffs are documented in [docs/adr/](docs/adr/). The current send/escrow failure matrix is in [docs/send-escrow-failure-scenarios.md](docs/send-escrow-failure-scenarios.md).

Main tradeoffs:

- Safer retries require Redis/BullMQ workers in production, plus an operator path for `requires_review`.
- Returning after queue handoff improves request reliability, but users may see an `onchain` state while rail payout finishes asynchronously.
- Provider idempotency semantics still vary by rail; sandbox checks and provider-specific tests are needed before treating duplicate prevention as complete.
- The dead-letter surface is an API, not a full dashboard; production needs alerts and an operator runbook.
- Heartbeat alerting is an API-level signal; Render, UptimeRobot, PagerDuty, or another monitor still needs to poll it and page humans.
- Chain-hash reconciliation is an operator assertion with receipt-success verification; broader direct-transfer event matching is still needed for full recovery.
- Chain-event scanning is deterministic for escrow contract events with a known `claimRef`; direct ERC-20 sends without a stored hash still need a direct-transfer matcher, outbox, or operator lookup.
- Inline queue fallback keeps local development usable without Redis, but it is not durable and should not be treated as production resilience.
- CI does not yet gate on frontend lint because the frontend has a pre-existing formatting baseline; frontend build is gated now, and lint should become required after cleanup.

---

## Status

**Phase 1–3 complete** — backend fully implemented, smart contracts written and tested.

Remaining before production:

- [ ] Deploy contracts to Fuji testnet + run chain/provider integration tests
- [ ] Clean frontend lint baseline and turn the lint gate on in CI
- [ ] Register Africa's Talking WhatsApp templates with Meta
- [ ] Complete Orange Money integration (Senegal/CI)
- [ ] Fund AutopayPaymaster with AVAX for gas sponsorship
- [ ] Security audit of smart contracts
- [ ] Deploy contracts to Avalanche mainnet
- [ ] Replace wallet key derivation with passkey-based signing (Phase 6)
