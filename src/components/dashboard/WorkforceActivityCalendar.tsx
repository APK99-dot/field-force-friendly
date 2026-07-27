import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkforceActivityRow } from "@/hooks/useWorkforceOverview";

interface Props {
  activities: WorkforceActivityRow[];
  anchorDate: Date;
}

// Ensure the Sora + Manrope pair loads once (matches selected direction).
if (typeof document !== "undefined" && !document.getElementById("wac-fonts")) {
  const link = document.createElement("link");
  link.id = "wac-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Manrope:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}

type StatusKey = "planned" | "in_progress" | "completed";

const pillStyles: Record<StatusKey, { bg: string; bar: string; text: string }> = {
  planned: { bg: "bg-[#E9EEF7]", bar: "bg-[#1E3A6B]", text: "text-[#1E3A6B]" },
  in_progress: { bg: "bg-[#FEF3C7]", bar: "bg-[#D4A34A]", text: "text-[#92400E]" },
  completed: { bg: "bg-[#DCFCE7]", bar: "bg-[#22C55E]", text: "text-[#166534]" },
};

const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MAX_PILLS = 3;

export default function WorkforceActivityCalendar({ activities, anchorDate }: Props) {
  const navigate = useNavigate();
  const [viewDate, setViewDate] = useState<Date>(anchorDate);

  useEffect(() => {
    setViewDate(anchorDate);
  }, [anchorDate]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    });
  }, [viewDate]);

  const byDate = useMemo(() => {
    const map = new Map<string, WorkforceActivityRow[]>();
    activities.forEach((a) => {
      const key = a.activity_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [activities]);

  const activeInMonth = useMemo(
    () => activities.filter((a) => isSameMonth(new Date(a.activity_date), viewDate)).length,
    [activities, viewDate]
  );

  const goPrev = () => setViewDate((d) => subMonths(d, 1));
  const goNext = () => setViewDate((d) => addMonths(d, 1));
  const goToday = () => setViewDate(new Date());

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[#E9EEF7] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
      style={{ fontFamily: "'Manrope', ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-[#E9EEF7] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3
            className="text-lg font-bold leading-tight text-[#0B1E3F] sm:text-xl"
            style={{ fontFamily: "'Sora', ui-sans-serif, system-ui, sans-serif" }}
          >
            Activity Calendar
          </h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">
            {format(viewDate, "MMMM yyyy")} • {activeInMonth} active {activeInMonth === 1 ? "task" : "tasks"}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center rounded-lg border border-[#E9EEF7] bg-[#F5F7FB] p-1">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous month"
              className="rounded-md p-1.5 text-[#1E3A6B] transition-all hover:bg-white hover:shadow-sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-semibold text-[#0B1E3F] sm:px-4 sm:text-sm">
              {format(viewDate, "MMM yyyy")}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next month"
              className="rounded-md p-1.5 text-[#1E3A6B] transition-all hover:bg-white hover:shadow-sm"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg bg-[#0B1E3F] px-3 py-2 text-xs font-semibold text-white shadow-md transition-colors hover:bg-[#1E3A6B] sm:px-4 sm:text-sm"
          >
            Today
          </button>
        </div>
      </div>

      {/* Grid (scrolls horizontally on small screens) */}
      <div className="w-full overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-[#E9EEF7] bg-[#F5F7FB]/60">
            {weekdays.map((d) => (
              <div
                key={d}
                className="py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const key = format(day, "yyyy-MM-dd");
              const entries = byDate.get(key) || [];
              const inMonth = isSameMonth(day, viewDate);
              const today = isToday(day);
              const isLastCol = idx % 7 === 6;
              const visible = entries.slice(0, MAX_PILLS);
              const overflow = entries.length - visible.length;

              return (
                <div
                  key={key}
                  className={cn(
                    "relative flex min-h-[96px] flex-col gap-1.5 border-b border-[#E9EEF7] p-1.5 transition-colors sm:min-h-[140px] sm:p-2",
                    !isLastCol && "border-r",
                    !inMonth && "bg-[#F5F7FB]/30",
                    inMonth && !today && "hover:bg-[#F5F7FB]/50",
                    today && "bg-[#0B1E3F]/[0.04] ring-2 ring-inset ring-[#D4A34A]/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-semibold sm:text-sm",
                        !inMonth && "text-slate-300",
                        inMonth && !today && "text-slate-500",
                        today && "text-[#0B1E3F] font-bold"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {today && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#D4A34A]">
                        Today
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    {visible.map((e) => {
                      const s = (pillStyles[e.status as StatusKey] || pillStyles.planned);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => navigate(`/activities?id=${e.id}`)}
                          title={`${e.full_name} · ${e.site_name || "No site"} · ${
                            statusLabels[e.status] || e.status
                          }`}
                          className={cn(
                            "group relative overflow-hidden rounded-md pl-2 pr-1.5 py-1 text-left text-[10px] leading-tight transition-all hover:brightness-95 active:brightness-90",
                            s.bg,
                            s.text
                          )}
                        >
                          <span className={cn("absolute inset-y-0 left-0 w-1", s.bar)} />
                          <div className="truncate font-bold">{e.full_name}</div>
                          <div className="truncate opacity-80">{e.site_name || "No site"}</div>
                        </button>
                      );
                    })}
                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={() => navigate(`/activities?id=${entries[MAX_PILLS].id}`)}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 text-left text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E9EEF7] bg-[#F5F7FB]/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#1E3A6B]" />
            <span className="text-[11px] font-semibold text-slate-600 sm:text-xs">Planned</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#D4A34A]" />
            <span className="text-[11px] font-semibold text-slate-600 sm:text-xs">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
            <span className="text-[11px] font-semibold text-slate-600 sm:text-xs">Completed</span>
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {format(viewDate, "yyyy")} · Month view
        </div>
      </div>
    </div>
  );
}
