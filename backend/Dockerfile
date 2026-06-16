FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies (workspace-aware)
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN bun install --frozen-lockfile

# Copy source
COPY packages ./packages
COPY backend ./backend

WORKDIR /app/backend

EXPOSE 3001

# Run schema push (idempotent — safe on every deploy) then start the server
CMD ["/bin/sh", "-c", "drizzle-kit push --force && bun run src/index.ts"]
