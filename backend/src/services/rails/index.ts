import { dialCodeToCountry, type Rail } from "@tuma/shared";
import { sendB2C } from "./mpesa";
import { sendMomoTransfer } from "./momo";
import { createTransferRecipient, sendTransfer } from "./paystack";
import { sendWavePayout } from "./wave";
import { RailError } from "../../lib/errors";

export type DisburseParams = {
  recipientPhone: string;
  amountLocal: number;
  localCurrency: string;
  reference: string;
  providerIdempotencyKey: string;
};

export type DisburseResult = {
  rail: Rail;
  railReference: string;
  status: "pending" | "settled";
};

/**
 * Auto-selects the correct payment rail from the recipient's phone number
 * and dispatches the disbursement.
 */
export async function disburseToRail(params: DisburseParams): Promise<DisburseResult> {
  const country = dialCodeToCountry(params.recipientPhone);
  if (!country) {
    throw new RailError("unknown", `Cannot determine country for ${params.recipientPhone}`);
  }

  const rail = country.primaryRail as Rail;

  switch (rail) {
    case "mpesa": {
      const result = await sendB2C(
        params.recipientPhone,
        params.amountLocal,
        params.reference,
        params.providerIdempotencyKey
      );
      return { rail, ...result };
    }

    case "momo": {
      const currency = country.currency as "GHS" | "UGX";
      const result = await sendMomoTransfer(
        params.recipientPhone,
        params.amountLocal,
        currency,
        params.reference,
        params.providerIdempotencyKey
      );
      return { rail, ...result };
    }

    case "paystack": {
      // For Paystack, we need a recipient code first.
      // In production this would be cached per phone number.
      const recipientCode = await createTransferRecipient(
        "mobile_money",
        "Autopayke Recipient",
        params.recipientPhone.replace("+234", "0"),
        "999992", // MTN Nigeria bank code — adjust per recipient bank
        "NGN"
      );
      const result = await sendTransfer(
        params.amountLocal,
        recipientCode,
        params.reference,
        params.providerIdempotencyKey
      );
      return { rail, ...result };
    }

    case "wave": {
      const result = await sendWavePayout(
        params.recipientPhone,
        params.amountLocal,
        params.reference,
        params.providerIdempotencyKey
      );
      return { rail, ...result };
    }

    case "orange_money": {
      // Orange Money Senegal/CI — same Wave-style API, routed via fallback
      // Placeholder until Orange Money API credentials are configured
      throw new RailError("orange_money", "Orange Money integration pending");
    }

    default:
      throw new RailError(rail, `Rail not implemented`);
  }
}

/** Polls a rail-specific reference for settlement status. */
export async function pollRailStatus(
  rail: Rail,
  railReference: string
): Promise<"pending" | "settled" | "failed"> {
  switch (rail) {
    case "momo": {
      const { getMomoTransferStatus } = await import("./momo");
      return getMomoTransferStatus(railReference);
    }
    case "paystack": {
      const { getTransferStatus } = await import("./paystack");
      return getTransferStatus(railReference);
    }
    case "wave": {
      const { getWavePayoutStatus } = await import("./wave");
      return getWavePayoutStatus(railReference);
    }
    case "mpesa":
      // M-Pesa uses webhooks (ResultURL); status comes in asynchronously.
      return "pending";
    default:
      return "pending";
  }
}
