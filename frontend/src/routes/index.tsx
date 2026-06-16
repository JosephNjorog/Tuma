import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Phone, Globe2, Zap, ShieldCheck, ArrowRight, Share } from "lucide-react";
import { useState } from "react";
import { usePwaInstall } from "../lib/use-pwa-install";

export const Route = createFileRoute("/")({
  component: Index,
});

const VALUE_PROPS = [
  {
    icon: Phone,
    title: "Phone = Identity",
    body: "Your number is your address. No seed phrases, no wallet setup.",
  },
  {
    icon: Globe2,
    title: "Borderless",
    body: "Settle on M-Pesa, MoMo, Wave, or bank — across 5 African countries.",
  },
  {
    icon: Zap,
    title: "Seconds, not days",
    body: "Avalanche C-Chain under the hood. Transfers confirm in under 2 s.",
  },
  {
    icon: ShieldCheck,
    title: "You own it",
    body: "Smart wallet you control. We can't touch your funds.",
  },
];

function IOSInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-[#18182a] border-t border-white/10 p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <h3 className="text-base font-semibold text-white mb-1">Add Autopayke to Home Screen</h3>
        <p className="text-sm text-white/50 mb-4">Follow these steps in Safari:</p>
        <ol className="space-y-3 text-sm text-white/80">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">1</span>
            <span>Tap the <Share className="inline h-4 w-4 -mt-0.5" /> Share button at the bottom of Safari</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">2</span>
            <span>Scroll down and tap <strong className="text-white">Add to Home Screen</strong></span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">3</span>
            <span>Tap <strong className="text-white">Add</strong> in the top-right corner</span>
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-white/10 py-3 text-sm font-semibold text-white hover:bg-white/15 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Index() {
  const { canInstall, install, isIOS } = usePwaInstall();
  const [showIOSSheet, setShowIOSSheet] = useState(false);

  const handleGetApp = () => {
    if (isIOS) {
      setShowIOSSheet(true);
    } else {
      install();
    }
  };

  return (
    <div className="min-h-screen bg-[#080810] text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center font-black text-sm bg-linear-to-br from-violet-500 to-purple-700">
            T
          </div>
          <span className="font-black tracking-tight text-base">Autopayke</span>
        </div>
        <div className="flex items-center gap-2">
          {canInstall && (
            <button
              onClick={handleGetApp}
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition"
            >
              <Download className="h-3.5 w-3.5" />
              Get App
            </button>
          )}
          <Link
            to="/signup"
            className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 transition"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto w-full text-center">
        {/* Badge */}
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50 mb-8">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Live on Avalanche · 5 countries · 5 rails
        </span>

        {/* Headline */}
        <h1 className="text-5xl font-black tracking-tight leading-none mb-4 sm:text-6xl">
          <span className="bg-linear-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
            Autopayke
          </span>
        </h1>
        <p className="text-xl font-semibold text-white/80 mb-3 leading-snug">
          Phone-first money for Africa.
        </p>
        <p className="text-base text-white/40 max-w-sm leading-relaxed mb-12">
          Send to any phone number. Settles on M-Pesa, MoMo, Wave or bank —
          in seconds. No crypto knowledge required.
        </p>

        {/* Value props */}
        <div className="grid grid-cols-2 gap-3 w-full mb-12">
          {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/8 bg-white/4 p-4 text-left"
            >
              <Icon className="h-5 w-5 text-violet-400 mb-2" />
              <p className="text-sm font-semibold text-white/90 mb-0.5">{title}</p>
              <p className="text-xs text-white/40 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Link
            to="/signup"
            className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 py-4 text-sm font-bold text-white hover:bg-violet-500 transition"
          >
            Continue with phone number
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/dashboard"
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 py-4 text-sm font-medium text-white/50 hover:text-white/80 hover:border-white/20 transition"
          >
            Skip — try demo account
          </Link>
          {canInstall && (
            <button
              onClick={handleGetApp}
              className="flex items-center justify-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 py-3 text-sm font-medium text-violet-300 hover:bg-violet-500/20 transition"
            >
              <Download className="h-4 w-4" />
              Get the app
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 px-6 text-xs text-white/20">
        Powered by Avalanche · Secured by your phone
      </footer>

      {/* iOS instructions sheet */}
      {showIOSSheet && <IOSInstructions onClose={() => setShowIOSSheet(false)} />}
    </div>
  );
}
