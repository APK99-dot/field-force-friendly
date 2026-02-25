import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { format, isSameMonth, getDay, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, LogOut, Loader2, Clock, CalendarDays, FileText, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAttendance, isWeekOffDate } from "@/hooks/useAttendance";
import { AttendanceCalendarView } from "@/components/attendance/AttendanceCalendarView";
import LeaveBalanceCards from "@/components/LeaveBalanceCards";
import MyLeaveApplications from "@/components/MyLeaveApplications";
import RegularizationRequestModal from "@/components/RegularizationRequestModal";
import { toast } from "sonner";

export default function Attendance() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [userId, setUserId] = useState<string>();
  const [actionLoading, setActionLoading] = useState(false);
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [selectedRegDate, setSelectedRegDate] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const {
    todayRecord, monthRecords, holidays, holidayDates, weekOffConfig,
    leaveRecords, regularizationRequests, marketHours,
    loading, isCheckedIn, isCheckedOut, checkIn, checkOut, refetch,
  } = useAttendance(userId);

  const days = useMemo(() => eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  }), [currentMonth]);

  const stats = useMemo(() => {
    const monthAttendance = monthRecords.filter(r => isSameMonth(new Date(r.date), currentMonth));
    const presentDays = monthAttendance.filter(r => r.status === "present" || r.status === "regularized").length;
    const totalWorkingDays = days.filter(d => {
      const key = format(d, "yyyy-MM-dd");
      if (holidayDates.has(key)) return false;
      if (isWeekOffDate(d, weekOffConfig)) return false;
      return true;
    }).length;
    const absentDays = monthAttendance.filter(r => r.status === "absent").length;
    const leaveDays = monthAttendance.filter(r => r.status === "leave" || r.status === "half-day").length;
    const pct = totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;
    return { presentDays, absentDays, leaveDays, totalWorkingDays, pct };
  }, [currentMonth, days, monthRecords, holidayDates, weekOffConfig]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    try { await checkIn(); toast.success("Checked in successfully!"); }
    catch (err: any) { toast.error(err.message || "Failed to check in"); }
    finally { setActionLoading(false); }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    try { await checkOut(); toast.success("Checked out successfully!"); }
    catch (err: any) { toast.error(err.message || "Failed to check out"); }
    finally { setActionLoading(false); }
  };

  const handleDateSelect = (dateStr: string) => {
    setSelectedRegDate(dateStr);
  };

  const selectedAttendanceRecord = useMemo(() => {
    if (!selectedRegDate) return null;
    const record = monthRecords.find(r => r.date === selectedRegDate);
    if (record) return { id: record.id, date: record.date, check_in_time: record.check_in_time, check_out_time: record.check_out_time, status: record.status };
    return { date: selectedRegDate, check_in_time: null, check_out_time: null, status: "absent", isAbsentPlaceholder: true };
  }, [selectedRegDate, monthRecords]);

  const existingRegRequest = useMemo(() => {
    if (!selectedRegDate) return null;
    return regularizationRequests.find(r => r.date === selectedRegDate) || null;
  }, [selectedRegDate, regularizationRequests]);

  const handleRefresh = () => {
    refetch();
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <motion.div className="p-4 space-y-4 max-w-2xl mx-auto pb-24" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="text-center">
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">Track your daily attendance and working hours</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.pct}%</p>
            <p className="text-[10px] text-muted-foreground">Attendance</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-success">{stats.presentDays}</p>
            <p className="text-[10px] text-muted-foreground">Present</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.absentDays}</p>
            <p className="text-[10px] text-muted-foreground">Absent</p>
          </CardContent>
        </Card>
      </div>

      {/* Check-in / Check-out */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12 text-sm font-medium gap-2" onClick={handleCheckIn} disabled={actionLoading || isCheckedIn || isCheckedOut}>
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 text-success" />}
          {isCheckedIn ? "Checked In" : isCheckedOut ? "Day Ended" : "Start My Day"}
        </Button>
        <Button variant="outline" className="h-12 text-sm font-medium gap-2 border-destructive/20 text-destructive" onClick={handleCheckOut} disabled={actionLoading || !isCheckedIn || isCheckedOut}>
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {isCheckedOut ? "Day Ended" : "End My Day"}
        </Button>
      </div>

      {/* Market Hours */}
      {marketHours && (
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Market Hours</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div><span className="text-muted-foreground text-xs">In: </span><span className="font-medium">{marketHours.firstCheckIn}</span></div>
              <div><span className="text-muted-foreground text-xs">Last: </span><span className="font-medium">{marketHours.lastActivity}</span></div>
              <div><span className="text-muted-foreground text-xs">Active: </span><span className="font-bold text-success">{marketHours.activeHours}h</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="calendar" className="text-xs gap-1"><CalendarDays className="h-3.5 w-3.5" />Calendar</TabsTrigger>
          <TabsTrigger value="leaves" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" />Leaves</TabsTrigger>
          <TabsTrigger value="applications" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" />Applications</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-3 space-y-3">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <AttendanceCalendarView
                attendanceRecords={monthRecords}
                leaveRecords={leaveRecords}
                weekOffConfig={weekOffConfig}
                holidayDates={holidayDates}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                onDateSelect={handleDateSelect}
              />
            </CardContent>
          </Card>
          {selectedRegDate && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setRegModalOpen(true)}>
                <AlertTriangle className="h-3.5 w-3.5" /> Request Regularization
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="leaves" className="mt-3">
          <LeaveBalanceCards refreshTrigger={refreshTrigger} onApplicationSubmitted={handleRefresh} />
        </TabsContent>

        <TabsContent value="applications" className="mt-3">
          <MyLeaveApplications refreshTrigger={refreshTrigger} />
        </TabsContent>
      </Tabs>

      {userId && (
        <RegularizationRequestModal
          isOpen={regModalOpen}
          onClose={() => setRegModalOpen(false)}
          attendanceRecord={selectedAttendanceRecord}
          existingRequest={existingRegRequest}
          onSubmit={handleRefresh}
          userId={userId}
        />
      )}
    </motion.div>
  );
}
