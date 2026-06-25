import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSessionStore } from "@/stores/sessionStore";

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated());
  const navigate = useNavigate();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    if (!isAuthenticated) {
      void navigate({ to: "/login", replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
