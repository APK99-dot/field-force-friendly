import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Users, Target, CalendarRange } from "lucide-react";
import { format } from "date-fns";

export interface SiteCardData {
  id: string;
  site_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "secondary", started: "default", completed: "default", dropped: "destructive",
};
const STATUS_LABEL: Record<string, string> = {
  planned: "Planned", started: "Started", completed: "Completed", dropped: "Dropped",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

interface Props {
  site: SiteCardData;
  assignedNames: string[];
  progress: number;
  milestoneCount: number;
  onOpen: () => void;
}

export default function SiteCard({ site, assignedNames, progress, milestoneCount, onOpen }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="text-left rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3 w-full"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-4.5 w-4.5 text-primary" />
          </div>
          <span className="font-semibold truncate">{site.site_name}</span>
        </div>
        <Badge variant={STATUS_VARIANT[site.status] || "secondary"} className="shrink-0">
          {STATUS_LABEL[site.status] || "Planned"}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Target className="h-3 w-3" /> {milestoneCount} milestone{milestoneCount !== 1 ? "s" : ""}</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {assignedNames.length === 0 ? (
            <span className="text-xs text-muted-foreground">No users</span>
          ) : (
            <div className="flex -space-x-2">
              {assignedNames.slice(0, 4).map((n, i) => (
                <Avatar key={i} className="h-6 w-6 border-2 border-card">
                  <AvatarFallback className="text-[9px] bg-muted">{initials(n)}</AvatarFallback>
                </Avatar>
              ))}
              {assignedNames.length > 4 && (
                <div className="h-6 w-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[9px]">
                  +{assignedNames.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t pt-2">
        <CalendarRange className="h-3 w-3 shrink-0" />
        {site.start_date ? format(new Date(site.start_date), "dd MMM yy") : "—"}
        {" – "}
        {site.end_date ? format(new Date(site.end_date), "dd MMM yy") : "Ongoing"}
      </div>
    </motion.button>
  );
}
