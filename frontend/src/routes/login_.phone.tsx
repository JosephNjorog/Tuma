import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { apiClient, ApiError } from "@/lib/api";
import { useLoginStore } from "@/stores/loginStore";
import { SUPPORTED_COUNTRIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login_/phone")({
  head: () => ({ meta: [{ title: "AutoPayKe - Log in with number" }] }),
  component: LoginPhone,
});

const LoginPhoneSchema = z
  .object({
    country_code: z.string().min(2).max(2),
    phone: z
      .string()
      .min(9, "Phone number too short")
      .max(10, "Phone number too long")
      .regex(/^[0-9]+$/, "Digits only"),
  })
  .refine(
    (data) => {
      const country = SUPPORTED_COUNTRIES.find((c) => c.code === data.country_code);
      if (!country) return true;
      return data.phone.length === country.phoneLength;
    },
    { message: "Phone number length is incorrect for the selected country", path: ["phone"] }
  );

type FormValues = z.infer<typeof LoginPhoneSchema>;

function LoginPhone() {
  const navigate = useNavigate();
  const { setPhone, setOtpId } = useLoginStore();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(LoginPhoneSchema),
    defaultValues: { country_code: "KE", phone: "" },
  });

  const selectedCode = watch("country_code");
  const selectedCountry = SUPPORTED_COUNTRIES.find((c) => c.code === selectedCode);

  const onSubmit = async (values: FormValues) => {
    const fullPhone = `${selectedCountry?.dial ?? ""}${values.phone}`;
    try {
      const res = await apiClient.post<{ otp_id: string; expires_in: number }>(
        "/api/auth/send-otp",
        { phone: fullPhone, channel: "email" }
      );
      setPhone(fullPhone);
      setOtpId(res.otp_id);
      void navigate({ to: "/login/verify" });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 404) {
          setError("phone", { message: "No account found for this number." });
        } else if (err.code === 429) {
          toast.error("Too many attempts. Please wait before trying again.");
        } else {
          toast.error("Something went wrong. Please try again.");
        }
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-auth-gradient relative">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-white/30" />

      <div className="relative z-10 px-5 pt-6 pb-8 max-w-97.5 mx-auto min-h-screen flex flex-col">
        <button
          type="button"
          onClick={() => navigate({ to: "/login" })}
          className="w-9 h-9 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center cursor-pointer mb-8 self-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>

        <h1 className="font-display font-extrabold text-[28px] leading-[1.15] text-navy mb-2">
          Log in with your number
        </h1>
        <p className="text-[13px] text-black/50 leading-relaxed mb-7">
          Enter your registered phone number. We will send you a verification code.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col flex-1">
          {/* Country */}
          <div className="bg-white/85 backdrop-blur-sm border border-white/90 rounded-2xl px-4 py-3.5 mb-2.5">
            <span className="text-[10px] font-semibold tracking-widest text-black/40 uppercase block mb-1">
              COUNTRY
            </span>
            <Controller
              name="country_code"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="bg-transparent border-none shadow-none p-0 h-auto focus:ring-0 focus:ring-offset-0 text-[15px] font-semibold text-navy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-4 rounded-sm bg-navy/10 text-[9px] font-bold text-navy/60 tracking-wider">
                            {c.code}
                          </span>
                          {c.name} ({c.dial})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Phone */}
          <div
            className={cn(
              "bg-white/85 backdrop-blur-sm border rounded-2xl px-4 py-3.5 mb-2 flex items-center gap-2",
              errors.phone ? "border-danger" : "border-white/90"
            )}
          >
            <span className="text-[16px] font-bold text-navy shrink-0 select-none">
              {selectedCountry?.dial ?? "+254"}
            </span>
            <input
              {...register("phone")}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="706848263"
              autoComplete="tel-national"
              autoFocus
              className="bg-transparent border-none outline-none text-[16px] font-semibold text-navy placeholder-black/30 flex-1 w-full"
            />
          </div>
          {errors.phone && (
            <p className="text-[12px] text-danger mb-2 px-1">
              {errors.phone.message}
              {errors.phone.message?.includes("No account found") && (
                <>
                  {" "}
                  <Link to="/signup" className="underline font-semibold">
                    Want to sign up?
                  </Link>
                </>
              )}
            </p>
          )}

          <div className="flex-1" />

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "w-full py-4 mt-4 rounded-2xl bg-orange-gradient text-white font-display font-bold text-[15px]",
              "shadow-[0_6px_20px_rgba(249,115,22,0.35)] flex items-center justify-center gap-2",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
            )}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size={16} color="white" />
                Sending code
              </>
            ) : (
              <>
                Send verification code
                <ArrowRight size={16} strokeWidth={2} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
