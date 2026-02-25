import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";

type FilterType = "this_week" | "last_week" | "this_month" | "last_month";

function getDateRange(filter: FilterType): { from: string; to: string } {
  const now = new Date();
  let start: Date, end: Date;
  switch (filter) {
    case "this_week":
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfWeek(now, { weekStartsOn: 1 });
      break;
    case "last_week":
      start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      end = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      break;
    case "this_month":
      start = startOfMonth(now);
      end = endOfMonth(now);
      break;
    case "last_month":
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(subMonths(now, 1));
      break;
  }
  return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
}

export function useExpenses(userId: string | undefined, filter: FilterType) {
  const queryClient = useQueryClient();
  const { from, to } = getDateRange(filter);

  const expensesQuery = useQuery({
    queryKey: ["additional-expenses", userId, from, to],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("additional_expenses")
        .select("*")
        .eq("user_id", userId)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const beatAllowancesQuery = useQuery({
    queryKey: ["beat-allowances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("beat_allowances").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const expenseConfigQuery = useQuery({
    queryKey: ["expense-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_master_config").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Calculate TA from beat plans in the period
  const taBeatQuery = useQuery({
    queryKey: ["ta-beat-plans", userId, from, to],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("beat_plans")
        .select("*")
        .eq("user_id", userId)
        .gte("plan_date", from)
        .lte("plan_date", to);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const createExpense = useMutation({
    mutationFn: async (input: {
      category: string;
      custom_category?: string;
      amount: number;
      description?: string;
      expense_date: string;
      bill_url?: string;
    }) => {
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("additional_expenses")
        .insert({ ...input, user_id: userId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["additional-expenses"] });
    },
  });

  // Compute totals
  const expenses = expensesQuery.data || [];
  const beatAllowances = beatAllowancesQuery.data || [];
  const beatPlans = taBeatQuery.data || [];
  const config = expenseConfigQuery.data;

  // Calculate TA
  let totalTA = 0;
  if (config?.ta_type === "fixed") {
    // Fixed TA per working day with beat
    totalTA = beatPlans.length * (config.fixed_ta_amount || 0);
  } else {
    // From beat allowances
    beatPlans.forEach((bp) => {
      const allowance = beatAllowances.find((ba) => ba.beat_id === bp.beat_id);
      if (allowance) totalTA += allowance.ta_amount || 0;
    });
  }

  // Calculate DA
  let totalDA = 0;
  if (config?.da_type === "fixed") {
    totalDA = beatPlans.length * (config.fixed_da_amount || 0);
  } else {
    beatPlans.forEach((bp) => {
      const allowance = beatAllowances.find((ba) => ba.beat_id === bp.beat_id);
      if (allowance) totalDA += allowance.da_amount || 0;
    });
  }

  const totalAdditional = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return {
    expenses,
    totalTA,
    totalDA,
    totalAdditional,
    beatPlans,
    config,
    isLoading: expensesQuery.isLoading,
    createExpense,
    dateRange: { from, to },
  };
}
