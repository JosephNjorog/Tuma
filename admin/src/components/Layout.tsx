import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ArrowLeftRight,
  AlertTriangle,
  Lock,
  Skull,
  Users,
  Store,
  TrendingUp,
  Activity,
  Bell,
  BarChart3,
  ScrollText,
  Webhook,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Transactions", to: "/transactions", icon: ArrowLeftRight },
  { label: "Requires Review", to: "/review", icon: AlertTriangle },
  { label: "Escrow", to: "/escrow", icon: Lock },
  { label: "Dead Letter Queue", to: "/dead-letter", icon: Skull },
  { label: "Users", to: "/users", icon: Users },
  { label: "Merchants", to: "/merchants", icon: Store },
  { label: "FX Rates", to: "/fx", icon: TrendingUp },
  { label: "Worker Health", to: "/health", icon: Activity },
  { label: "Notifications", to: "/notifications", icon: Bell },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Audit Log", to: "/audit", icon: ScrollText },
  { label: "Webhooks", to: "/webhooks", icon: Webhook },
  { label: "Config", to: "/config", icon: Settings },
] as const;

export function Layout({ children }: { children: React.ReactNode }) {
  const logout = useAuthStore((s) => s.logout);
  const operator = useAuthStore((s) => s.operator);
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="sidebar flex flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold">A</span>
          </div>
          <div>
            <p className="text-sm font-semibold">Autopayke Ops</p>
            <p className="text-[10px] text-muted-foreground">{operator}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(({ label, to, icon: Icon }) => {
            const active =
              to === "/"
                ? pathname === "/"
                : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {active && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-border">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-muted-foreground font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function ErrorDisplay({ error }: { error: Error }) {
  return (
    <div className="m-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      {error.message}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-t border-border text-sm text-muted-foreground">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-40 text-xs"
      >
        Prev
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className="px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-40 text-xs"
      >
        Next
      </button>
    </div>
  );
}
