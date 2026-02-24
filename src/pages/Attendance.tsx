import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday,
  isBefore,
  subMonths,
  addMonths,
  isSameMonth,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  LogIn,
  LogOut,
  AlertTriangle,
} from "lucide-react";

type AttendanceStatus = "present" | "absent" | "leave" | "half-day" | "holiday" | "week-off" | null;

const mockAttendance: Record<string, AttendanceStatus> = {
  "2026-02-02": "present",
  "2026-02-03": "present",
  "2026-02-04": "present",
  "2026-02-05": "present",
  "2026-02-06": "present",
  "2026-02-07": "week-off",
  "2026-02-08": "week-off",
  "2026-02-09": "present",
  "2026-02-10": "present",
  "2026-02-11": "present",
  "2026-02-12": "present",
  "2026-02-13": "present",
  "2026-02-14": "week-off",
  "2026-02-15": "week-off",
  "2026-02-16": "present",
  "2026-02-17": "present",
  "2026-02-18": "present",
  "2026-02-19": "absent",
  "2026-02-20": "absent",
  "2026-02-21": "week-off",
  "2026-02-22": "week-off",
  "2026-02-23": "absent",
  "2026-02-24": "present",
};

const statusColorMap: Record<string, string> = {
  present: "bg-success text-success-foreground",
  absent: "bg-destructive text-destructive-foreground",
  leave: "bg-leave text-white",
  "half-day": "bg-gradient-to-b from-success to-leave text-white",
  holiday: "bg-info text-info-foreground",
  "week-off": "bg-muted text-muted-foreground",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Attendance() {
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 1));

  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  // Shift to Monday-start: getDay returns 0=Sun..6=Sat. We want 0=Mon..6=Sun
  const startDayOfWeek = (getDay(start) + 6) % 7;

  const stats = useMemo(() => {
    const entries = Object.entries(mockAttendance).filter(([date]) =>
      isSameMonth(new Date(date), currentMonth)
    );
    const presentDays = entries.filter(([, s]) => s === "present").length;
    const totalWorkingDays = days.filter((d) => {
      const day = getDay(d);
      return day !== 0 && day !== 6; // exclude weekends
    }).length;
    const absentDays = totalWorkingDays - presentDays;
    const pct = totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;
    return { presentDays, absentDays, totalWorkingDays, pct };
  }, [currentMonth, days]);

  return (
    <motion.div
      className="p-4 space-y-4 max-w-2xl mx-auto"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">Track your daily attendance and working hours</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{stats.pct}%</p>
            <p className="text-xs text-muted-foreground">This Month</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{stats.presentDays}/{stats.totalWorkingDays}</p>
            <p className="text-xs text-muted-foreground">Present Days</p>
          </CardContent>
        </Card>
      </div>

      {/* Start/End Day Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12 text-sm font-medium gap-2">
          <CheckCircle className="h-4 w-4 text-success" />
          Start My Day
        </Button>
        <Button variant="outline" className="h-12 text-sm font-medium gap-2 border-destructive/20 text-destructive">
          <LogOut className="h-4 w-4" />
          End My Day
        </Button>
      </div>

      {/* GPS Tracking Note */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>GPS tracking will start at 9 AM</span>
      </div>

      {/* Present / Absent Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-success/10 border-success/20">
          <CardContent className="p-3 flex items-center justify-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            <span className="text-lg font-bold">{stats.presentDays}</span>
            <span className="text-xs text-muted-foreground">Present Days</span>
          </CardContent>
        </Card>
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-3 flex items-center justify-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-lg font-bold">{stats.absentDays}</span>
            <span className="text-xs text-muted-foreground">Absent Days</span>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-y-2">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const status = mockAttendance[key];
              const today = isToday(day);
              const isPast = isBefore(day, new Date()) && !today;
              const defaultStatus = isPast && !status ? "absent" : status;
              const colorClass = defaultStatus ? statusColorMap[defaultStatus] : "";

              return (
                <div key={key} className="flex justify-center">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      colorClass || (today ? "ring-2 ring-primary" : "text-foreground")
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
            {[
              { label: "Present", color: "bg-success" },
              { label: "Absent", color: "bg-destructive" },
              { label: "Leave", color: "bg-leave" },
              { label: "Holiday", color: "bg-info" },
              { label: "Week Off", color: "bg-muted" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
