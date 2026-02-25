import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

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
  status: string;
  total_hours: number | null;
}

interface Holiday {
  id: string;
  date: string;
  holiday_name: string;
}

export function useAttendance(userId: string | undefined) {
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [todayRes, monthRes, holidayRes] = await Promise.all([
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
      ]);

      setTodayRecord(todayRes.data);
      setMonthRecords(monthRes.data || []);
      setHolidays(holidayRes.data || []);
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
      // Update existing record
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
      // Insert new record
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

  // Build a map of date -> status for the calendar
  const attendanceMap: Record<string, string> = {};
  const holidayDates = new Set(holidays.map((h) => h.date));

  monthRecords.forEach((r) => {
    if (r.status === "present" && r.check_in_time) {
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

  const isCheckedIn = !!todayRecord?.check_in_time && !todayRecord?.check_out_time;
  const isCheckedOut = !!todayRecord?.check_out_time;

  return {
    todayRecord,
    monthRecords,
    attendanceMap,
    holidays,
    loading,
    isCheckedIn,
    isCheckedOut,
    checkIn,
    checkOut,
    refetch: fetchData,
  };
}
