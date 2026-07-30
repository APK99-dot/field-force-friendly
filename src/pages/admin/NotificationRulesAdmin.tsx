import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Pencil, Trash2, Bell, Zap, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  NotificationRuleForm,
  CHANNELS,
  RECEIVER_OPTIONS,
  SOURCE_TABLES,
  type NotificationRuleRow,
} from "@/components/admin/NotificationRuleForm";
import { NotificationHistoryTab } from "@/components/admin/NotificationHistoryTab";

const labelFor = (list: { value: string; label: string }[], value: string) =>
  list.find((i) => i.value === value)?.label ?? value;

// Mirrors notif_fill(): the same five placeholders, everything else left as typed.
const renderTemplate = (tpl: string, ctx: Record<string, string>) =>
  (tpl || "").replace(/\{(\w+)\}/g, (_m, k) => (k in ctx ? ctx[k] : `{${k}}`));

const initcapModule = (table: string) =>
  (table || "")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

export default function NotificationRulesAdmin() {
  const queryClient = useQueryClient();
  const { hasAdminAccess, isLoading: accessLoading } = useAdminAccess();
  const { userId } = useCurrentUser();

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRuleRow | null>(null);
  const [rulesOpen, setRulesOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<NotificationRuleRow | null>(null);
  const [firing, setFiring] = useState<string | null>(null);

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
      return (data || []) as unknown as NotificationRuleRow[];
    },
  });

  const { data: eventTypes = [], error: eventTypesError } = useQuery({
    queryKey: ["notification-event-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_event_types" as any)
        .select("event_code, label")
        .eq("is_active", true)
        .order("event_code");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Surface every load failure. An empty table must never stand in for an error.
  useEffect(() => {
    if (rulesError) toast.error((rulesError as any).message || "Could not load notification rules");
  }, [rulesError]);
  useEffect(() => {
    if (eventTypesError) toast.error((eventTypesError as any).message || "Could not load event types");
  }, [eventTypesError]);

  const eventLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of eventTypes) map[t.event_code] = t.label;
    return map;
  }, [eventTypes]);

  const refreshRules = () => queryClient.invalidateQueries({ queryKey: ["notification-rules"] });

  const handleEdit = (rule: NotificationRuleRow) => {
    setEditingRule(rule);
    setShowForm(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingRule(null);
  };

  const toggleActive = async (rule: NotificationRuleRow, isActive: boolean) => {
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
    const { error } = await supabase.from("notification_rules" as any).delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    if (error) {
      toast.error(error.message || "Could not delete rule");
      return;
    }
    toast.success("Rule deleted");
    refreshRules();
  };

  // "Fire now" sends the rule's rendered templates to the signed-in admin via
  // notify_send_test(p_title, p_message). The source fanned its test out to the
  // rule's real receivers by inserting into notifications directly; that is not
  // reproducible here — notify_send_test only ever writes to auth.uid().
  const fireRule = async (rule: NotificationRuleRow) => {
    setFiring(rule.id);
    try {
      const ctx = {
        user_name: "Ramesh Iyer",
        module_name: initcapModule(rule.source_table),
        record_name: "[Manual Fire]",
        site_name: "Whitefield Tower A",
        date: new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date()),
      };
      const { data, error } = await supabase.rpc("notify_send_test" as any, {
        p_title: `[TEST] ${renderTemplate(rule.title_template, ctx)}`,
        p_message: renderTemplate(rule.message_template, ctx),
      });
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as any;
      if (result && result.ok === false) {
        toast.error(result.error || "Could not send the test notification");
        return;
      }
      toast.success("Test notification sent to you — check your bell.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to fire rule");
    } finally {
      setFiring(null);
    }
  };

  const receiverLabel = (rule: NotificationRuleRow) => {
    const base = labelFor(RECEIVER_OPTIONS, rule.receiver_type);
    if (rule.receiver_type === "role" && rule.receiver_role) return `${base}: ${rule.receiver_role}`;
    return base;
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

  const activeCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="min-h-screen p-4">
      <div className="w-full space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Notification Centre</h1>
            <p className="text-muted-foreground text-sm">
              Configure who gets notified, and review what was sent
            </p>
          </div>
        </div>

        <Tabs defaultValue="rules" className="w-full">
          <TabsList>
            <TabsTrigger value="rules">Notification Center</TabsTrigger>
            <TabsTrigger value="history">Notification History</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-6">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setEditingRule(null);
                  setShowForm(true);
                }}
                className="gap-2"
              >
                <Plus size={16} /> Add Rule
              </Button>
            </div>

            {showForm && (
              <NotificationRuleForm
                key={editingRule?.id || "new"}
                rule={editingRule}
                userId={userId || ""}
                onClose={handleClose}
                onSaved={() => {
                  refreshRules();
                  handleClose();
                }}
              />
            )}

            <Collapsible open={rulesOpen} onOpenChange={setRulesOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span className="flex items-center gap-2">
                        {rulesOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        <Bell size={18} /> Active Rules ({activeCount} / {rules.length})
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {rulesOpen ? "Click to collapse" : "Click to expand"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="overflow-x-auto">
                    {rulesError ? (
                      <div className="text-center py-12 text-destructive text-sm">
                        <p className="font-medium">Could not load notification rules</p>
                        <p className="text-xs mt-1">{(rulesError as any).message}</p>
                      </div>
                    ) : rulesLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                      </div>
                    ) : rules.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Bell className="mx-auto h-12 w-12 mb-3 opacity-30" />
                        <p>No notification rules configured yet</p>
                        <p className="text-xs mt-1">
                          Create your first rule to start sending automated notifications
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Module</TableHead>
                            <TableHead>Receiver</TableHead>
                            <TableHead>Channel</TableHead>
                            <TableHead>Active</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rules.map((rule) => (
                            <TableRow key={rule.id}>
                              <TableCell className="font-medium">{rule.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {eventLabels[rule.event_code] ?? rule.event_code}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {labelFor(SOURCE_TABLES, rule.source_table)}
                              </TableCell>
                              <TableCell className="text-sm">{receiverLabel(rule)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {labelFor(CHANNELS, rule.notification_channel)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Switch
                                  checked={!!rule.is_active}
                                  onCheckedChange={(checked) => toggleActive(rule, checked)}
                                />
                              </TableCell>
                              <TableCell className="text-right space-x-1 whitespace-nowrap">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Fire now — sends this rule's notification to you as a test"
                                  disabled={firing === rule.id}
                                  onClick={() => fireRule(rule)}
                                >
                                  <Zap size={14} className="text-amber-500" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
                                  <Pencil size={14} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(rule)}>
                                  <Trash2 size={14} className="text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </TabsContent>

          <TabsContent value="history">
            <NotificationHistoryTab />
          </TabsContent>
        </Tabs>
      </div>

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
    </div>
  );
}
