import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import { format } from "date-fns";
import { milestoneStatusLabel } from "@/components/admin/SiteMilestonesDialog";
import type { HubMilestone } from "@/hooks/useSiteHub";

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

export default function SiteMilestoneList({ milestones }: { milestones: HubMilestone[] }) {
  if (milestones.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No milestones added yet.</p>;
  }
  return (
    <div className="space-y-3">
      {milestones.map((m) => (
        <div key={m.id} className="rounded-lg border p-3 space-y-2.5">
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
              <span>{m.percent_complete}%</span>
            </div>
            <Progress value={m.percent_complete} className="h-1.5" />
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
          </div>

          {m.notes && <p className="text-[11px] text-muted-foreground border-t pt-1.5">{m.notes}</p>}
        </div>
      ))}
    </div>
  );
}
