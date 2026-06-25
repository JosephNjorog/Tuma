import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useEffect, useState } from "react";
import { ChevronLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { OtpInput, type OtpInputRef } from "@/components/OtpInput";
import { CountdownTimer, type CountdownTimerRef } from "@/components/CountdownTimer";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { apiClient, ApiError } from "@/lib/api";
import { useLoginStore } from "@/stores/loginStore";
import { useSessionStore } from "@/stores/sessionStore";
import { maskEmail } from "@/lib/utils";
import { OTP_LENGTH, OTP_RESEND_SECONDS } from "@/lib/constants";
import type { UserSession } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login_/verify")({
  head: () => ({ meta: [{ title: "AutoPayKe - Verify number" }] }),
  component: LoginVerify,
});

function LoginVerify() {
  const navigate = useNavigate();
  const { phone, otp_id, setOtpId, clearLoginStore } = useLoginStore();
  const { setSession } = useSessionStore();

  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const otpRef = useRef<OtpInputRef>(null);
  const timerRef = useRef<CountdownTimerRef>(null);

  useEffect(() => {
    if (!phone || !otp_id) {
      void navigate({ to: "/login/phone" });
    }
  }, [phone, otp_id, navigate]);

  const navigateAfterLogin = () => {
    const redirect = sessionStorage.getItem("autopayke_redirect_to");
    if (redirect) {
      sessionStorage.removeItem("autopayke_redirect_to");
      void navigate({ to: redirect as "/" });
    } else {
      void navigate({ to: "/dashboard" });
    }
  };

  const handleComplete = async (otp: string) => {
    if (!otp_id) return;
    setError(null);
    setVerifying(true);
    try {
      const res = await apiClient.post<UserSession>("/api/auth/verify-login-otp", {
        otp_id,
        code: otp,
      });
      setSession(res);
      clearLoginStore();
      navigateAfterLogin();
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
    if (!phone) return;
    setResending(true);
    setError(null);
    try {
      const res = await apiClient.post<{ otp_id: string; expires_in: number }>(
        "/api/auth/send-otp",
        { phone, channel: "email" }
      );
      setOtpId(res.otp_id);
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

  return (
    <div className="min-h-screen bg-auth-gradient relative">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/30" />

      <div className="relative z-10 px-5 pt-6 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        <button
          type="button"
          onClick={() => navigate({ to: "/login/phone" })}
          className="w-9 h-9 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center cursor-pointer mb-8 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <h1 className="font-display font-extrabold text-[28px] leading-[1.15] text-navy mb-2">
          Verify your number
        </h1>
        <p className="text-[13px] text-black/50 leading-relaxed mb-6">
          Enter the {OTP_LENGTH}-digit code we sent to your email on file.
          {phone && (
            <>
              {" "}Number:{" "}
              <span className="font-semibold text-navy">{phone}</span>
            </>
          )}
        </p>

        <div className="flex justify-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-orange/10 border border-orange/20 flex items-center justify-center">
            <Mail size={28} strokeWidth={1.5} className="text-orange" />
          </div>
        </div>

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
            onClick={() => navigate({ to: "/login/phone" })}
            className="underline text-orange font-semibold focus-visible:outline-none"
          >
            Go back and change it.
          </button>
        </p>
      </div>
    </div>
  );
}
