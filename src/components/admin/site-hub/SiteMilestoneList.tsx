import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  Activity as ActivityIcon,
  Loader2,
  AlertTriangle,
  MessageSquare,
  Send,
  Trash2,
  Plus,
  Pencil,
  User,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
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
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { MILESTONE_STATUSES, milestoneStatusLabel } from "@/components/admin/SiteMilestonesDialog";
import { statusFromProgress } from "@/utils/milestoneProgress";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { HubMilestone } from "@/hooks/useSiteHub";
import type { Activity } from "@/hooks/useActivities";
import { cn } from "@/lib/utils";

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

interface Comment {
  id: string;
  milestone_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name?: string;
}

interface Props {
  milestones: HubMilestone[];
  activities?: Activity[];
  onChanged?: () => void;
  onAddSubMilestone?: (parentId: string, parentName: string) => void;
  onEditMilestone?: (m: HubMilestone) => void;
}

interface MilestoneCardProps {
  m: HubMilestone;
  children: HubMilestone[];
  linked: number;
  linkedActivities: Activity[];
  linkedByChild: Record<string, number>;
  activityCountForChild: Record<string, Activity[]>;
  comments: Comment[];
  onCommentAdded: () => void;
  onChanged?: () => void;
  currentUserId?: string;
  onAddSubMilestone?: (parentId: string, parentName: string) => void;
  onEditMilestone?: (m: HubMilestone) => void;
  isChild?: boolean;
}

async function saveMilestoneProgress(id: string, pct: number, currentStatus?: string | null) {
  const clamped = Math.min(100, Math.max(0, Math.round(pct)));
  const status = statusFromProgress(clamped, currentStatus);
  const { error } = await supabase
    .from("site_milestones")
    .update({ percent_complete: clamped, status })
    .eq("id", id);
  if (error) throw error;
}

async function rollUpParent(parentId: string, parentStatus: string | null | undefined) {
  const { data, error } = await supabase
    .from("site_milestones")
    .select("percent_complete")
    .eq("parent_id", parentId);
  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return;
  const avg = Math.round(rows.reduce((s, r: any) => s + (r.percent_complete || 0), 0) / rows.length);
  await saveMilestoneProgress(parentId, avg, parentStatus);
}

