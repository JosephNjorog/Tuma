import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, QrCode, Store, Receipt, User, Image as ImageIcon, Zap } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";

export const Route = createFileRoute("/scan")({
  head: () => ({ meta: [{ title: "Scan · Autopayke" }, { name: "description", content: "Scan any Autopayke QR code." }] }),
  component: Scan,
});

function Scan() {
  const navigate = useNavigate();
  const demos = [
    { icon: User, title: "Personal QR", subtitle: "Send to Kwame · 🇬🇭 MoMo" },
    { icon: Store, title: "Static merchant", subtitle: "Accra Bites · any amount" },
    { icon: Zap, title: "Dynamic checkout", subtitle: "Fixed amount: $12.30" },
    { icon: Receipt, title: "Payment request", subtitle: "Aïcha sent you an invoice" },
  ];
  return (
    <MobileFrame>
      <div className="relative flex min-h-full flex-col bg-foreground text-background">
        <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-5">
          <Link to="/dashboard" className="h-9 w-9 rounded-full bg-background/15 backdrop-blur flex items-center justify-center text-background">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Scan Autopayke QR</h1>
          <Link to="/receive" className="h-9 w-9 rounded-full bg-background/15 backdrop-blur flex items-center justify-center text-background">
            <QrCode className="h-4 w-4" />
          </Link>
        </header>

        <div className="relative flex-1 flex items-center justify-center px-8" style={{ background: "radial-gradient(at center, oklch(0.25 0.03 50) 0%, oklch(0.12 0.02 50) 100%)" }}>
          <div className="relative aspect-square w-full max-w-70">
            <div className="absolute inset-0 rounded-3xl border-2 border-background/20" />
            {[
              "top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl",
              "top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl",
              "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl",
              "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl",
            ].map((c, i) => (
              <div key={i} className={`absolute h-12 w-12 border-primary ${c}`} />
            ))}
            <div className="absolute inset-x-4 h-0.5 animate-[scan_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, oklch(0.68 0.19 28), transparent)" }} />
          </div>
          <p className="absolute bottom-8 left-0 right-0 text-center text-xs text-background/60">Point at an Autopayke QR · or try a demo below</p>
        </div>

        <div className="bg-background text-foreground rounded-t-3xl p-5 pb-8 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Try a demo scan</p>
            <button className="text-xs text-primary font-semibold inline-flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" /> From gallery
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {demos.map((d) => (
              <button
                key={d.title}
                onClick={() => navigate({ to: "/track/$id", params: { id: "tx1" } })}
                className="rounded-2xl border border-border bg-card p-3 text-left hover:border-primary transition"
              >
                <div className="h-8 w-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center mb-2">
                  <d.icon className="h-4 w-4" />
                </div>
                <p className="text-xs font-bold">{d.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{d.subtitle}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes scan { 0%,100% { top: 8%; } 50% { top: 92%; } }`}</style>
    </MobileFrame>
  );
}