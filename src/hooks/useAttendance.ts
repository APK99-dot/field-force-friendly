import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isBefore, isToday as isDateToday } from "date-fns";

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_location: any;
  check_out_location: any;
  check_in_photo_url: string | null;
  check_out_photo_url: string | null;
  check_in_address: string | null;
  check_out_address: string | null;
  status: string;
  total_hours: number | null;
}

interface Holiday {
  id: string;
  date: string;
  holiday_name: string;
}

interface WeekOffConfig {
  id: string;
  day_of_week: number;
  is_off: boolean;
  alternate_pattern: string | null;
}

interface LeaveRecord {
  id: string;
  from_date: string;
  to_date: string;
  status: string;
  is_half_day: boolean | null;
  half_day_period: string | null;
  leave_types?: { name: string } | { name: string }[] | null;
}

interface RegularizationRequest {
  id: string;
  date: string;
  status: string;
  requested_check_in_time: string | null;
  requested_check_out_time: string | null;
  reason: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export const isWeekOffDate = (date: Date, weekOffConfigs: WeekOffConfig[]): boolean => {
  const dayOfWeek = date.getDay();
  const dayConfig = weekOffConfigs.filter(c => c.day_of_week === dayOfWeek && c.is_off);
  for (const config of dayConfig) {
    const pattern = config.alternate_pattern || "all";
    if (pattern === "all") return true;
    const weekNumber = Math.ceil(date.getDate() / 7);
    if (pattern === "1st_3rd" && (weekNumber === 1 || weekNumber === 3)) return true;
    if (pattern === "2nd_4th" && (weekNumber === 2 || weekNumber === 4)) return true;
  }
  return false;
};

export function useAttendance(userId: string | undefined) {
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weekOffConfig, setWeekOffConfig] = useState<WeekOffConfig[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [regularizationRequests, setRegularizationRequests] = useState<RegularizationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [todayRes, monthRes, holidayRes, weekOffRes, leaveRes, regRes] = await Promise.all([
        supabase
          .from("attendance")
          .select("*")
          .eq("user_id", userId)
          .eq("date", today)
          .maybeSingle(),
        supabase
          .from("attendance")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false }),
        supabase.from("holidays").select("id, date, holiday_name"),
        supabase.from("week_off_config").select("*"),
        supabase
          .from("leave_applications")
          .select("*, leave_types!leave_applications_leave_type_id_fkey(name)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("regularization_requests")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

      setTodayRecord(todayRes.data);
      setMonthRecords(monthRes.data || []);
      setHolidays(holidayRes.data || []);
      setWeekOffConfig(weekOffRes.data || []);
      // Normalize leave_types from array to single object
      const normalizedLeaves = (leaveRes.data || []).map((l: any) => ({
        ...l,
        leave_types: Array.isArray(l.leave_types) ? (l.leave_types.length > 0 ? l.leave_types[0] : null) : l.leave_types,
      }));
      setLeaveRecords(normalizedLeaves);
      setRegularizationRequests(regRes.data || []);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const checkIn = async () => {
    if (!userId) return;
    let location: any = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      location = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch {}

    const now = new Date().toISOString();

    if (todayRecord) {
      const { error } = await supabase
        .from("attendance")
        .update({
          check_in_time: now,
          check_in_location: location,
          status: "present",
        })
        .eq("id", todayRecord.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("attendance").insert({
        user_id: userId,
        date: today,
        check_in_time: now,
        check_in_location: location,
        status: "present",
      });
      if (error) throw error;
    }

    await fetchData();
  };

  const checkOut = async () => {
    if (!userId || !todayRecord) return;
    let location: any = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      location = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch {}

    const now = new Date().toISOString();
    const checkInTime = new Date(todayRecord.check_in_time!);
    const totalHours = (new Date(now).getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

    const { error } = await supabase
      .from("attendance")
      .update({
        check_out_time: now,
        check_out_location: location,
        total_hours: Math.round(totalHours * 100) / 100,
      })
      .eq("id", todayRecord.id);
    if (error) throw error;

    await fetchData();
  };

  // Build attendance map using week-off config
  const attendanceMap: Record<string, string> = {};
  const holidayDates = new Set(holidays.map((h) => h.date));

  monthRecords.forEach((r) => {
    if ((r.status === "present" || r.status === "regularized") && r.check_in_time) {
      attendanceMap[r.date] = "present";
    } else if (r.status === "leave") {
      attendanceMap[r.date] = "leave";
    } else if (r.status === "half-day") {
      attendanceMap[r.date] = "half-day";
    } else {
      attendanceMap[r.date] = "absent";
    }
  });

  holidays.forEach((h) => {
    if (!attendanceMap[h.date]) {
      attendanceMap[h.date] = "holiday";
    }
  });

  // Market hours calculation
  const marketHours = useMemo(() => {
    if (!todayRecord?.check_in_time) return null;
    const checkInTime = new Date(todayRecord.check_in_time);
    const checkOutTime = todayRecord.check_out_time ? new Date(todayRecord.check_out_time) : new Date();
    const activeHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
    return {
      firstCheckIn: format(checkInTime, "h:mm a"),
      lastActivity: todayRecord.check_out_time ? format(checkOutTime, "h:mm a") : "Active",
      activeHours: Math.round(activeHours * 10) / 10,
    };
  }, [todayRecord]);

  const isCheckedIn = !!todayRecord?.check_in_time && !todayRecord?.check_out_time;
  const isCheckedOut = !!todayRecord?.check_out_time;

  return {
    todayRecord,
    monthRecords,
    attendanceMap,
    holidays,
    holidayDates,
    weekOffConfig,
    leaveRecords,
    regularizationRequests,
    marketHours,
    loading,
    isCheckedIn,
    isCheckedOut,
    checkIn,
    checkOut,
    refetch: fetchData,
  };
}
