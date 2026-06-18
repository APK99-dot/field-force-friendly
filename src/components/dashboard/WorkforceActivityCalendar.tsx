import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { WorkforceActivityRow } from "@/hooks/useWorkforceOverview";

interface Props {
  activities: WorkforceActivityRow[];
  anchorDate: Date;
}

const statusStyles: Record<string, string> = {
  planned: "bg-info/10 text-info border border-info/20",
  in_progress: "bg-warning/10 text-warning border border-warning/20",
  completed: "bg-success/10 text-success border border-success/20",
};

const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WorkforceActivityCalendar({ activities, anchorDate }: Props) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(anchorDate);
    const monthEnd = endOfMonth(anchorDate);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    });
  }, [anchorDate]);

  const byDate = useMemo(() => {
    const map = new Map<string, WorkforceActivityRow[]>();
    activities.forEach((a) => {
      const key = a.activity_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [activities]);

  return (
    <div>
      <p className="mb-3 text-sm font-semibold">
        Activity Calendar — {format(anchorDate, "MMMM yyyy")}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const entries = byDate.get(key) || [];
          const inMonth = isSameMonth(day, anchorDate);
          return (
            <div
              key={key}
              className={cn(
                "min-h-[88px] rounded-md border p-1 flex flex-col gap-1",
                !inMonth && "bg-muted/30 opacity-60",
                isToday(day) && "ring-1 ring-primary"
              )}
            >
              <span
                className={cn(
                  "text-[10px] sm:text-xs font-medium",
                  isToday(day) ? "text-primary" : "text-muted-foreground"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="flex flex-col gap-0.5 overflow-y-auto max-h-[120px]">
                {entries.map((e) => (
                  <div
                    key={e.id}
                    className={cn(
                      "rounded px-1 py-0.5 text-[9px] sm:text-[10px] leading-tight",
                      statusStyles[e.status] || "bg-muted text-muted-foreground"
                    )}
                    title={`${e.full_name} · ${e.site_name || "No site"} · ${
                      statusLabels[e.status] || e.status
                    }`}
                  >
                    <p className="truncate font-medium">{e.full_name}</p>
                    <p className="truncate opacity-80">{e.site_name || "No site"}</p>
                    <p className="truncate font-semibold">
                      {statusLabels[e.status] || e.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] sm:text-xs">
        {Object.entries(statusLabels).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("h-2.5 w-2.5 rounded-full", statusStyles[k])} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
