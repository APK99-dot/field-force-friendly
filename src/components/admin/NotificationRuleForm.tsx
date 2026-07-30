import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Users } from "lucide-react";
import { toast } from "sonner";

// Source tables offered to rule authors. Every value below is a real table in
// this database — verified against supabase/migrations CREATE TABLE statements
// and src/integrations/supabase/types.ts.
export const SOURCE_TABLES: { value: string; label: string }[] = [
  { value: "attendance", label: "Attendance" },
  { value: "activity_events", label: "Site Activities" },
  { value: "visits", label: "Visits" },
  { value: "leave_applications", label: "Leave Applications" },
  { value: "regularization_requests", label: "Attendance Regularizations" },
  { value: "additional_expenses", label: "Expenses" },
  { value: "leads", label: "Leads" },
  { value: "customers", label: "Customers" },
  { value: "customer_opportunities", label: "Opportunities" },
  { value: "events", label: "Events" },
  { value: "pm_projects", label: "Projects" },
  { value: "pm_tasks", label: "Project Tasks" },
  { value: "project_sites", label: "Sites" },
  { value: "site_milestones", label: "Site Milestones" },
  { value: "procurement_orders", label: "Purchase Orders" },
  { value: "procurement_grns", label: "Goods Receipt Notes" },
  { value: "procurement_invoices", label: "Vendor Invoices" },
  { value: "vendors", label: "Vendors" },
  { value: "employees", label: "Employees" },
];

export const RECEIVER_TYPES: { value: string; label: string }[] = [
  { value: "employee", label: "The person themselves" },
  { value: "manager", label: "Their manager" },
  { value: "hierarchy", label: "Whole reporting chain" },
  { value: "role", label: "A role" },
  { value: "specific_user", label: "A specific person" },
  { value: "admin", label: "All admins" },
];

// Values of the app_role enum — see the app_role migrations.
export const APP_ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
  { value: "data_viewer", label: "Data Viewer" },
  { value: "sales_manager", label: "Sales Manager" },
];

export const CHANNELS: { value: string; label: string }[] = [
  { value: "in_app", label: "In-app" },
  { value: "push", label: "Push" },
];

const PLACEHOLDERS = ["{user_name}", "{module_name}", "{record_name}", "{site_name}", "{date}"];

interface RuleForm {
  name: string;
  event_code: string;
  source_table: string;
  receiver_type: string;
  receiver_role: string;
  receiver_user_id: string;
  notification_channel: string;
  title_template: string;
  message_template: string;
  timezone: string;
  is_active: boolean;
}

const emptyForm: RuleForm = {
  name: "",
  event_code: "",
  source_table: "",
  receiver_type: "employee",
  receiver_role: "",
  receiver_user_id: "",
  notification_channel: "in_app",
  title_template: "{user_name} - {module_name}",
  message_template: "{user_name} performed an action on {module_name}",
  timezone: "Asia/Kolkata",
  is_active: true,
};

interface PickUser {
  id: string;
  name: string;
  role: string;
}

interface NotificationRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: any | null;
  onSaved: () => void;
}

