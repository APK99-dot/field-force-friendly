import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export function useDashboard(userId: string | undefined) {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentYear = new Date().getFullYear();

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

  const pendingLeavesQuery = useQuery({
    queryKey: ["dashboard-pending-leaves", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("leave_applications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!userId,
  });

  const leaveBalanceQuery = useQuery({
    queryKey: ["dashboard-leave-balance", userId, currentYear],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("leave_balance")
        .select("*, leave_types(name)")
        .eq("user_id", userId)
        .eq("year", currentYear);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const activeProjectsQuery = useQuery({
    queryKey: ["dashboard-active-projects", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("pm_projects")
        .select("*", { count: "exact", head: true })
        .in("status", ["active", "planning"]);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!userId,
  });

  const myTasksQuery = useQuery({
    queryKey: ["dashboard-my-tasks", userId],
    queryFn: async () => {
      if (!userId) return { total: 0, completed: 0, inProgress: 0 };
      const { data, error } = await supabase
        .from("pm_tasks")
        .select("status")
        .eq("assignee_id", userId);
      if (error) throw error;
      const tasks = data || [];
      return {
        total: tasks.length,
        completed: tasks.filter((t) => t.status === "done").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
      };
    },
    enabled: !!userId,
  });

  const pendingExpensesQuery = useQuery({
    queryKey: ["dashboard-pending-expenses", userId],
    queryFn: async () => {
      if (!userId) return { count: 0, total: 0 };
      const { data, error } = await supabase
        .from("additional_expenses")
        .select("amount, status")
        .eq("user_id", userId)
        .eq("status", "pending");
      if (error) throw error;
      const expenses = data || [];
      return {
        count: expenses.length,
        total: expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
      };
    },
    enabled: !!userId,
  });

  const todayActivitiesQuery = useQuery({
    queryKey: ["dashboard-today-activities", userId, today],
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("activity_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("activity_date", today);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!userId,
  });

  const attendance = attendanceQuery.data;
  const isCheckedIn = !!attendance?.check_in_time && !attendance?.check_out_time;
  const isCheckedOut = !!attendance?.check_out_time;
  const dayStarted = !!attendance?.check_in_time;

  return {
    attendance,
    isLoading: attendanceQuery.isLoading,
    dayStarted,
    isCheckedIn,
    isCheckedOut,
    pendingLeaves: pendingLeavesQuery.data || 0,
    leaveBalances: leaveBalanceQuery.data || [],
    activeProjects: activeProjectsQuery.data || 0,
    myTasks: myTasksQuery.data || { total: 0, completed: 0, inProgress: 0 },
    pendingExpenses: pendingExpensesQuery.data || { count: 0, total: 0 },
  };
}
