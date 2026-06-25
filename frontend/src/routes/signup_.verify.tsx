import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useEffect } from "react";
import { ChevronLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { ProgressBar } from "@/components/ProgressBar";
import { OtpInput, type OtpInputRef } from "@/components/OtpInput";
import { CountdownTimer, type CountdownTimerRef } from "@/components/CountdownTimer";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { apiClient, ApiError } from "@/lib/api";
import { useSignupStore } from "@/stores/signupStore";
import { maskEmail } from "@/lib/utils";
import { OTP_LENGTH, OTP_RESEND_SECONDS } from "@/lib/constants";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup_/verify")({
  head: () => ({ meta: [{ title: "AutoPayKe - Verify email" }] }),
  component: SignupVerify,
});

function SignupVerify() {
  const navigate = useNavigate();
  const { phone, email, otp_id, setOtpId, setSignupToken } = useSignupStore();

  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const otpRef = useRef<OtpInputRef>(null);
  const timerRef = useRef<CountdownTimerRef>(null);

  useEffect(() => {
    if (!phone || !otp_id) {
      void navigate({ to: "/signup" });
    }
  }, [phone, otp_id, navigate]);

  const handleComplete = async (otp: string) => {
    if (!otp_id) return;
    setError(null);
    setVerifying(true);
    try {
      const res = await apiClient.post<{ signup_token: string }>(
        "/api/auth/verify-otp",
        { otp_id, code: otp }
      );
      setSignupToken(res.signup_token);
      void navigate({ to: "/signup/pin" });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 422) {
          setError("Incorrect code. Check your email and try again.");
        } else if (err.code === 410) {
          setError("This code has expired. Request a new one.");
        } else {
          setError("Verification failed. Please try again.");
        }
      } else {
        setError("Verification failed. Please try again.");
      }
      otpRef.current?.reset();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!phone || !email) return;
    setResending(true);
    setError(null);
    try {
      const res = await apiClient.post<{ otp_id?: string; id?: string; expires_in?: number }>(
        "/api/auth/send-otp",
        { phone, email, channel: "email" }
      );
      setOtpId(res.otp_id ?? res.id ?? "");
      otpRef.current?.reset();
      timerRef.current?.reset();
      toast.success("A new code has been sent to your email.");
    } catch (err) {
      if (err instanceof ApiError && err.code === 429) {
        toast.error("Too many attempts. Please wait before requesting another code.");
      } else {
        toast.error("Could not resend code. Please try again.");
      }
    } finally {
      setResending(false);
    }
  };

  const maskedEmail = email ? maskEmail(email) : "your email";

  return (
    <div className="min-h-screen bg-auth-gradient relative">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/30" />

      <div className="relative z-10 px-5 pt-6 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        <button
          type="button"
          onClick={() => navigate({ to: "/signup" })}
          className="w-9 h-9 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center cursor-pointer mb-6 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <ProgressBar currentStep={2} className="mb-7" />

        <p className="text-[11px] font-semibold tracking-widest text-black/40 uppercase mb-1.5">
          STEP 2 OF 4
        </p>
        <h1 className="font-display font-extrabold text-[28px] leading-[1.15] text-navy mb-2">
          Check your email
        </h1>
        <p className="text-[13px] text-black/50 leading-relaxed mb-6">
          We sent a {OTP_LENGTH}-digit code to{" "}
          <span className="font-semibold text-navy">{maskedEmail}</span>
        </p>

        {/* Email visual */}
        <div className="flex justify-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center">
            <Mail size={28} strokeWidth={1.5} className="text-orange" />
          </div>
        </div>

        {/* OTP input */}
        <div className="flex justify-center mb-3">
          <OtpInput
            ref={otpRef}
            length={OTP_LENGTH}
            onComplete={handleComplete}
            onChange={() => setError(null)}
            error={!!error}
            disabled={verifying}
            autoFocus
          />
        </div>

        {error && (
          <p className="text-center text-[12px] text-danger mb-3">{error}</p>
        )}

        {verifying && (
          <div className="flex justify-center mb-3">
            <LoadingSpinner size={18} color="orange" label="Verifying…" />
          </div>
        )}

        {/* Resend */}
        <div className="flex justify-center mt-4">
          <CountdownTimer
            ref={timerRef}
            initialSeconds={OTP_RESEND_SECONDS}
            onExpire={() => {}}
            renderExpired={
              <button
                type="button"
                disabled={resending}
                onClick={handleResend}
                className={cn(
                  "text-[13px] font-semibold text-orange underline-offset-2 hover:underline",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-1 rounded",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {resending ? (
                  <span className="flex items-center gap-1.5">
                    <LoadingSpinner size={12} color="orange" />
                    Sending…
                  </span>
                ) : (
                  "Resend code"
                )}
              </button>
            }
            className="text-[13px] text-black/40"
          />
        </div>

        <div className="flex-1" />

        <p className="text-[11px] text-black/40 text-center mt-4 leading-relaxed">
          Wrong number?{" "}
          <button
            type="button"
            onClick={() => navigate({ to: "/signup" })}
            className="underline text-orange font-semibold focus-visible:outline-none"
          >
            Go back and change it.
          </button>
        </p>
      </div>
    </div>
  );
}
