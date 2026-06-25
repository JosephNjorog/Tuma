import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface CountdownTimerProps {
  initialSeconds: number;
  onExpire: () => void;
  renderExpired: React.ReactNode;
  className?: string;
}

export interface CountdownTimerRef {
  reset: () => void;
}

export const CountdownTimer = forwardRef<CountdownTimerRef, CountdownTimerProps>(
  ({ initialSeconds, onExpire, renderExpired, className }, ref) => {
    const [seconds, setSeconds] = useState(initialSeconds);

    useImperativeHandle(ref, () => ({
      reset: () => setSeconds(initialSeconds),
    }));

    useEffect(() => {
      if (seconds <= 0) {
        onExpire();
        return;
      }

      const id = setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(id);
    }, [seconds, onExpire]);

    if (seconds <= 0) {
      return <>{renderExpired}</>;
    }

    const mins = Math.floor(seconds / 60);
    const secs = String(seconds % 60).padStart(2, "0");

    return (
      <span className={cn("text-[13px] text-black/40", className)}>
        Resend code in {mins}:{secs}
      </span>
    );
  }
);

CountdownTimer.displayName = "CountdownTimer";
