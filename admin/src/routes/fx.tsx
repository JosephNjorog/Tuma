import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { opsApi, type FxRate } from "@/lib/api";
import { fmt, timeAgo, cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { PageHeader, LoadingSpinner, ErrorDisplay } from "@/components/Layout";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/fx")({ component: FxPage });

const CURRENCIES = ["KES", "NGN", "GHS", "UGX", "TZS", "XOF"];

function RateCard({ rate }: { rate: FxRate }) {
  const isOverride = rate.source.startsWith("ops_override");
  const spreadPct = (rate.spread * 100).toFixed(2);

  return (
    <Card className={cn("relative overflow-hidden", isOverride ? "border-orange-400" : "")}>
      {isOverride && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-orange-400" />
      )}
      <CardHeader className="pb-1 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">USD →</p>
            <CardTitle className="text-2xl font-bold tracking-tight">{rate.currency}</CardTitle>
          </div>
          {isOverride && (
            <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" />
              Override
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs text-muted-foreground">AP Rate</p>
            <p className="text-lg font-semibold tabular-nums">{fmt(rate.tumaRate, 2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Mid Rate</p>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">{fmt(rate.midRate, 2)}</p>
          </div>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            Spread: <span className="font-medium text-foreground">{spreadPct}%</span>
          </span>
          <span className="text-muted-foreground">{timeAgo(rate.fetchedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FxPage() {
  const qc = useQueryClient();
  const [selectedCurrency, setSelectedCurrency] = useState("KES");
  const [historyDays, setHistoryDays] = useState(7);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideCurrency, setOverrideCurrency] = useState("KES");
  const [overrideRate, setOverrideRate] = useState("");
  const [overrideNote, setOverrideNote] = useState("");

  const { data: ratesData, isLoading: ratesLoading, error: ratesError } = useQuery({
    queryKey: ["fx-current"],
    queryFn: opsApi.fx.current,
    refetchInterval: 60_000,
  });

  const { data: historyData, isLoading: histLoading } = useQuery({
    queryKey: ["fx-history", selectedCurrency, historyDays],
    queryFn: () => opsApi.fx.history(selectedCurrency, historyDays),
  });

  const override = useMutation({
    mutationFn: () =>
      opsApi.fx.override(overrideCurrency, parseFloat(overrideRate), overrideNote || undefined),
    onSuccess: () => {
      toast.success(`Rate overridden for ${overrideCurrency}`);
      qc.invalidateQueries({ queryKey: ["fx-current"] });
      setOverrideOpen(false);
      setOverrideRate("");
      setOverrideNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chartData = historyData?.history
    .slice()
    .reverse()
    .map((r) => ({
      time: new Date(r.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" }),
      mid: r.midRate,
      tuma: r.tumaRate,
    }));

  return (
    <div>
      <PageHeader
        title="FX Rates"
        action={
          <Button size="sm" variant="outline" onClick={() => setOverrideOpen(true)}>
            <AlertTriangle className="h-4 w-4" />
            Override Rate
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Rate cards */}
        {ratesLoading ? (
          <LoadingSpinner />
        ) : ratesError ? (
          <ErrorDisplay error={ratesError as Error} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {ratesData?.rates.map((rate) => <RateCard key={rate.currency} rate={rate} />)}
          </div>
        )}

        {/* History chart */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Rate History</CardTitle>
            <div className="flex gap-2">
              <Select
                value={selectedCurrency}
                onValueChange={setSelectedCurrency}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(historyDays)}
                onValueChange={(v) => setHistoryDays(Number(v))}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7d</SelectItem>
                  <SelectItem value="14">14d</SelectItem>
                  <SelectItem value="30">30d</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {histLoading ? (
              <LoadingSpinner />
            ) : chartData && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="mid"
                    name="Mid Rate"
                    stroke="#6366f1"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="tuma"
                    name="AP Rate"
                    stroke="#ec4899"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No history data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Override dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emergency Rate Override</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-orange-600 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            This will immediately update the AutoPayKe rate used for new quotes.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Currency</label>
              <Select value={overrideCurrency} onValueChange={setOverrideCurrency}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">New AP Rate (USD → {overrideCurrency})</label>
              <Input
                type="number"
                placeholder="e.g. 128.50"
                value={overrideRate}
                onChange={(e) => setOverrideRate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Note (optional)</label>
              <Input
                placeholder="Reason for override"
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              disabled={!overrideRate || parseFloat(overrideRate) <= 0 || override.isPending}
              onClick={() => override.mutate()}
            >
              {override.isPending ? "Overriding…" : "Override Rate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
