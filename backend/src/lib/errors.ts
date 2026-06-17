export class TumaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "TumaError";
  }
}

export class AuthError extends TumaError {
  constructor(message = "Unauthorized") {
    super("AUTH_ERROR", message, 401);
  }
}

export class NotFoundError extends TumaError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} not found`, 404);
  }
}

export class ValidationError extends TumaError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 422);
  }
}

export class RateLimitError extends TumaError {
  constructor(message = "Too many requests") {
    super("RATE_LIMIT", message, 429);
  }
}

export class ConflictError extends TumaError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class FxQuoteExpiredError extends TumaError {
  constructor() {
    super("QUOTE_EXPIRED", "FX quote has expired. Please request a new quote.", 410);
  }
}

export class InsufficientFundsError extends TumaError {
  constructor() {
    super("INSUFFICIENT_FUNDS", "Insufficient USDC balance", 402);
  }
}

export class RailError extends TumaError {
  constructor(rail: string, detail: string) {
    super("RAIL_ERROR", `Payment rail ${rail} error: ${detail}`, 502);
  }
}

export class EscrowError extends TumaError {
  constructor(message: string) {
    super("ESCROW_ERROR", message, 400);
  }
}

export class BlockchainError extends TumaError {
  constructor(message: string) {
    super("BLOCKCHAIN_ERROR", message, 502);
  }
}

export function isKnownError(err: unknown): err is TumaError {
  return err instanceof TumaError;
}
