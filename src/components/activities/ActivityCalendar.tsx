import { useMemo, useState } from "react";
import {
  format,
  parseISO,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Activity as ActivityType } from "@/hooks/useActivities";

export type CalendarView = "day" | "week" | "month";

const STATUS_META: Record<string, { label: string; dot: string; chip: string }> = {
  planned: {
    label: "Planned",
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground border-border",
  },
  in_progress: {
    label: "In Progress",
    dot: "bg-info",
    chip: "bg-info/10 text-info border-info/30",
  },
  completed: {
    label: "Completed",
    dot: "bg-success",
    chip: "bg-success/10 text-success border-success/30",
  },
  delayed: {
    label: "Delayed",
    dot: "bg-destructive",
    chip: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const FLAG_DOT: Record<string, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  green: "bg-emerald-500",
};

const statusMeta = (s: string) => STATUS_META[s] || STATUS_META.planned;

interface ActivityCalendarProps {
  activities: ActivityType[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onOpenActivity: (a: ActivityType) => void;
  view: CalendarView;
  onChangeView: (v: CalendarView) => void;
}

export default function ActivityCalendar({
  activities,
  selectedDate,
  onSelectDate,
  onOpenActivity,
  view,
  onChangeView,
}: ActivityCalendarProps) {
  // Map a date key -> activities on that day (expands multi-day ranges)
  const byDay = useMemo(() => {
    const map = new Map<string, ActivityType[]>();
    const push = (key: string, a: ActivityType) => {
      const arr = map.get(key) || [];
      arr.push(a);
      map.set(key, arr);
    };
    for (const a of activities) {
      if (a.duration_type === "multiple_days" && a.from_date && a.to_date) {
        let cur = parseISO(a.from_date);
        const end = parseISO(a.to_date);
        while (cur <= end) {
          push(format(cur, "yyyy-MM-dd"), a);
          cur = addDays(cur, 1);
        }
      } else if (a.activity_date) {
        push(a.activity_date.slice(0, 10), a);
      }
    }
    return map;
  }, [activities]);

  const getDay = (d: Date) => byDay.get(format(d, "yyyy-MM-dd")) || [];

  const navigate = (dir: -1 | 1) => {
    if (view === "day") onSelectDate(addDays(selectedDate, dir));
    else if (view === "week") onSelectDate(dir === 1 ? addWeeks(selectedDate, 1) : subWeeks(selectedDate, 1));
    else onSelectDate(dir === 1 ? addMonths(selectedDate, 1) : subMonths(selectedDate, 1));
  };

  const headerLabel = useMemo(() => {
    if (view === "day") return format(selectedDate, "EEEE, MMM d, yyyy");
    if (view === "week") {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    return format(selectedDate, "MMMM yyyy");
  }, [view, selectedDate]);

  return (
    <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 min-w-0">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-semibold truncate">{headerLabel}</span>
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onSelectDate(new Date())}>
            Today
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:w-auto">
          {(["day", "week", "month"] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => onChangeView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "day" && (
        <DayView day={selectedDate} items={getDay(selectedDate)} onOpenActivity={onOpenActivity} />
      )}
      {view === "week" && (
        <WeekView
          selectedDate={selectedDate}
          getDay={getDay}
          onSelectDate={onSelectDate}
          onOpenActivity={onOpenActivity}
        />
      )}
      {view === "month" && (
        <MonthView
          selectedDate={selectedDate}
          getDay={getDay}
          onSelectDate={onSelectDate}
          onChangeView={onChangeView}
        />
      )}
    </div>
  );
}

/* ---------- Shared activity chip ---------- */
function ActivityChip({ a, onClick }: { a: ActivityType; onClick: () => void }) {
  const meta = statusMeta(a.status);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-full text-left rounded-md border px-1.5 py-1 transition-colors hover:brightness-95",
        meta.chip,
      )}
    >
      <div className="flex items-center gap-1">
        {a.site_flag && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", FLAG_DOT[a.site_flag] || "")} />}
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dot)} />
        <span className="truncate text-[11px] font-medium leading-tight">{a.activity_name}</span>
      </div>
    </button>
  );
}

