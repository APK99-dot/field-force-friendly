import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday as isDateToday,
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
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAttendance } from "@/hooks/useAttendance";
import { toast } from "sonner";

type AttendanceStatus = "present" | "absent" | "leave" | "half-day" | "holiday" | "week-off" | null;

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
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [userId, setUserId] = useState<string>();
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const { todayRecord, attendanceMap, loading, isCheckedIn, isCheckedOut, checkIn, checkOut } =
    useAttendance(userId);

  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  const startDayOfWeek = (getDay(start) + 6) % 7;

  const stats = useMemo(() => {
    const entries = Object.entries(attendanceMap).filter(([date]) =>
      isSameMonth(new Date(date), currentMonth)
    );
    const presentDays = entries.filter(([, s]) => s === "present").length;
    const totalWorkingDays = days.filter((d) => {
      const day = getDay(d);
      return day !== 0 && day !== 6;
    }).length;
    const absentDays = entries.filter(([, s]) => s === "absent").length;
    const pct = totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;
    return { presentDays, absentDays, totalWorkingDays, pct };
  }, [currentMonth, days, attendanceMap]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      await checkIn();
      toast.success("Checked in successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to check in");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    try {
      await checkOut();
      toast.success("Checked out successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to check out");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <motion.div
      className="p-4 space-y-4 max-w-2xl mx-auto"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
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
        <Button
          variant="outline"
          className="h-12 text-sm font-medium gap-2"
          onClick={handleCheckIn}
          disabled={actionLoading || isCheckedIn || isCheckedOut}
        >
          {actionLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 text-success" />
          )}
          {isCheckedIn ? "Checked In" : isCheckedOut ? "Day Ended" : "Start My Day"}
        </Button>
        <Button
          variant="outline"
          className="h-12 text-sm font-medium gap-2 border-destructive/20 text-destructive"
          onClick={handleCheckOut}
          disabled={actionLoading || !isCheckedIn || isCheckedOut}
        >
          {actionLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {isCheckedOut ? "Day Ended" : "End My Day"}
        </Button>
      </div>

      {/* Check-in/out times */}
      {todayRecord?.check_in_time && (
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>In: {format(new Date(todayRecord.check_in_time), "h:mm a")}</span>
          {todayRecord.check_out_time && (
            <span>Out: {format(new Date(todayRecord.check_out_time), "h:mm a")}</span>
          )}
          {todayRecord.total_hours && (
            <span>Total: {todayRecord.total_hours.toFixed(1)}h</span>
          )}
        </div>
      )}

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
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-2">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const status = attendanceMap[key] as AttendanceStatus;
              const today = isDateToday(day);
              const dayOfWeek = getDay(day);
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isPast = isBefore(day, new Date()) && !today;

              let displayStatus = status;
              if (!displayStatus && isWeekend) displayStatus = "week-off";
              // Don't mark future days as absent
              if (!displayStatus && isPast && !isWeekend) displayStatus = "absent";

              const colorClass = displayStatus ? statusColorMap[displayStatus] || "" : "";

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
