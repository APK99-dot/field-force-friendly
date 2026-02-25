import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { format, isSameMonth, startOfMonth, endOfMonth, eachDayOfInterval, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, LogOut, Loader2, Clock, CalendarDays, FileText, Edit3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAttendance, isWeekOffDate } from "@/hooks/useAttendance";
import { AttendanceCalendarView } from "@/components/attendance/AttendanceCalendarView";
import LeaveBalanceCards from "@/components/LeaveBalanceCards";
import MyLeaveApplications from "@/components/MyLeaveApplications";
import HolidayManagement from "@/components/HolidayManagement";
import RegularizationRequestModal from "@/components/RegularizationRequestModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Attendance() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [userId, setUserId] = useState<string>();
  const [actionLoading, setActionLoading] = useState(false);
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [selectedRecordForReg, setSelectedRecordForReg] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [dateFilter, setDateFilter] = useState("current-month");
  const [showPresentDaysDialog, setShowPresentDaysDialog] = useState(false);
  const [showAbsentDaysDialog, setShowAbsentDaysDialog] = useState(false);

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

  // Compute date range based on filter
  const dateRange = useMemo(() => {
    const now = new Date();
    if (dateFilter === "last-month") {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [dateFilter]);

  const days = useMemo(() => eachDayOfInterval({ start: dateRange.start, end: dateRange.end }), [dateRange]);

  // Filter records by date range
  const filteredRecords = useMemo(() => {
    const startStr = format(dateRange.start, "yyyy-MM-dd");
    const endStr = format(dateRange.end, "yyyy-MM-dd");
    return monthRecords.filter((r) => r.date >= startStr && r.date <= endStr);
  }, [monthRecords, dateRange]);

  const stats = useMemo(() => {
    const presentDays = filteredRecords.filter((r) => r.status === "present" || r.status === "regularized").length;
    const totalWorkingDays = days.filter((d) => {
      const key = format(d, "yyyy-MM-dd");
      if (holidayDates.has(key)) return false;
      if (isWeekOffDate(d, weekOffConfig)) return false;
      return true;
    }).length;
    const pct = totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;
    return { presentDays, totalWorkingDays, pct };
  }, [filteredRecords, days, holidayDates, weekOffConfig]);

  // Present/Absent date lists
  const presentDatesList = useMemo(() => {
    return filteredRecords
      .filter((r) => r.status === "present" || r.status === "regularized")
      .map((r) => r.date)
      .sort();
  }, [filteredRecords]);

  const absentDatesList = useMemo(() => {
    const presentSet = new Set(presentDatesList);
    const today = format(new Date(), "yyyy-MM-dd");
    return days
      .map((d) => format(d, "yyyy-MM-dd"))
      .filter((key) => {
        if (key > today) return false;
        if (presentSet.has(key)) return false;
        if (holidayDates.has(key)) return false;
        if (isWeekOffDate(new Date(key), weekOffConfig)) return false;
        // Check if on leave
        const rec = filteredRecords.find((r) => r.date === key);
        if (rec && (rec.status === "leave" || rec.status === "half-day")) return false;
        return true;
      })
      .sort();
  }, [days, presentDatesList, holidayDates, weekOffConfig, filteredRecords]);

  // Attendance data merged with absent placeholders
  const attendanceData = useMemo(() => {
    const absentRecords = absentDatesList.map((date) => ({
      id: `absent-${date}`,
      date,
      status: "absent",
      check_in_time: null,
      check_out_time: null,
      total_hours: null,
      isAbsentPlaceholder: true,
    }));
    return [...filteredRecords, ...absentRecords].sort(
      (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [filteredRecords, absentDatesList]);

  // Regularization map by date
  const regMap = useMemo(() => {
    const map = new Map<string, any>();
    regularizationRequests.forEach((r) => map.set(r.date, r));
    return map;
  }, [regularizationRequests]);

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

  const handleOpenRegularizationModal = (record: any) => {
    setSelectedRecordForReg(record);
    setRegModalOpen(true);
  };

  const handleRefresh = () => {
    refetch();
    setRefreshTrigger((prev) => prev + 1);
  };

  const formatTime = (timeString: string | null) => {
    if (!timeString) return "--:--";
    return new Date(timeString).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const existingRegRequest = useMemo(() => {
    if (!selectedRecordForReg) return null;
    return regMap.get(selectedRecordForReg.date) || null;
  }, [selectedRecordForReg, regMap]);

  return (
    <motion.div className="p-4 space-y-4 max-w-2xl mx-auto pb-24" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="text-center">
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">Track your daily attendance and working hours</p>
      </div>

      {/* Monthly Summary Cards - 2 cards matching staging */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl p-5 text-center shadow-sm">
          <div className="text-3xl font-bold text-foreground">{stats.pct}%</div>
          <div className="text-xs font-medium text-muted-foreground mt-1">This Month</div>
        </div>
        <div className="bg-card rounded-2xl p-5 text-center shadow-sm">
          <div className="text-3xl font-bold text-foreground">{stats.presentDays}/{stats.totalWorkingDays}</div>
          <div className="text-xs font-medium text-muted-foreground mt-1">Present Days</div>
        </div>
      </div>

      {/* Check-in / Check-out */}
      <div className="flex gap-3">
        <button
          onClick={handleCheckIn}
          disabled={actionLoading || isCheckedIn || isCheckedOut}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold transition-all border",
            isCheckedIn || isCheckedOut
              ? "bg-card text-muted-foreground border-border cursor-default"
              : "bg-card text-foreground border-border hover:bg-accent"
          )}
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 text-[hsl(150,50%,45%)]" />}
          {isCheckedIn ? "Day Started" : isCheckedOut ? "Day Ended" : "Start My Day"}
        </button>
        <button
          onClick={handleCheckOut}
          disabled={actionLoading || !isCheckedIn || isCheckedOut}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-sm font-semibold transition-all",
            !isCheckedIn || isCheckedOut
              ? "bg-destructive/10 text-destructive/50 cursor-default opacity-60"
              : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          )}
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
          {isCheckedOut ? "Day Ended" : "End My Day"}
        </button>
      </div>

      {/* Calendar View with Present/Absent Summary */}
      <div className="bg-background rounded-2xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div
            className="bg-[hsl(150,35%,93%)] rounded-xl p-2.5 text-center cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setShowPresentDaysDialog(true)}
          >
            <div className="flex items-center justify-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-[hsl(150,50%,45%)]" />
              <span className="text-lg font-bold text-[hsl(150,45%,30%)]">{stats.presentDays}</span>
            </div>
            <div className="text-[11px] font-medium text-[hsl(150,35%,40%)]">Present Days</div>
          </div>
          <div
            className="bg-[hsl(0,40%,95%)] rounded-xl p-2.5 text-center cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setShowAbsentDaysDialog(true)}
          >
            <div className="flex items-center justify-center gap-1.5">
              <XCircle className="h-4 w-4 text-[hsl(0,50%,55%)]" />
              <span className="text-lg font-bold text-[hsl(0,45%,35%)]">{absentDatesList.length}</span>
            </div>
            <div className="text-[11px] font-medium text-[hsl(0,35%,45%)]">Absent Days</div>
          </div>
        </div>
        <AttendanceCalendarView
          attendanceRecords={monthRecords}
          leaveRecords={leaveRecords}
          weekOffConfig={weekOffConfig}
          holidayDates={holidayDates}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
        />
      </div>

      {/* Present Days Dialog */}
      <Dialog open={showPresentDaysDialog} onOpenChange={setShowPresentDaysDialog}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-[hsl(150,50%,45%)]" />
              Present Days ({presentDatesList.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {presentDatesList.length > 0 ? presentDatesList.map((date) => (
              <div key={date} className="flex items-center gap-3 p-3 bg-[hsl(150,35%,94%)] rounded-xl">
                <CheckCircle className="h-4 w-4 text-[hsl(150,50%,45%)]" />
                <span className="font-medium text-sm">{format(new Date(date), "EEE, MMM dd, yyyy")}</span>
              </div>
            )) : (
              <div className="text-center text-muted-foreground py-4">No present days recorded</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Absent Days Dialog */}
      <Dialog open={showAbsentDaysDialog} onOpenChange={setShowAbsentDaysDialog}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-[hsl(0,50%,55%)]" />
              Absent Days ({absentDatesList.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {absentDatesList.length > 0 ? absentDatesList.map((date) => (
              <div key={date} className="flex items-center gap-3 p-3 bg-[hsl(0,40%,95%)] rounded-xl">
                <XCircle className="h-4 w-4 text-[hsl(0,50%,55%)]" />
                <span className="font-medium text-sm">{format(new Date(date), "EEE, MMM dd, yyyy")}</span>
              </div>
            )) : (
              <div className="text-center text-muted-foreground py-4">No absent days recorded</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Market Hours Module - 3-column layout matching staging */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Today's Market Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* First Check In */}
            {todayRecord?.check_in_time ? (
              <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <div className="text-center">
                  <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-600" />
                  <div className="font-semibold text-green-800 dark:text-green-200 text-sm">First Check In</div>
                  <div className="text-sm text-green-600 dark:text-green-400 mt-1">
                    {format(new Date(todayRecord.check_in_time), "hh:mm a")}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted p-4 rounded-lg border">
                <div className="text-center text-muted-foreground">
                  <CheckCircle className="h-5 w-5 mx-auto mb-2" />
                  <div className="font-semibold text-sm">First Check In</div>
                  <div className="text-xs mt-1">Not started</div>
                </div>
              </div>
            )}

            {/* Active Market Hours */}
            <div className={`p-4 rounded-lg border ${
              todayRecord?.check_out_time
                ? "bg-blue-100 dark:bg-blue-900 border-blue-200 dark:border-blue-800"
                : "bg-muted border-border"
            }`}>
              <div className="text-center">
                <Clock className={`h-5 w-5 mx-auto mb-2 ${todayRecord?.check_out_time ? "text-blue-600" : "text-muted-foreground"}`} />
                <div className={`font-semibold text-sm ${todayRecord?.check_out_time ? "text-blue-800 dark:text-blue-200" : "text-muted-foreground"}`}>
                  Active Market Hours
                </div>
                <div className={`text-sm mt-1 ${todayRecord?.check_out_time ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                  {todayRecord?.check_in_time && todayRecord?.check_out_time ? (() => {
                    const diffMs = new Date(todayRecord.check_out_time).getTime() - new Date(todayRecord.check_in_time).getTime();
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    return `${hours}h ${minutes}m`;
                  })() : "--:--"}
                </div>
              </div>
            </div>

            {/* Last Check Out */}
            {todayRecord?.check_out_time ? (
              <div className="bg-orange-100 dark:bg-orange-900 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="text-center">
                  <LogOut className="h-5 w-5 mx-auto mb-2 text-orange-600" />
                  <div className="font-semibold text-orange-800 dark:text-orange-200 text-sm">Last Check Out</div>
                  <div className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                    {format(new Date(todayRecord.check_out_time), "hh:mm a")}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted p-4 rounded-lg border">
                <div className="text-center text-muted-foreground">
                  <LogOut className="h-5 w-5 mx-auto mb-2" />
                  <div className="font-semibold text-sm">Last Check Out</div>
                  <div className="text-xs mt-1">Not ended</div>
                </div>
              </div>
            )}
          </div>
          <div className="text-sm text-muted-foreground text-center mt-4">
            Market hours are automatically tracked from your attendance
          </div>
        </CardContent>
      </Card>

      {/* Tabs: My Attendance, Leave, Holiday */}
      <Tabs defaultValue="attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attendance">My Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="holiday">Holiday</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Attendance</CardTitle>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current-month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {attendanceData.length > 0 ? (
                  attendanceData.slice(0, 15).map((record: any) => {
                    const isAbsent = record.status === "absent" || record.isAbsentPlaceholder;
                    const isRegularized = record.status === "regularized";
                    const existingReq = regMap.get(record.date);
                    const hasPendingRequest = existingReq?.status === "pending";
                    const hasRejectedRequest = existingReq?.status === "rejected";

                    return (
                      <div
                        key={record.id}
                        className={cn(
                          "flex flex-col gap-3 p-4 border rounded-lg hover:shadow-md transition-all",
                          isAbsent && "bg-red-50/50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
                          isRegularized && "bg-purple-50/50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            {isAbsent ? (
                              <XCircle className="h-5 w-5 text-red-600" />
                            ) : isRegularized ? (
                              <CheckCircle className="h-5 w-5 text-purple-600" />
                            ) : (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            )}
                            <div className="flex-1">
                              <div className="font-medium">{format(new Date(record.date), "EEE, MMM dd, yyyy")}</div>
                              {isAbsent ? (
                                <div className="text-sm text-red-600 dark:text-red-400">Absent - No attendance recorded</div>
                              ) : (
                                <>
                                  <div className="text-sm text-muted-foreground">
                                    In: {formatTime(record.check_in_time)} | Out: {formatTime(record.check_out_time)}
                                  </div>
                                  {record.total_hours && (
                                    <div className="text-xs text-blue-600">Total: {record.total_hours.toFixed(1)} hours</div>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Status Badges */}
                            <div className="flex flex-col gap-1 items-end">
                              {isAbsent && !hasPendingRequest && !hasRejectedRequest && (
                                <Badge variant="destructive">Absent</Badge>
                              )}
                              {isRegularized && (
                                <Badge className="bg-purple-500 hover:bg-purple-600">Regularized</Badge>
                              )}
                              {hasPendingRequest && (
                                <Badge className="bg-yellow-500 hover:bg-yellow-600">Pending Approval</Badge>
                              )}
                              {hasRejectedRequest && (
                                <Badge variant="destructive" className="text-xs">Rejected - Resubmit</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Regularization Button */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 border-orange-300 text-orange-700 hover:bg-orange-50"
                            onClick={() => handleOpenRegularizationModal(record)}
                            title={hasRejectedRequest ? "Resubmit Regularization" : "Request Regularization"}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p>No attendance records found for the selected period</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <div className="space-y-4">
            <LeaveBalanceCards
              refreshTrigger={refreshTrigger}
              onApplicationSubmitted={handleRefresh}
            />
            <MyLeaveApplications refreshTrigger={refreshTrigger} />
          </div>
        </TabsContent>

        <TabsContent value="holiday">
          <HolidayManagement readOnly />
        </TabsContent>
      </Tabs>

      {userId && (
        <RegularizationRequestModal
          isOpen={regModalOpen}
          onClose={() => {
            setRegModalOpen(false);
            setSelectedRecordForReg(null);
          }}
          attendanceRecord={selectedRecordForReg}
          existingRequest={existingRegRequest}
          onSubmit={handleRefresh}
          userId={userId}
        />
      )}
    </motion.div>
  );
}