function MilestoneCard({
  m,
  children,
  linked,
  linkedActivities,
  linkedByChild,
  activityCountForChild,
  comments,
  onCommentAdded,
  onChanged,
  currentUserId,
  onAddSubMilestone,
  onEditMilestone,
  isChild,
}: MilestoneCardProps) {
  const hasChildren = children.length > 0;
  const [draft, setDraft] = useState<number>(m.percent_complete ?? 0);
  const [saving, setSaving] = useState(false);
  const [togglingRisk, setTogglingRisk] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (hasChildren) {
        const childIds = children.map((c) => c.id);
        const { error: cErr } = await supabase.from("site_milestones").delete().in("id", childIds);
        if (cErr) throw cErr;
      }
      const { error } = await supabase.from("site_milestones").delete().eq("id", m.id);
      if (error) throw error;
      toast.success(hasChildren ? "Milestone and sub-milestones deleted" : "Milestone deleted");
      setConfirmDelete(false);
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not delete milestone");
    } finally {
      setDeleting(false);
    }
  };



  // If children exist, derived progress = avg; slider disabled
  useEffect(() => {
    if (hasChildren) {
      const avg = children.length
        ? Math.round(children.reduce((s, c) => s + (c.percent_complete || 0), 0) / children.length)
        : 0;
      setDraft(avg);
    } else {
      setDraft(m.percent_complete ?? 0);
    }
  }, [m.percent_complete, hasChildren, children]);

  const commitProgress = async (val: number) => {
    if (hasChildren) return;
    if (val === (m.percent_complete ?? 0)) return;
    setSaving(true);
    try {
      await saveMilestoneProgress(m.id, val, m.status);
      if (m.parent_id) await rollUpParent(m.parent_id, null);
      toast.success("Progress updated");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not update progress");
      setDraft(m.percent_complete ?? 0);
    } finally {
      setSaving(false);
    }
  };

  const toggleAtRisk = async () => {
    setTogglingRisk(true);
    try {
      const { error } = await supabase
        .from("site_milestones")
        .update({ at_risk: !m.at_risk })
        .eq("id", m.id);
      if (error) throw error;
      toast.success(!m.at_risk ? "Flagged as At Risk" : "At Risk flag cleared");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not update flag");
    } finally {
      setTogglingRisk(false);
    }
  };

  const changeStatus = async (newStatus: string) => {
    if (newStatus === m.status) return;
    setSavingStatus(true);
    try {
      const { error } = await supabase
        .from("site_milestones")
        .update({ status: newStatus })
        .eq("id", m.id);
      if (error) throw error;
      toast.success("Status updated");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Could not update status");
    } finally {
      setSavingStatus(false);
    }
  };

  const postComment = async () => {
    const content = newComment.trim();
    if (!content || !currentUserId) return;
    setPostingComment(true);
    try {
      const { error } = await supabase
        .from("site_milestone_comments")
        .insert({ milestone_id: m.id, user_id: currentUserId, content });
      if (error) throw error;
      setNewComment("");
      onCommentAdded();
    } catch (err: any) {
      toast.error(err.message || "Could not post comment");
    } finally {
      setPostingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase
        .from("site_milestone_comments")
        .delete()
        .eq("id", commentId);
      if (error) throw error;
      onCommentAdded();
    } catch (err: any) {
      toast.error(err.message || "Could not delete comment");
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2.5",
        m.at_risk && "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
          <Target className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-sm truncate">{m.name}</span>
          {m.at_risk && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 gap-1 shrink-0">
              <AlertTriangle className="h-3 w-3" /> At Risk
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Select value={m.status} onValueChange={changeStatus} disabled={savingStatus}>
            <SelectTrigger className="h-7 w-[130px] text-xs px-2">
              <SelectValue>
                <Badge variant={STATUS_VARIANT[m.status] || "secondary"} className="text-[10px] px-1.5 py-0">
                  {milestoneStatusLabel(m.status)}
                </Badge>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MILESTONE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant={m.at_risk ? "default" : "outline"}
            className={cn("h-7 w-7", m.at_risk && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500")}
            title={m.at_risk ? "Clear At Risk flag" : "Flag as At Risk"}
            onClick={toggleAtRisk}
            disabled={togglingRisk}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-0.5">
        <Slider
          value={[draft]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => !hasChildren && setDraft(v[0])}
          onValueCommit={(v) => commitProgress(v[0])}
          disabled={saving || hasChildren}
          className="flex-1"
        />
        <span className="text-xs font-semibold w-10 text-right tabular-nums">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : `${draft}%`}
        </span>
      </div>
      {hasChildren && (
        <p className="text-[10px] text-muted-foreground -mt-1">Auto-calculated from sub-milestones</p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <div>
          <span className="text-muted-foreground">Planned: </span>
          {fmt(m.start_date)} – {fmt(m.end_date)}
        </div>
        <div>
          <span className="text-muted-foreground">Actual: </span>
          {fmt(m.actual_start_date)} – {fmt(m.actual_end_date)}
        </div>
        {linked > 0 ? (
          <button
            type="button"
            onClick={() => setShowActivities((v) => !v)}
            className="flex items-center gap-1 text-primary hover:underline text-left"
          >
            <ActivityIcon className="h-3 w-3" />
            {linked} linked {linked === 1 ? "activity" : "activities"}
          </button>
        ) : (
          <div className="flex items-center gap-1 text-muted-foreground">
            <ActivityIcon className="h-3 w-3" />
            0 linked activities
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground justify-end"
        >
          <MessageSquare className="h-3 w-3" />
          {comments.filter((c) => c.milestone_id === m.id).length} {comments.filter((c) => c.milestone_id === m.id).length === 1 ? "comment" : "comments"}
        </button>
      </div>

      {showActivities && linkedActivities.length > 0 && (
        <div className="border-t pt-2 space-y-1.5">
          {linkedActivities.map((a) => (
            <div key={a.id} className="text-[11px] rounded bg-muted/40 px-2 py-1.5">
              <div className="font-medium truncate">{a.activity_name}</div>
              <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                <span className="flex items-center gap-1"><User className="h-3 w-3" />{a.user_full_name}</span>
                <span>·</span>
                <span>{a.activity_date ? format(new Date(a.activity_date), "dd MMM yy") : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isChild && onAddSubMilestone && (
        <div className="pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs w-full"
            onClick={() => onAddSubMilestone(m.id, m.name)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Sub-Milestone
          </Button>
        </div>
      )}

      {m.notes && <p className="text-[11px] text-muted-foreground border-t pt-1.5">{m.notes}</p>}

      {hasChildren && expanded && (
        <div className="pl-4 mt-3 border-l-2 border-dashed border-muted-foreground/30 space-y-2">
          {children.map((c) => (
            <MilestoneCard
              key={c.id}
              m={c}
              children={[]}
              linked={linkedByChild[c.id] || 0}
              linkedActivities={activityCountForChild[c.id] || []}
              linkedByChild={{}}
              activityCountForChild={{}}
              comments={comments}
              onCommentAdded={onCommentAdded}
              onChanged={onChanged}
              currentUserId={currentUserId}
              isChild
            />
          ))}
        </div>
      )}

      {showComments && (
        <div className="border-t pt-2.5 space-y-2">
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {comments.filter((c) => c.milestone_id === m.id).length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No comments yet.</p>
            ) : (
              comments
                .filter((c) => c.milestone_id === m.id)
                .map((c) => (
                  <div key={c.id} className="text-[11px] bg-muted/40 rounded px-2 py-1.5 group">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium">{c.author_name || "User"}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
                        {c.user_id === currentUserId && (
                          <button
                            type="button"
                            onClick={() => deleteComment(c.id)}
                            className="opacity-0 group-hover:opacity-100 text-destructive"
                            aria-label="Delete comment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap mt-0.5">{c.content}</p>
                  </div>
                ))
            )}
          </div>
          <div className="flex gap-1.5">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={1}
              className="text-xs min-h-[32px] resize-none"
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={postComment}
              disabled={postingComment || !newComment.trim()}
            >
              {postingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SiteMilestoneList({ milestones, activities = [], onChanged, onAddSubMilestone }: Props) {
  const { user } = useCurrentUser();
  const [comments, setComments] = useState<Comment[]>([]);

  // Group into parents + children
  const { parents, childrenByParent } = useMemo(() => {
    const parents = milestones.filter((m) => !m.parent_id);
    const childrenByParent: Record<string, HubMilestone[]> = {};
    milestones
      .filter((m) => m.parent_id)
      .forEach((m) => {
        (childrenByParent[m.parent_id as string] ||= []).push(m);
      });
    return { parents, childrenByParent };
  }, [milestones]);

  // Progress: only count parent milestones (children roll up into parent)
  const avgProgress = parents.length
    ? Math.round(parents.reduce((s, m) => s + (m.percent_complete || 0), 0) / parents.length)
    : 0;
  const completedMs = parents.filter((m) => m.status === "completed").length;
  const atRiskMs = milestones.filter((m) => m.at_risk).length;

  const activityCount: Record<string, number> = {};
  const activitiesById: Record<string, Activity[]> = {};
  activities.forEach((a) => {
    if (a.milestone_id) {
      activityCount[a.milestone_id] = (activityCount[a.milestone_id] || 0) + 1;
      (activitiesById[a.milestone_id] ||= []).push(a);
    }
  });

  const fetchComments = useCallback(async () => {
    const ids = milestones.map((m) => m.id);
    if (ids.length === 0) {
      setComments([]);
      return;
    }
    const { data, error } = await supabase
      .from("site_milestone_comments")
      .select("id, milestone_id, user_id, content, created_at")
      .in("milestone_id", ids)
      .order("created_at", { ascending: false });
    if (error) return;
    const userIds = [...new Set((data || []).map((c: any) => c.user_id))];
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: us } = await supabase.from("users").select("id, full_name").in("id", userIds);
      (us || []).forEach((u: any) => (nameMap[u.id] = u.full_name || "User"));
    }
    setComments(
      (data || []).map((c: any) => ({ ...c, author_name: nameMap[c.user_id] || "User" }))
    );
  }, [milestones]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{avgProgress}%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Overall completion</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">
            {completedMs}/{parents.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Milestones completed</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{activities.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Activities logged</p>
        </div>
        <div
          className={cn(
            "rounded-xl border bg-card p-4 shadow-card text-center",
            atRiskMs > 0 && "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20"
          )}
        >
          <p className={cn("text-2xl font-bold", atRiskMs > 0 && "text-amber-700 dark:text-amber-400")}>
            {atRiskMs}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">At Risk</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-card space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground font-medium">Overall progress</span>
          <span className="font-bold">{avgProgress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${avgProgress}%` }} />
        </div>
      </div>

      {parents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No milestones added yet.</p>
      ) : (
        <div className="space-y-3">
          {parents.map((m) => (
            <MilestoneCard
              key={m.id}
              m={m}
              children={childrenByParent[m.id] || []}
              linked={activityCount[m.id] || 0}
              linkedActivities={activitiesById[m.id] || []}
              linkedByChild={activityCount}
              activityCountForChild={activitiesById}
              comments={comments}
              onCommentAdded={fetchComments}
              onChanged={onChanged}
              currentUserId={user?.id}
              onAddSubMilestone={onAddSubMilestone}
            />
          ))}
        </div>
      )}
    </div>
  );
}
