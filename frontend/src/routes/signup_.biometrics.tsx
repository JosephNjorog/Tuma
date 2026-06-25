import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { startRegistration } from "@simplewebauthn/browser";
import { ProgressBar } from "@/components/ProgressBar";
import { BiometricRing } from "@/components/BiometricRing";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { apiClient, ApiError } from "@/lib/api";
import { useSignupStore } from "@/stores/signupStore";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup_/biometrics")({
  head: () => ({ meta: [{ title: "AutoPayKe - Set up biometrics" }] }),
  component: SignupBiometrics,
});

type Stage = "prompt" | "registering" | "done" | "error";

function SignupBiometrics() {
  const navigate = useNavigate();
  const { signup_token, pin_hash, setPasskeyRegistered } = useSignupStore();

  const [stage, setStage] = useState<Stage>("prompt");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!signup_token || !pin_hash) {
      void navigate({ to: "/signup" });
    }
  }, [signup_token, pin_hash, navigate]);

  const handleRegister = async () => {
    setStage("registering");
    setErrorMsg(null);
    try {
      const opts = await apiClient.post<PublicKeyCredentialCreationOptionsJSON>(
        "/api/auth/webauthn/register/begin",
        { signup_token }
      );
      const credential = await startRegistration({ optionsJSON: opts });
      await apiClient.post("/api/auth/webauthn/register/complete", {
        signup_token,
        credential,
      });
      setPasskeyRegistered(true);
      setStage("done");
      setTimeout(() => void navigate({ to: "/signup/complete" }), 800);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setStage("error");
        setErrorMsg("Biometric authentication was cancelled.");
      } else if (err instanceof ApiError) {
        setStage("error");
        setErrorMsg("Registration failed. You can skip and set it up later.");
      } else {
        setStage("error");
        setErrorMsg("Something went wrong. Try again or skip.");
      }
    }
  };

  const handleSkip = () => {
    toast("Biometrics skipped. You can enable it later in Settings.");
    void navigate({ to: "/signup/complete" });
  };

  const isLoading = stage === "registering";
  const isDone = stage === "done";

  return (
    <div className="min-h-screen bg-auth-gradient relative">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/30" />

      <div className="relative z-10 px-5 pt-6 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        <button
          type="button"
          onClick={() => navigate({ to: "/signup/pin" })}
          className="w-9 h-9 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center cursor-pointer mb-6 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <ProgressBar currentStep={4} className="mb-7" />

        <p className="text-[11px] font-semibold tracking-widest text-black/40 uppercase mb-1.5">
          STEP 4 OF 4
        </p>
        <h1 className="font-display font-extrabold text-[28px] leading-[1.15] text-navy mb-2">
          Unlock with your face or finger
        </h1>
        <p className="text-[13px] text-black/50 leading-relaxed mb-8">
          Faster than a PIN. Your biometric data never leaves this device — we only store a cryptographic key.
        </p>

        {/* Biometric ring */}
        <div className="flex justify-center mb-10">
          <BiometricRing
            type="fingerprint"
            size="lg"
            onPress={stage === "prompt" || stage === "error" ? handleRegister : undefined}
            animating={stage === "prompt"}
          />
        </div>

        {/* State feedback */}
        {isLoading && (
          <div className="flex flex-col items-center gap-2 mb-6">
            <LoadingSpinner size={18} color="orange" />
            <p className="text-[13px] text-black/50">Waiting for biometric prompt…</p>
          </div>
        )}

        {isDone && (
          <p className="text-center text-[13px] font-semibold text-success mb-6">
            Biometrics registered successfully!
          </p>
        )}

        {stage === "error" && errorMsg && (
          <p className="text-center text-[12px] text-danger mb-6">{errorMsg}</p>
        )}

        <div className="flex flex-col gap-3 mt-auto">
          <button
            type="button"
            disabled={isLoading || isDone}
            onClick={handleRegister}
            className={cn(
              "w-full py-4 rounded-2xl bg-orange-gradient text-white font-display font-bold text-[15px]",
              "shadow-[0_6px_20px_rgba(249,115,22,0.35)] flex items-center justify-center gap-2",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
            )}
          >
            {isLoading ? (
              <>
                <LoadingSpinner size={16} color="white" />
                Registering…
              </>
            ) : isDone ? (
              "Done!"
            ) : stage === "error" ? (
              "Try again"
            ) : (
              "Enable biometrics"
            )}
          </button>

          <button
            type="button"
            disabled={isLoading || isDone}
            onClick={handleSkip}
            className={cn(
              "w-full py-3.5 rounded-2xl border border-black/10 text-black/50 text-[13px] font-medium",
              "bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

type PublicKeyCredentialCreationOptionsJSON = Parameters<typeof startRegistration>[0]["optionsJSON"];