/* ---------- Day View ---------- */
function DayView({
  day,
  items,
  onOpenActivity,
}: {
  day: Date;
  items: ActivityType[];
  onOpenActivity: (a: ActivityType) => void;
}) {
  return (
    <div className="p-3">
      {items.length === 0 ? (
        <div className="py-10 text-center">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No activities on {format(day, "MMM d")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => {
            const meta = statusMeta(a.status);
            return (
              <button
                key={a.id}
                onClick={() => onOpenActivity(a)}
                className="w-full text-left rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {a.site_flag && <span className={cn("h-2 w-2 rounded-full", FLAG_DOT[a.site_flag] || "")} />}
                      <p className="truncate text-sm font-semibold">{a.activity_name}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.activity_type}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", meta.chip)}>
                    {meta.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {a.site_name && (
                    <span className="flex items-center gap-1 min-w-0">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{a.site_name}</span>
                    </span>
                  )}
                  {a.user_full_name && (
                    <span className="flex items-center gap-1 min-w-0">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{a.user_full_name}</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Week View ---------- */
function WeekView({
  selectedDate,
  getDay,
  onSelectDate,
  onOpenActivity,
}: {
  selectedDate: Date;
  getDay: (d: Date) => ActivityType[];
  onSelectDate: (d: Date) => void;
  onOpenActivity: (a: ActivityType) => void;
}) {
  const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return (
    <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-7">
      {days.map((day) => {
        const items = getDay(day);
        const active = isSameDay(day, selectedDate);
        return (
          <div
            key={day.toISOString()}
            onClick={() => onSelectDate(day)}
            className={cn(
              "min-h-[120px] cursor-pointer bg-card p-2 transition-colors hover:bg-muted/30",
              active && "ring-1 ring-inset ring-primary",
            )}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">{format(day, "EEE")}</span>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
            <div className="space-y-1">
              {items.slice(0, 4).map((a) => (
                <ActivityChip key={a.id} a={a} onClick={() => onOpenActivity(a)} />
              ))}
              {items.length > 4 && (
                <p className="px-1 text-[10px] font-medium text-muted-foreground">+{items.length - 4} more</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Month View ---------- */
function MonthView({
  selectedDate,
  getDay,
  onSelectDate,
  onChangeView,
}: {
  selectedDate: Date;
  getDay: (d: Date) => ActivityType[];
  onSelectDate: (d: Date) => void;
  onChangeView: (v: CalendarView) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 0 });
  const days: Date[] = [];
  let cur = gridStart;
  while (cur <= gridEnd) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {weekDayLabels.map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {days.map((day) => {
          const items = getDay(day);
          const inMonth = isSameMonth(day, selectedDate);
          const active = isSameDay(day, selectedDate);
          const done = items.filter((a) => a.status === "completed").length;
          return (
            <div
              key={day.toISOString()}
              onClick={() => {
                onSelectDate(day);
                onChangeView("day");
              }}
              className={cn(
                "min-h-[72px] cursor-pointer bg-card p-1 transition-colors hover:bg-muted/40 sm:min-h-[110px] sm:p-1.5",
                !inMonth && "bg-muted/20",
                active && "ring-1 ring-inset ring-primary",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold sm:h-6 sm:w-6 sm:text-xs",
                    isToday(day)
                      ? "bg-primary text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50",
                  )}
                >
                  {format(day, "d")}
                </span>
                {items.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 text-[9px] font-semibold text-primary">
                    {items.length}
                  </span>
                )}
              </div>
              {/* Desktop: show chips. Mobile: show status dots */}
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {items.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight",
                      statusMeta(a.status).chip,
                    )}
                  >
                    {a.activity_name}
                  </div>
                ))}
                {items.length > 3 && (
                  <p className="px-1 text-[9px] font-medium text-muted-foreground">+{items.length - 3} more</p>
                )}
              </div>
              {items.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                  {items.slice(0, 6).map((a) => (
                    <span key={a.id} className={cn("h-1.5 w-1.5 rounded-full", statusMeta(a.status).dot)} />
                  ))}
                </div>
              )}
              {done > 0 && inMonth && (
                <p className="mt-0.5 hidden text-[9px] text-success sm:block">{done} done</p>
              )}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t p-2.5 text-[10px] text-muted-foreground">
        {Object.entries(STATUS_META).map(([k, m]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", m.dot)} />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
