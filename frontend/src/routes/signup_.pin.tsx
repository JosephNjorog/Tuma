import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ProgressBar } from "@/components/ProgressBar";
import { PinKeypad } from "@/components/PinKeypad";
import { TrustBadge } from "@/components/TrustBadge";
import { useSignupStore } from "@/stores/signupStore";
import { useSessionStore } from "@/stores/sessionStore";
import { hashPin } from "@/lib/utils";
import { PIN_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup_/pin")({
  head: () => ({ meta: [{ title: "AutoPayKe - Create PIN" }] }),
  component: SignupPin,
});

type Stage = "create" | "confirm";

function SignupPin() {
  const navigate = useNavigate();
  const { setPinHash } = useSignupStore();
  const { isAuthenticated } = useSessionStore();

  const [stage, setStage] = useState<Stage>("create");
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");
  const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isAuthenticated()) {
      void navigate({ to: "/signup" });
    }
  }, []);

  const handleCreate = (pin: string) => {
    setFirstPin(pin);
    setStage("confirm");
    setStatus("idle");
    setStatusMessage(undefined);
  };

  const handleConfirm = async (pin: string) => {
    if (pin !== firstPin) {
      setStatus("error");
      setStatusMessage("PINs do not match. Try again.");
      setTimeout(() => {
        setStatus("idle");
        setStatusMessage(undefined);
      }, 1500);
      return;
    }

    setStatus("success");
    const hash = await hashPin(pin);
    setPinHash(hash);

    setTimeout(() => {
      void navigate({ to: "/signup/biometrics" });
    }, 400);
  };

  const handleBack = () => {
    if (stage === "confirm") {
      setStage("create");
      setFirstPin(null);
      setStatus("idle");
      setStatusMessage(undefined);
    } else {
      void navigate({ to: "/signup/verify" });
    }
  };

  return (
    <div className="min-h-screen bg-auth-gradient relative">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/30" />

      <div className="relative z-10 px-5 pt-6 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        <button
          type="button"
          onClick={handleBack}
          className="w-9 h-9 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center cursor-pointer mb-6 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <ProgressBar currentStep={3} className="mb-7" />

        <p className="text-[11px] font-semibold tracking-widest text-black/40 uppercase mb-1.5">
          STEP 3 OF 4
        </p>

        <h1 className="font-display font-extrabold text-[28px] leading-[1.15] text-navy mb-2">
          {stage === "create" ? `Create a ${PIN_LENGTH}-digit PIN` : "Confirm your PIN"}
        </h1>
        <p className="text-[13px] text-black/50 leading-relaxed mb-4">
          {stage === "create"
            ? "This PIN authorises all transfers. Never share it."
            : "Enter the same PIN again to confirm."}
        </p>

        {stage === "create" && (
          <TrustBadge
            title="Stored only on your device"
            body="Your PIN is hashed locally. It never leaves your phone in plain text."
            icon={<ShieldCheck size={18} strokeWidth={2.5} className="text-success" />}
            className="mb-2"
          />
        )}

        <PinKeypad
          key={stage}
          onComplete={stage === "create" ? handleCreate : handleConfirm}
          onClear={stage === "confirm" ? handleBack : undefined}
          pinLength={PIN_LENGTH}
          theme="light"
          status={status}
          statusMessage={statusMessage}
        />

        <div className="flex-1" />

        {stage === "confirm" && (
          <button
            type="button"
            onClick={handleBack}
            className={cn(
              "w-full py-3.5 rounded-2xl border border-black/10 text-black/50 text-[13px] font-medium mt-3",
              "bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1"
            )}
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}