export default function NotificationRuleForm({ open, onOpenChange, rule, onSaved }: NotificationRuleFormProps) {
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PickUser[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const { data: eventTypes = [] } = useQuery({
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

  const { data: pickUsers = [] } = useQuery({
    queryKey: ["notif-pick-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notif_pick_users" as any);
      if (error) throw error;
      return (data || []) as unknown as PickUser[];
    },
  });

  // Reset the form each time the dialog opens so a previous edit never leaks in.
  useEffect(() => {
    if (!open) return;
    setPreview(null);
    if (rule) {
      setForm({
        name: rule.name ?? "",
        event_code: rule.event_code ?? "",
        source_table: rule.source_table ?? "",
        receiver_type: rule.receiver_type ?? "employee",
        receiver_role: rule.receiver_role ?? "",
        receiver_user_id: rule.receiver_user_id ?? "",
        notification_channel: rule.notification_channel ?? "in_app",
        title_template: rule.title_template ?? emptyForm.title_template,
        message_template: rule.message_template ?? emptyForm.message_template,
        timezone: rule.timezone ?? "Asia/Kolkata",
        is_active: rule.is_active ?? true,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, rule]);

  const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSave =
    !!form.name.trim() &&
    !!form.event_code &&
    !!form.source_table &&
    !!form.title_template.trim() &&
    !!form.message_template.trim() &&
    (form.receiver_type !== "role" || !!form.receiver_role) &&
    (form.receiver_type !== "specific_user" || !!form.receiver_user_id);

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc("notif_preview_recipients" as any, {
        p_receiver_type: form.receiver_type,
        p_receiver_role: form.receiver_type === "role" ? form.receiver_role || null : null,
        p_receiver_user_id: form.receiver_type === "specific_user" ? form.receiver_user_id || null : null,
        p_sample_actor: user?.id ?? null,
      });
      if (error) throw error;
      setPreview(((data || []) as unknown) as PickUser[]);
    } catch (e: any) {
      setPreview(null);
      toast.error(e.message || "Could not preview recipients");
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        event_code: form.event_code,
        source_table: form.source_table,
        receiver_type: form.receiver_type,
        receiver_role: form.receiver_type === "role" ? form.receiver_role : null,
        receiver_user_id: form.receiver_type === "specific_user" ? form.receiver_user_id : null,
        notification_channel: form.notification_channel,
        title_template: form.title_template,
        message_template: form.message_template,
        timezone: form.timezone.trim() || "Asia/Kolkata",
        is_active: form.is_active,
      };

      if (rule) {
        const { error } = await supabase
          .from("notification_rules" as any)
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("notification_rules" as any)
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }

      toast.success(rule ? "Rule updated" : "Rule created");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Could not save rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit Notification Rule" : "New Notification Rule"}</DialogTitle>
          <DialogDescription>
            Decide which event, on which module, notifies whom.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Rule Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Notify manager on expense submission"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Event</Label>
              <Select value={form.event_code} onValueChange={(v) => set("event_code", v)}>
                <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                <SelectContent>
                  {eventTypes.map((t) => (
                    <SelectItem key={t.event_code} value={t.event_code}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Module</Label>
              <Select value={form.source_table} onValueChange={(v) => set("source_table", v)}>
                <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TABLES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Who gets notified</Label>
              <Select
                value={form.receiver_type}
                onValueChange={(v) => {
                  setForm((prev) => ({
                    ...prev,
                    receiver_type: v,
                    receiver_role: v === "role" ? prev.receiver_role : "",
                    receiver_user_id: v === "specific_user" ? prev.receiver_user_id : "",
                  }));
                  setPreview(null);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECEIVER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.receiver_type === "role" && (
              <div>
                <Label>Role</Label>
                <Select value={form.receiver_role} onValueChange={(v) => { set("receiver_role", v); setPreview(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {APP_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.receiver_type === "specific_user" && (
              <div>
                <Label>Person</Label>
                <Select value={form.receiver_user_id} onValueChange={(v) => { set("receiver_user_id", v); setPreview(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent>
                    {pickUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Button type="button" variant="outline" size="sm" onClick={runPreview} disabled={previewing}>
              <Users className="h-4 w-4 mr-1" />
              {previewing ? "Checking…" : "Preview recipients"}
            </Button>
            {preview !== null && (
              <div className="mt-2 rounded-md border border-border/60 p-3">
                {preview.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No one matches this selection right now.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {preview.map((u) => (
                      <Badge key={u.id} variant="secondary">{u.name}</Badge>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-2">
                  Previewed using you as the sample actor.
                </p>
              </div>
            )}
          </div>

          <div>
            <Label>Channel</Label>
            <Select value={form.notification_channel} onValueChange={(v) => set("notification_channel", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Title Template</Label>
            <Textarea
              rows={2}
              value={form.title_template}
              onChange={(e) => set("title_template", e.target.value)}
            />
          </div>

          <div>
            <Label>Message Template</Label>
            <Textarea
              rows={3}
              value={form.message_template}
              onChange={(e) => set("message_template", e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Placeholders you can use: {PLACEHOLDERS.join(", ")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Timezone</Label>
              <Input
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                placeholder="Asia/Kolkata"
              />
            </div>
            <div className="flex items-center justify-between md:mt-6">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
