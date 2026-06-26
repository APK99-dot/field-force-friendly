import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Target, Activity as ActivityIcon, Loader2 } from "lucide-react";
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

export default function SiteMilestoneList({ milestones, activities = [], onChanged }: Props) {
  const avgProgress = milestones.length
    ? Math.round(milestones.reduce((s, m) => s + (m.percent_complete || 0), 0) / milestones.length)
    : 0;
  const completedMs = milestones.filter((m) => m.status === "completed").length;

  const activityCount: Record<string, number> = {};
  activities.forEach((a) => {
    if (a.milestone_id) activityCount[a.milestone_id] = (activityCount[a.milestone_id] || 0) + 1;
  });

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

      <div className="rounded-xl border bg-card p-4 shadow-card space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground font-medium">Overall progress</span>
          <span className="font-bold">{avgProgress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${avgProgress}%` }}
          />
        </div>
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
    </div>
  );
}
