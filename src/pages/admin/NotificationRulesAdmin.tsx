import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bell, History, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import NotificationRuleForm, {
  CHANNELS,
  RECEIVER_TYPES,
  SOURCE_TABLES,
} from "@/components/admin/NotificationRuleForm";

const HISTORY_PAGE_SIZE = 25;
const HISTORY_MAX = 100;

const labelFor = (list: { value: string; label: string }[], value: string) =>
  list.find((i) => i.value === value)?.label ?? value;

export default function NotificationRulesAdmin() {
  const qc = useQueryClient();
  const { hasAdminAccess, isLoading: accessLoading } = useAdminAccess();

  const [activeTab, setActiveTab] = useState("rules");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);

  const {
    data: rules = [],
    error: rulesError,
    isLoading: rulesLoading,
  } = useQuery({
    queryKey: ["notification-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_rules" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const {
    data: eventTypes = [],
    error: eventTypesError,
  } = useQuery({
    queryKey: ["notification-event-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_event_types" as any)
        .select("event_code, label")
        .eq("is_active", true)
        .order("label");
      if (error) throw error;
      return data as any[];
    },
  });

  const {
    data: history = [],
    error: historyError,
    isLoading: historyLoading,
  } = useQuery({
    queryKey: ["notification-event-log", historyLimit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_event_log" as any)
        .select("id, created_at, event_code, source_table, recipients_count, processed")
        .order("created_at", { ascending: false })
        .limit(historyLimit);
      if (error) throw error;
      return data as any[];
    },
  });

  // Surface every load failure. An empty table must never stand in for an error.
  useEffect(() => {
    if (rulesError) toast.error((rulesError as any).message || "Could not load notification rules");
  }, [rulesError]);
  useEffect(() => {
    if (eventTypesError) toast.error((eventTypesError as any).message || "Could not load event types");
  }, [eventTypesError]);
  useEffect(() => {
    if (historyError) toast.error((historyError as any).message || "Could not load notification history");
  }, [historyError]);

  const eventLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of eventTypes) map[t.event_code] = t.label;
    return map;
  }, [eventTypes]);

  const receiverLabel = (rule: any) => {
    const base = labelFor(RECEIVER_TYPES, rule.receiver_type);
    if (rule.receiver_type === "role" && rule.receiver_role) return `${base}: ${rule.receiver_role}`;
    return base;
  };

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (rule: any) => { setEditing(rule); setFormOpen(true); };

  const refreshRules = () => qc.invalidateQueries({ queryKey: ["notification-rules"] });

  const toggleActive = async (rule: any, isActive: boolean) => {
    const { error } = await supabase
      .from("notification_rules" as any)
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", rule.id);
    if (error) {
      toast.error(error.message || "Could not update rule");
      return;
    }
    toast.success(isActive ? "Rule activated" : "Rule deactivated");
    refreshRules();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("notification_rules" as any)
      .delete()
      .eq("id", deleteTarget.id);
    setDeleteTarget(null);
    if (error) {
      toast.error(error.message || "Could not delete rule");
      return;
    }
    toast.success("Rule deleted");
    refreshRules();
  };

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Card className="border-border/60">
          <CardContent className="p-6 text-center space-y-1">
            <h1 className="font-semibold">Notification Centre</h1>
            <p className="text-sm text-muted-foreground">
              You do not have permission to manage notification rules.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div className="space-y-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Hero Header */}
      <div className="gradient-hero px-4 safe-top-20 pb-6 -mx-4 -mt-4 md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Notification Centre</h1>
              <p className="text-sm text-white/70">Configure who gets notified, and review what was sent</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 md:px-4 space-y-4 md:space-y-5 pt-4 md:pt-5">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-0">
            <TabsTrigger
              value="rules"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1 px-2 md:px-4 py-2.5 text-xs md:text-sm gap-1 md:gap-1.5 text-muted-foreground data-[state=active]:text-foreground"
            >
              <ListChecks className="h-3.5 w-3.5 hidden md:inline-block" />
              Rules
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none flex-1 px-2 md:px-4 py-2.5 text-xs md:text-sm gap-1 md:gap-1.5 text-muted-foreground data-[state=active]:text-foreground"
            >
              <History className="h-3.5 w-3.5 hidden md:inline-block" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {rules.length} rule{rules.length === 1 ? "" : "s"} configured
              </p>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
            </div>

            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rulesError && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-destructive py-8">
                        Could not load rules: {(rulesError as any).message}
                      </TableCell>
                    </TableRow>
                  )}
                  {!rulesError && rulesLoading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!rulesError && !rulesLoading && rules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        No rules yet. Add one to start sending notifications.
                      </TableCell>
                    </TableRow>
                  )}
                  {!rulesError && rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{eventLabels[r.event_code] ?? r.event_code}</TableCell>
                      <TableCell>{labelFor(SOURCE_TABLES, r.source_table)}</TableCell>
                      <TableCell>{receiverLabel(r)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{labelFor(CHANNELS, r.notification_channel)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={!!r.is_active}
                          onCheckedChange={(v) => toggleActive(r, v)}
                        />
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="history" className="mt-5 space-y-4">
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Processed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyError && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-destructive py-8">
                        Could not load history: {(historyError as any).message}
                      </TableCell>
                    </TableRow>
                  )}
                  {!historyError && historyLoading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!historyError && !historyLoading && history.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                        Nothing sent yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {!historyError && history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(h.created_at), "dd MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell>{eventLabels[h.event_code] ?? h.event_code}</TableCell>
                      <TableCell>{labelFor(SOURCE_TABLES, h.source_table)}</TableCell>
                      <TableCell>{h.recipients_count}</TableCell>
                      <TableCell>
                        <Badge variant={h.processed ? "secondary" : "outline"}>
                          {h.processed ? "Yes" : "Pending"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>

            {!historyError && history.length >= historyLimit && historyLimit < HISTORY_MAX && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setHistoryLimit((n) => Math.min(n + HISTORY_PAGE_SIZE, HISTORY_MAX))}
                >
                  Load more
                </Button>
              </div>
            )}
            {!historyError && historyLimit >= HISTORY_MAX && history.length >= HISTORY_MAX && (
              <p className="text-center text-xs text-muted-foreground">
                Showing the most recent {HISTORY_MAX} events.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <NotificationRuleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
        onSaved={refreshRules}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will stop notifying anyone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
