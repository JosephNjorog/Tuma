import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Send, QrCode, Clock, Wallet } from "lucide-react";

const tabs = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/send", label: "Send", icon: Send },
  { to: "/history", label: "History", icon: Clock },
  { to: "/wallet", label: "Wallet", icon: Wallet },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="sticky bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="pointer-events-auto relative mx-3 mb-3 rounded-3xl bg-card/95 backdrop-blur border border-border shadow-[0_-4px_24px_-8px_oklch(0.18_0.02_50/0.15)]">
        <div className="grid grid-cols-5 items-end px-2 pt-2 pb-3">
          {tabs.slice(0, 2).map((t) => (
            <NavItem key={t.to} {...t} active={pathname === t.to} />
          ))}
          <div className="flex justify-center -mt-7">
            <Link
              to="/scan"
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-primary-foreground shadow-[var(--shadow-elegant)] transition-transform active:scale-95"
              style={{ background: "var(--gradient-portfolio)" }}
              aria-label="Scan"
            >
              <QrCode className="h-6 w-6" />
            </Link>
          </div>
          {tabs.slice(2).map((t) => (
            <NavItem key={t.to} {...t} active={pathname === t.to} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, active }: { to: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-1 py-1.5 text-[10px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
      <span>{label}</span>
    </Link>
  );
}
