import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Target, Activity as ActivityIcon, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { milestoneStatusLabel } from "@/components/admin/SiteMilestonesDialog";
import { updateMilestoneProgress } from "@/utils/milestoneProgress";
import type { HubMilestone } from "@/hooks/useSiteHub";
import type { Activity } from "@/hooks/useActivities";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  not_started: "secondary",
  in_progress: "default",
  completed: "default",
  delayed: "destructive",
  on_hold: "outline",
};

function fmt(d?: string | null) {
  return d ? format(new Date(d), "dd MMM yy") : "—";
}

interface Props {
  milestones: HubMilestone[];
  activities?: Activity[];
  siteId?: string | null;
  onChanged?: () => void;
}

interface MilestoneRowProps {
  m: HubMilestone;
  linked: number;
  onChanged?: () => void;
}

function MilestoneCard({ m, linked, onChanged }: MilestoneRowProps) {
  const [draft, setDraft] = useState<number>(m.percent_complete ?? 0);
  const [saving, setSaving] = useState(false);

  const commit = async (val: number) => {
    if (val === (m.percent_complete ?? 0)) return;
    setSaving(true);
    try {
      await updateMilestoneProgress(m.id, val, m.status);
      toast.success("Progress updated");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not update progress");
      setDraft(m.percent_complete ?? 0);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Target className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-sm truncate">{m.name}</span>
        </div>
        <Badge variant={STATUS_VARIANT[m.status] || "secondary"} className="shrink-0">
          {milestoneStatusLabel(m.status)}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Progress</span>
          <span>{draft}%</span>
        </div>
        <Progress value={draft} className="h-1.5" />
      </div>

      <div className="flex items-center gap-3 pt-0.5">
        <Slider
          value={[draft]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => setDraft(v[0])}
          onValueCommit={(v) => commit(v[0])}
          disabled={saving}
          className="flex-1"
        />
        <span className="text-xs font-semibold w-10 text-right tabular-nums">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : `${draft}%`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <div>
          <span className="text-muted-foreground">Planned: </span>
          {fmt(m.start_date)} – {fmt(m.end_date)}
        </div>
        <div>
          <span className="text-muted-foreground">Actual: </span>
          {fmt(m.actual_start_date)} – {fmt(m.actual_end_date)}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <ActivityIcon className="h-3 w-3" />
          {linked} linked {linked === 1 ? "activity" : "activities"}
        </div>
      </div>

      {m.notes && <p className="text-[11px] text-muted-foreground border-t pt-1.5">{m.notes}</p>}
    </div>
  );
}

const emptyForm = {
  name: "",
  start_date: new Date().toISOString().split("T")[0],
  end_date: "",
  notes: "",
  percent_complete: 0,
};

export default function SiteMilestoneList({ milestones, activities = [], siteId, onChanged }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const avgProgress = milestones.length
    ? Math.round(milestones.reduce((s, m) => s + (m.percent_complete || 0), 0) / milestones.length)
    : 0;
  const completedMs = milestones.filter((m) => m.status === "completed").length;

  const activityCount: Record<string, number> = {};
  activities.forEach((a) => {
    if (a.milestone_id) activityCount[a.milestone_id] = (activityCount[a.milestone_id] || 0) + 1;
  });

  const openCreate = () => {
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!siteId) return;
    if (!form.name.trim()) { toast.error("Milestone name is required"); return; }
    if (!form.start_date) { toast.error("Planned Start Date is required"); return; }
    if (!form.end_date) { toast.error("Planned End Date is required"); return; }
    if (form.end_date < form.start_date) { toast.error("Planned End cannot be before Planned Start"); return; }
    const pct = Math.min(100, Math.max(0, Number(form.percent_complete) || 0));
    setSaving(true);
    try {
      const { error } = await supabase.from("site_milestones").insert({
        site_id: siteId,
        name: form.name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes.trim() || null,
        percent_complete: pct,
        status: pct >= 100 ? "completed" : pct > 0 ? "in_progress" : "not_started",
        is_active: true,
      });
      if (error) throw error;
      toast.success("Milestone added");
      setShowForm(false);
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to add milestone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{avgProgress}%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Overall completion</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{completedMs}/{milestones.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Milestones completed</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{activities.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Activities logged</p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 rounded-xl border bg-card p-4 shadow-card space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">Overall progress</span>
            <span className="font-bold">{avgProgress}%</span>
          </div>
          <Progress value={avgProgress} className="h-3" />
        </div>
        {siteId && (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Add Milestone
          </Button>
        )}
      </div>

      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No milestones added yet.</p>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => (
            <MilestoneCard key={m.id} m={m} linked={activityCount[m.id] || 0} onChanged={onChanged} />
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" /> Add Milestone
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Milestone Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Foundation Complete" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Planned Start *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Planned End *</Label>
                <Input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional description..." rows={2} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <Label className="text-xs">Initial Progress</Label>
                <span className="font-semibold tabular-nums">{form.percent_complete}%</span>
              </div>
              <Slider
                value={[form.percent_complete]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => setForm({ ...form, percent_complete: v[0] })}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
