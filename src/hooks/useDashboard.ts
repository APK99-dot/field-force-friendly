import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export function useDashboard(userId: string | undefined) {
  const today = format(new Date(), "yyyy-MM-dd");

  const attendanceQuery = useQuery({
    queryKey: ["dashboard-attendance", userId, today],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const beatPlansQuery = useQuery({
    queryKey: ["dashboard-beat-plans", userId, today],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("beat_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("plan_date", today);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const visitsQuery = useQuery({
    queryKey: ["dashboard-visits", userId, today],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("visits")
        .select("*")
        .eq("user_id", userId)
        .eq("planned_date", today);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const ordersQuery = useQuery({
    queryKey: ["dashboard-orders", userId, today],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", `${today}T00:00:00.000Z`)
        .lte("created_at", `${today}T23:59:59.999Z`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const visits = visitsQuery.data || [];
  const orders = ordersQuery.data || [];
  const beatPlans = beatPlansQuery.data || [];
  const attendance = attendanceQuery.data;

  const planned = visits.filter((v) => v.status === "planned").length;
  const productive = visits.filter((v) => v.status === "completed" || v.status === "productive").length;
  const remaining = visits.filter((v) => v.status === "planned" || v.status === "in_progress").length;
  const revenueAchieved = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  const beatName = beatPlans.map((bp) => bp.beat_name).filter(Boolean).join(", ") || null;

  const isCheckedIn = !!attendance?.check_in_time && !attendance?.check_out_time;
  const isCheckedOut = !!attendance?.check_out_time;
  const dayStarted = !!attendance?.check_in_time;

  return {
    attendance,
    beatPlans,
    beatName,
    visits,
    orders,
    isLoading: attendanceQuery.isLoading,
    dayStarted,
    isCheckedIn,
    isCheckedOut,
    stats: {
      planned,
      productive,
      remaining,
      newRetailers: 0,
      revenueAchieved,
      points: 0,
    },
  };
}
