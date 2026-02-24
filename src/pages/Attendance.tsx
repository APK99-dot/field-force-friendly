import { useState } from "react";
import { motion } from "framer-motion";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  subMonths,
  addMonths,
  isToday,
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Clock, MapPin, Camera } from "lucide-react";

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
  "2026-02-11": "half-day",
  "2026-02-12": "present",
  "2026-02-13": "leave",
  "2026-02-14": "holiday",
  "2026-02-15": "week-off",
  "2026-02-16": "present",
  "2026-02-17": "present",
  "2026-02-18": "present",
  "2026-02-19": "absent",
  "2026-02-20": "present",
  "2026-02-21": "week-off",
  "2026-02-22": "week-off",
  "2026-02-23": "present",
  "2026-02-24": "present",
};

const statusColorMap: Record<string, string> = {
  present: "bg-present",
  absent: "bg-absent",
  leave: "bg-leave",
  "half-day": "bg-gradient-to-b from-present to-leave",
  holiday: "bg-holiday",
  "week-off": "bg-week-off",
};

const statusLabel: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  leave: "On Leave",
  "half-day": "Half Day",
  holiday: "Holiday",
  "week-off": "Week Off",
};

const records = [
  { date: "Feb 24", checkIn: "9:02 AM", checkOut: "6:15 PM", hours: "9h 13m", status: "present" },
  { date: "Feb 23", checkIn: "8:55 AM", checkOut: "6:30 PM", hours: "9h 35m", status: "present" },
  { date: "Feb 22", checkIn: "-", checkOut: "-", hours: "-", status: "week-off" },
  { date: "Feb 21", checkIn: "-", checkOut: "-", hours: "-", status: "week-off" },
  { date: "Feb 20", checkIn: "9:10 AM", checkOut: "6:00 PM", hours: "8h 50m", status: "present" },
  { date: "Feb 19", checkIn: "-", checkOut: "-", hours: "-", status: "absent" },
];

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function Attendance() {
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 1));
  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  const startDayOfWeek = getDay(start);

  return (
    <motion.div
      className="p-4 space-y-4 max-w-2xl mx-auto"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Check In/Out */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Today, {format(new Date(), "MMM d")}</p>
              <p className="text-lg font-bold mt-0.5">Checked In</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" /> 9:02 AM
                <MapPin className="h-3 w-3 ml-2" /> Site Alpha
              </p>
            </div>
            <Button className="gradient-hero text-primary-foreground shadow-elevated">
              Check Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Calendar + Stats Card */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base">{format(currentMonth, "MMMM yyyy")}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map((d, i) => (
              <div key={i} className="text-center text-xs text-muted-foreground font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const status = mockAttendance[key];
              const today = isToday(day);
              return (
                <div key={key} className="flex flex-col items-center py-1">
                  <span className={`text-xs mb-0.5 ${today ? "font-bold text-primary" : "text-foreground"}`}>
                    {format(day, "d")}
                  </span>
                  {status ? (
                    <div className={`w-3 h-3 rounded-full ${statusColorMap[status]}`} />
                  ) : (
                    <div className="w-3 h-3" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
            {Object.entries(statusColorMap).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                <span className="text-[10px] text-muted-foreground">{statusLabel[key]}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-border">
            <div className="text-center">
              <p className="text-lg font-bold text-success">16</p>
              <p className="text-[10px] text-muted-foreground">Present</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-absent">1</p>
              <p className="text-[10px] text-muted-foreground">Absent</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-primary">142h</p>
              <p className="text-[10px] text-muted-foreground">Total Hours</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Records */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground px-1">Daily Records</h3>
        {records.map((r, i) => (
          <Card key={i} className="shadow-card">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-8 rounded-full ${statusColorMap[r.status]}`} />
                <div>
                  <p className="text-sm font-medium">{r.date}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.checkIn} → {r.checkOut}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="secondary" className="text-xs">{r.hours}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
