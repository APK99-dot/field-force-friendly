import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, subDays, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, History, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { SOURCE_TABLES } from "@/components/admin/NotificationRuleForm";

const PAGE_SIZE = 100;
const FETCH_LIMIT = 2000;

// The source imported these from src/components/notifications/*, which does not
// exist in this app. They are small and single-use, so they live here instead of
// creating a new shared folder for two helpers.
type RangePreset = "all" | "day" | "week" | "month" | "custom";
interface CustomRange {
  from: string;
  to: string;
}

const getRangeStart = (preset: RangePreset): Date | null => {
  const now = new Date();
  switch (preset) {
    case "day":
      return startOfDay(now);
    case "week":
      return subDays(now, 7);
    case "month":
      return subMonths(now, 1);
    default:
      return null;
  }
};

const isWithinRange = (dateStr: string, preset: RangePreset, custom: CustomRange): boolean => {
  if (preset === "all") return true;
  const d = new Date(dateStr);
  if (preset === "custom") {
    if (custom.from && d < new Date(`${custom.from}T00:00:00`)) return false;
    if (custom.to && d > new Date(`${custom.to}T23:59:59`)) return false;
    return true;
  }
  const start = getRangeStart(preset);
  return !start || d >= start;
};

const DATE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "all", label: "All" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "custom", label: "Custom" },
];

const moduleLabel = (table: string) => SOURCE_TABLES.find((t) => t.value === table)?.label ?? table;

interface EventLogRow {
  id: string;
  event_code: string;
  source_table: string;
  record_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, any> | null;
  processed: boolean;
  recipients_count: number;
  created_at: string;
}

type EventLogRowWithActor = EventLogRow & { actor: string };

export const NotificationHistoryTab: React.FC = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "processed" | "pending">("all");
  const [preset, setPreset] = useState<RangePreset>("all");
  const [custom, setCustom] = useState<CustomRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-notification-history"],
    queryFn: async (): Promise<EventLogRowWithActor[]> => {
      const { data: rows, error: logError } = await supabase
        .from("notification_event_log" as any)
        .select(
          "id, event_code, source_table, record_id, actor_user_id, metadata, processed, recipients_count, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);
      if (logError) throw logError;

      const events = ((rows || []) as unknown) as EventLogRow[];
      const actorIds = Array.from(
        new Set(events.map((e) => e.actor_user_id).filter(Boolean)),
      ) as string[];

      let nameById = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        // A profile lookup failure must not be swallowed into "Unknown user" rows.
        if (profileError) throw profileError;
        nameById = new Map(((profiles || []) as any[]).map((p) => [p.id as string, (p.full_name as string) || ""]));
      }

      return events.map((e) => ({
        ...e,
        actor: (e.actor_user_id && (nameById.get(e.actor_user_id) || "Unknown user")) || "—",
      }));
    },
  });

  // Surface every load failure. An empty table must never stand in for an error.
  useEffect(() => {
    if (error) toast.error((error as any).message || "Could not load notification history");
  }, [error]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data || []).filter((e) => {
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "processed" ? e.processed : !e.processed);
      const matchesQuery =
        !q ||
        e.event_code?.toLowerCase().includes(q) ||
        e.source_table?.toLowerCase().includes(q) ||
        moduleLabel(e.source_table).toLowerCase().includes(q) ||
        e.actor?.toLowerCase().includes(q) ||
        (e.record_id || "").toLowerCase().includes(q);
      return matchesStatus && matchesQuery && isWithinRange(e.created_at, preset, custom);
    });
  }, [data, search, statusFilter, preset, custom]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, preset, custom.from, custom.to]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const total = (data || []).length;
  const deliveredCount = (data || []).reduce((sum, e) => sum + (e.recipients_count || 0), 0);

  const rangeStart = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, rows.length);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2 text-base">
          <History size={16} /> Notification History
          <span className="text-xs font-normal text-muted-foreground">
            {total} event{total === 1 ? "" : "s"} · {deliveredCount} notification
            {deliveredCount === 1 ? "" : "s"} delivered
          </span>
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event, module or person"
              className="pl-8 w-64"
            />
          </div>
          {(["all", "processed", "pending"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {DATE_PRESETS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={preset === p.key ? "default" : "outline"}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                className="h-9 w-[140px]"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                className="h-9 w-[140px]"
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto">
        {error ? (
          <div className="py-8 text-center text-sm text-destructive">
            <p className="font-medium">Could not load notification history</p>
            <p className="text-xs mt-1">{(error as any).message}</p>
            <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={() => refetch()}>
              <RefreshCw size={14} /> Try again
            </Button>
          </div>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No notification events found</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Triggered by</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Occurred at</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    <Badge variant="outline" className="text-xs">
                      {e.event_code}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{moduleLabel(e.source_table)}</TableCell>
                  <TableCell className="text-sm">{e.actor}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground text-xs">
                    {e.metadata?.record_name || e.record_id || "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(e.created_at), "dd MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.recipients_count > 0 ? "default" : "outline"}>{e.recipients_count}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.processed ? "secondary" : "outline"}>
                      {e.processed ? "Processed" : "Pending"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {!error && rows.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Showing {rangeStart}–{rangeEnd} of {rows.length}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {!error && total >= FETCH_LIMIT && (
          <p className="text-center text-xs text-muted-foreground pt-2">
            Showing the most recent {FETCH_LIMIT} events.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default NotificationHistoryTab;
