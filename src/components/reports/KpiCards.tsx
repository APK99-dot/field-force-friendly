import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone = "primary" | "success" | "warning" | "danger" | "info" | "muted";

const TONE_MAP: Record<KpiTone, { bg: string; text: string; ring: string }> = {
  primary: { bg: "bg-primary/10", text: "text-primary", ring: "ring-primary/20" },
  success: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20" },
  danger: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", ring: "ring-red-500/20" },
  info: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", ring: "ring-sky-500/20" },
  muted: { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" },
};

export interface KpiItem {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: KpiTone;
  trend?: { value: string; up?: boolean };
}

interface KpiGridProps {
  items: KpiItem[];
  cols?: 2 | 3 | 4 | 5 | 6;
}

export function KpiGrid({ items, cols = 4 }: KpiGridProps) {
  const colClass =
    cols === 6
      ? "sm:grid-cols-3 lg:grid-cols-6"
      : cols === 5
      ? "sm:grid-cols-3 lg:grid-cols-5"
      : cols === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : cols === 3
      ? "sm:grid-cols-3"
      : "sm:grid-cols-2";

  return (
    <div className={cn("grid grid-cols-2 gap-3", colClass)}>
      {items.map((it) => {
        const tone = TONE_MAP[it.tone || "primary"];
        const Icon = it.icon;
        return (
          <Card key={it.label} className="shadow-card overflow-hidden">
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {it.label}
                  </p>
                  <p className="mt-1 text-xl font-bold leading-tight sm:text-2xl">{it.value}</p>
                  {it.sub && <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{it.sub}</p>}
                  {it.trend && (
                    <p
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 text-[11px] font-semibold",
                        it.trend.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {it.trend.up ? "▲" : "▼"} {it.trend.value}
                    </p>
                  )}
                </div>
                {Icon && (
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1",
                      tone.bg,
                      tone.text,
                      tone.ring
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ChartGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const c = cols === 3 ? "lg:grid-cols-3" : cols === 2 ? "lg:grid-cols-2" : "";
  return <div className={cn("grid grid-cols-1 gap-4", c)}>{children}</div>;
}
