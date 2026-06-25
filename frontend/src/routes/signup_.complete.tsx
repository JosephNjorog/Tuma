import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ArrowRight, Check } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api";
import { useSignupStore } from "@/stores/signupStore";
import { useSessionStore } from "@/stores/sessionStore";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/signup_/complete")({
  head: () => ({ meta: [{ title: "AutoPayKe - Welcome!" }] }),
  component: SignupComplete,
});

const STEPS = [
  "Phone verified",
  "PIN created",
  "Wallet assigned",
  "Ready to send",
] as const;

function SignupComplete() {
  const navigate = useNavigate();
  const { phone, email, signup_token, pin_hash, clearSignupStore } = useSignupStore();
  const { setSession, setPinHash } = useSessionStore();

  const [activating, setActivating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activatedRef = useRef(false);

  useEffect(() => {
    if (!signup_token || !pin_hash) {
      void navigate({ to: "/signup" });
      return;
    }

    if (activatedRef.current) return;
    activatedRef.current = true;

    const activate = async () => {
      setActivating(true);
      try {
        const res = await apiClient.post<{
          access_token: string;
          refresh_token: string;
          user_id: string;
          phone: string;
          display_name: string;
          wallet_address: string;
        }>("/api/auth/activate", { signup_token, pin_hash });

        setSession({
          access_token: res.access_token,
          refresh_token: res.refresh_token,
          user_id: res.user_id,
          phone: res.phone,
          display_name: res.display_name,
          wallet_address: res.wallet_address,
        });

        // persist pin_hash so the lock screen can verify locally next time
        if (pin_hash) setPinHash(pin_hash);

        clearSignupStore();
        setDone(true);
      } catch (err) {
        if (err instanceof ApiError) {
          setError("Account activation failed. Please try again or contact support.");
        } else {
          setError("Something went wrong during activation.");
        }
        toast.error("Activation failed. Please try again.");
      } finally {
        setActivating(false);
      }
    };

    void activate();
  }, [signup_token, pin_hash, navigate, setSession, clearSignupStore]);

  const handleContinue = () => {
    void navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen bg-dark-gradient relative flex flex-col items-center justify-center px-5">
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_60%,rgba(249,115,22,0.18)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_50%_25%,rgba(249,115,22,0.08)_0%,transparent_70%)]" />

      <div className="relative z-10 w-full max-w-97.5 flex flex-col items-center text-center">
        {/* Status icon */}
        <div
          className={cn(
            "w-20 h-20 rounded-3xl flex items-center justify-center mb-7 transition-colors duration-500",
            done ? "bg-success/20 border border-success/30" : "bg-orange/15 border border-orange/25"
          )}
        >
          {activating ? (
            <LoadingSpinner size={28} color="orange" />
          ) : done ? (
            <Check size={32} strokeWidth={2.5} className="text-success" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-danger/30 border border-danger/50" />
          )}
        </div>

        <h1 className="font-display font-black text-[32px] leading-[1.1] text-white mb-3">
          {activating && "Setting up your wallet…"}
          {done && "You're all set."}
          {error && "Activation failed"}
        </h1>

        {activating && (
          <p className="text-[13px] text-white/40 leading-relaxed max-w-65">
            Assigning your wallet address on Avalanche. This takes a few seconds.
          </p>
        )}

        {done && (
          <p className="text-[13px] text-white/50 leading-relaxed max-w-70">
            Your wallet is live on Avalanche C-Chain. You can now send money to any phone number in Africa.
          </p>
        )}

        {error && (
          <p className="text-[13px] text-danger/80 leading-relaxed max-w-70">{error}</p>
        )}

        {/* Steps checklist */}
        <div className="w-full bg-white/5 border border-white/8 rounded-2xl px-5 py-4 mt-8 mb-8 text-left">
          {STEPS.map((step, i) => {
            const checked = done || (activating && i < 2);
            return (
              <div key={step} className={cn("flex items-center gap-3 py-2", i < STEPS.length - 1 && "border-b border-white/5")}>
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors duration-300",
                    checked
                      ? "bg-success/20 border-success/50"
                      : activating
                      ? "border-white/20 bg-transparent animate-pulse"
                      : "border-white/10 bg-transparent"
                  )}
                >
                  {checked && <Check size={11} strokeWidth={3} className="text-success" />}
                </div>
                <span
                  className={cn(
                    "text-[13px] transition-colors duration-300",
                    checked ? "text-white font-medium" : "text-white/35"
                  )}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        {done && (
          <button
            type="button"
            onClick={handleContinue}
            className={cn(
              "w-full py-4 rounded-2xl bg-orange-gradient text-white font-display font-bold text-[15px]",
              "shadow-[0_6px_20px_rgba(249,115,22,0.35)] flex items-center justify-center gap-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
            )}
          >
            Go to dashboard
            <ArrowRight size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
