import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { DateField } from "@/components/reports/ReportFilters";
import { useReportScope } from "@/components/reports/useReportScope";
import { SummaryByUserChart, UserDatum } from "./SummaryByUserChart";
import {
  Activity,
  CalendarCheck,
  Building2,
  Users,
  ShoppingCart,
  Clock,
  Receipt,
} from "lucide-react";

const fmtCompact = (n: number) =>
  n >= 1000 ? `₹${(n / 1000).toFixed(0)}K` : `₹${n.toLocaleString("en-IN")}`;

export function OverviewTab() {
  const scope = useReportScope();
  const [from, setFrom] = useState(format(new Date(), "yyyy-MM-01"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const scopeIds = scope.userIds;
  const isAdmin = scope.isAdmin;
  const ready = !scope.loading;

  const { data, isFetching } = useQuery({
    queryKey: ["analytics-overview", from, to, isAdmin, scopeIds],
    enabled: ready,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inScope = (q: any): any => {
        if (isAdmin) return q;
        const ids = scopeIds && scopeIds.length ? scopeIds : ["00000000-0000-0000-0000-000000000000"];
        return q.in("user_id", ids);
      };




      // Activities (count + per user)
      let actQ = supabase
        .from("activity_events")
        .select("user_id")
        .gte("activity_date", from)
        .lte("activity_date", to);
      actQ = inScope(actQ);
      const { data: acts } = await actQ;

      // Attendance present days
      let attQ = supabase
        .from("attendance")
        .select("user_id")
        .in("status", ["present", "regularized"])
        .gte("date", from)
        .lte("date", to);
      attQ = inScope(attQ);
      const { data: att } = await attQ;

      // Active sites
      const { count: siteCount } = await supabase
        .from("project_sites")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      // Procurement value
      const { data: pos } = await supabase
        .from("procurement_orders")
        .select("total_amount")
        .gte("order_date", from)
        .lte("order_date", to);

      // Pending approvals
      const { count: pendingLeaves } = await supabase
        .from("leave_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      const { count: pendingExp } = await supabase
        .from("additional_expenses")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      // Expenses total
      let expQ = supabase
        .from("additional_expenses")
        .select("amount")
        .gte("expense_date", from)
        .lte("expense_date", to);
      expQ = inScope(expQ);
      const { data: exps } = await expQ;

      // per-user activity counts
      const counts = new Map<string, number>();
      (acts || []).forEach((a) => {
        if (a.user_id) counts.set(a.user_id, (counts.get(a.user_id) || 0) + 1);
      });

      return {
        totalActivities: acts?.length || 0,
        presentDays: att?.length || 0,
        activeSites: siteCount || 0,
        poValue: (pos || []).reduce((s, p) => s + (Number(p.total_amount) || 0), 0),
        pendingApprovals: (pendingLeaves || 0) + (pendingExp || 0),
        totalExpenses: (exps || []).reduce((s, e) => s + (Number(e.amount) || 0), 0),
        perUser: counts,
      };
    },
  });

  const userData: UserDatum[] = useMemo(() => {
    if (!data) return [];
    return scope.users.map((u) => ({
      id: u.id,
      name: u.full_name,
      value: data.perUser.get(u.id) || 0,
    }));
  }, [data, scope.users]);

  const range = `${format(new Date(from), "dd MMM")} - ${format(new Date(to), "dd MMM, yyyy")}`;

  const kpis = [
    { label: "Total Active Sites", value: String(data?.activeSites ?? 0), icon: Building2 },
    { label: "Total Employees", value: String(scope.users.length), icon: Users },
    { label: "Total PO Value", value: fmtCompact(data?.poValue ?? 0), icon: ShoppingCart },
    { label: "Pending Approvals", value: String(data?.pendingApprovals ?? 0), icon: Clock },
    { label: "Total Expenses", value: fmtCompact(data?.totalExpenses ?? 0), icon: Receipt },
  ];

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <DateField label="From Date" value={from} onChange={setFrom} />
          <DateField label="To Date" value={to} onChange={setTo} />
        </CardContent>
      </Card>

      {/* Banner cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative overflow-hidden rounded-2xl p-5 gradient-hero text-primary-foreground shadow-hero border-2 border-gold">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80 flex items-center gap-2">
                <Activity className="h-4 w-4" /> Total Activities
              </p>
              <p className="text-4xl font-extrabold mt-1">
                {(data?.totalActivities ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="text-xs opacity-70 mt-2">{range}</p>
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl p-5 bg-primary text-primary-foreground shadow-hero">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80 flex items-center gap-2">
                <CalendarCheck className="h-4 w-4" /> Present Days
              </p>
              <p className="text-4xl font-extrabold mt-1">
                {(data?.presentDays ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="text-xs opacity-70 mt-2">{range}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <k.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                <p className="text-base font-bold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <SummaryByUserChart
        title="Activity Summary by User"
        description="View activity totals grouped by user"
        data={userData}
        valueLabel="Activities"
        formatValue={(v) => v.toLocaleString("en-IN")}
      />

      {isFetching && (
        <p className="text-center text-xs text-muted-foreground">Updating…</p>
      )}
    </div>
  );
}
