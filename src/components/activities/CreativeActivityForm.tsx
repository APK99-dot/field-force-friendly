import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Camera,
  MapPin,
  Users,
  Check,
  X,
  Sparkles,
  Loader2,
  ImagePlus,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadActivityPhoto, resolveActivityPhotoUrl } from "@/utils/activityPhotos";
import type { ActivityPhotoEntry, ActivityStatusEntry } from "@/hooks/useActivities";
import { format } from "date-fns";

type ProjectOpt = { id: string; name: string };
type UserOpt = { id: string; full_name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: ProjectOpt[];
  users: UserOpt[];
  activityTypes: string[];
  currentUserId: string;
  canAssign: boolean;
  cfgCheckIn: boolean;
  cfgTakePhoto: boolean;
  createActivity: (activity: any, targetUserId?: string, silent?: boolean) => Promise<any>;
  checkInForDate: (userId: string, date: string) => Promise<any>;
  fetchAttendanceForDate: (userId: string, date: string) => Promise<any>;
  onCreated?: () => void;
}

const RISK_OPTIONS = [
  { key: "green", label: "On Track", color: "bg-emerald-500", ring: "ring-emerald-500" },
  { key: "orange", label: "Attention", color: "bg-amber-500", ring: "ring-amber-500" },
  { key: "red", label: "Critical", color: "bg-red-500", ring: "ring-red-500" },
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function gradientFor(seed: string) {
  const palettes = [
    "from-fuchsia-500 via-pink-500 to-orange-400",
    "from-indigo-500 via-purple-500 to-pink-500",
    "from-emerald-400 via-teal-500 to-cyan-500",
    "from-amber-400 via-orange-500 to-rose-500",
    "from-sky-400 via-blue-500 to-indigo-500",
    "from-violet-500 via-fuchsia-500 to-rose-500",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length];
}

export default function CreativeActivityForm({
  open,
  onOpenChange,
  projects,
  users,
  activityTypes,
  currentUserId,
  canAssign,
  cfgCheckIn,
  cfgTakePhoto,
  createActivity,
  checkInForDate,
  fetchAttendanceForDate,
  onCreated,
}: Props) {
  const [projectId, setProjectId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("");
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [risk, setRisk] = useState<string>("green");
  const [photos, setPhotos] = useState<ActivityPhotoEntry[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dateStr = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (!open) {
      setProjectId("");
      setProjectSearch("");
      setDescription("");
      setActivityType("");
      setAssignedIds([]);
      setRisk("green");
      setPhotos([]);
      setPhotoPreviews({});
      setAssignOpen(false);
      setAssignSearch("");
      return;
    }
    if (currentUserId && cfgCheckIn) {
      fetchAttendanceForDate(currentUserId, dateStr)
        .then((r) => setCheckedIn(!!r?.check_in_time))
        .catch(() => {});
    }
  }, [open, currentUserId, cfgCheckIn, dateStr, fetchAttendanceForDate]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const filteredUsers = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return q ? users.filter((u) => u.full_name.toLowerCase().includes(q)) : users;
  }, [users, assignSearch]);

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const entry = await uploadActivityPhoto(file);
      setPhotos((p) => [...p, entry]);
      const url = await resolveActivityPhotoUrl(entry.url);
      setPhotoPreviews((prev) => ({ ...prev, [entry.url]: url }));
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      await checkInForDate(currentUserId, dateStr);
      setCheckedIn(true);
      toast.success("Checked in");
    } catch (err: any) {
      toast.error(err.message || "Check-in failed");
    } finally {
      setCheckingIn(false);
    }
  };

  const canPost = !!description.trim() || !!activityType || !!projectId;

  const handlePost = async () => {
    if (!canPost) {
      toast.error("Add a project, type, or description to post");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        activity_name: activityType || "Activity Update",
        activity_type: activityType || "General Activity",
        activity_date: dateStr,
        description: description || null,
        project_id: projectId || null,
        photo_urls: photos,
        status: "planned",
        status_history: [{ status: "planned", at: new Date().toISOString() } as ActivityStatusEntry],
        ...(canAssign ? { assigned_user_ids: assignedIds } : {}),
      };
      await createActivity(payload);
      toast.success("Posted to your activity feed");
      onCreated?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to post");
    } finally {
      setSaving(false);
    }
  };

  const selectedProject = projects.find((p) => p.id === projectId);
  const currentRisk = RISK_OPTIONS.find((r) => r.key === risk)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-[520px] max-h-[92vh] overflow-hidden rounded-2xl border-0 shadow-2xl">
        <div className="flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="relative px-5 py-4 bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-tight">New Post</h2>
                <p className="text-[11px] text-white/80">Share what's happening on the ground</p>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 bg-background">
            {/* Project selector — circular horizontal scroll */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</p>
                {selectedProject && (
                  <button
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setProjectId("")}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="pl-9 h-9 rounded-full bg-muted/60 border-0"
                />
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
                {filteredProjects.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4">No projects found</p>
                )}
                {filteredProjects.map((p) => {
                  const active = p.id === projectId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setProjectId(p.id)}
                      className="shrink-0 flex flex-col items-center gap-1.5 w-16 focus:outline-none group"
                    >
                      <div
                        className={cn(
                          "relative h-16 w-16 rounded-full p-[2.5px] transition-all",
                          active
                            ? "bg-gradient-to-tr from-yellow-400 via-pink-500 to-fuchsia-600 scale-105"
                            : "bg-gradient-to-tr from-muted to-muted group-hover:from-pink-300 group-hover:to-fuchsia-400"
                        )}
                      >
                        <div
                          className={cn(
                            "h-full w-full rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold text-sm border-2 border-background",
                            gradientFor(p.id)
                          )}
                        >
                          {initials(p.name)}
                        </div>
                        {active && (
                          <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                      <p
                        className={cn(
                          "text-[10px] w-full text-center truncate leading-tight",
                          active ? "font-semibold text-foreground" : "text-muted-foreground"
                        )}
                        title={p.name}
                      >
                        {p.name}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status / description */}
            <div className="px-4 py-3 border-t border-border/40">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-10 w-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-semibold shrink-0",
                    gradientFor(currentUserId || "me")
                  )}
                >
                  {initials("Me")}
                </div>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    selectedProject
                      ? `What's happening at ${selectedProject.name}?`
                      : "What's on your mind today?"
                  }
                  rows={3}
                  className="resize-none border-0 bg-transparent focus-visible:ring-0 shadow-none px-0 text-[15px] placeholder:text-muted-foreground/70"
                />
              </div>

              {/* Photos preview */}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {photos.map((ph) => (
                    <div
                      key={ph.url}
                      className="relative aspect-square rounded-xl overflow-hidden bg-muted group"
                    >
                      {photoPreviews[ph.url] ? (
                        <img
                          src={photoPreviews[ph.url]}
                          alt="upload"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <button
                        onClick={() =>
                          setPhotos((p) => p.filter((x) => x.url !== ph.url))
                        }
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity type chips */}
            <div className="px-4 py-3 border-t border-border/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Activity Type
              </p>
              <div className="flex flex-wrap gap-2">
                {activityTypes.length === 0 && (
                  <p className="text-xs text-muted-foreground">No activity types configured</p>
                )}
                {activityTypes.map((t) => {
                  const active = t === activityType;
                  return (
                    <button
                      key={t}
                      onClick={() => setActivityType(active ? "" : t)}
                      className={cn(
                        "px-3.5 h-8 rounded-full text-xs font-medium border transition-all",
                        active
                          ? "bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white border-transparent shadow-md"
                          : "bg-background border-border text-foreground hover:border-fuchsia-400 hover:text-fuchsia-600"
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assign to + Risk */}
            <div className="px-4 py-3 border-t border-border/40 grid grid-cols-2 gap-3">
              {canAssign && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Assign
                  </p>
                  <button
                    onClick={() => setAssignOpen((v) => !v)}
                    className="w-full h-11 rounded-xl border border-border bg-muted/40 hover:bg-muted flex items-center gap-2 px-3 text-sm transition"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {assignedIds.length === 0 ? (
                      <span className="text-muted-foreground">Add people</span>
                    ) : (
                      <div className="flex -space-x-2">
                        {assignedIds.slice(0, 4).map((id) => {
                          const u = users.find((x) => x.id === id);
                          return (
                            <div
                              key={id}
                              className={cn(
                                "h-6 w-6 rounded-full bg-gradient-to-br border-2 border-background text-white text-[10px] flex items-center justify-center font-semibold",
                                gradientFor(id)
                              )}
                              title={u?.full_name}
                            >
                              {initials(u?.full_name || "?")}
                            </div>
                          );
                        })}
                        {assignedIds.length > 4 && (
                          <div className="h-6 w-6 rounded-full bg-muted border-2 border-background text-[10px] flex items-center justify-center font-semibold">
                            +{assignedIds.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                </div>
              )}

              <div className={cn(!canAssign && "col-span-2")}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Risk
                </p>
                <div className="flex gap-2">
                  {RISK_OPTIONS.map((r) => {
                    const active = r.key === risk;
                    return (
                      <button
                        key={r.key}
                        onClick={() => setRisk(r.key)}
                        className={cn(
                          "flex-1 h-11 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-medium transition-all",
                          active
                            ? `border-transparent bg-gradient-to-br ${r.color} text-white shadow-md`
                            : "border-border bg-background text-muted-foreground hover:border-foreground/30"
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            active ? "bg-white" : r.color
                          )}
                        />
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Assign picker */}
            {canAssign && assignOpen && (
              <div className="px-4 pb-2">
                <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                      placeholder="Search people..."
                      className="pl-9 h-9 bg-background rounded-full border-0"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredUsers.map((u) => {
                      const active = assignedIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() =>
                            setAssignedIds((cur) =>
                              active ? cur.filter((x) => x !== u.id) : [...cur, u.id]
                            )
                          }
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm",
                            active ? "bg-primary/10" : "hover:bg-background"
                          )}
                        >
                          <div
                            className={cn(
                              "h-7 w-7 rounded-full bg-gradient-to-br text-white text-[10px] flex items-center justify-center font-semibold",
                              gradientFor(u.id)
                            )}
                          >
                            {initials(u.full_name)}
                          </div>
                          <span className="flex-1 text-left truncate">{u.full_name}</span>
                          {active && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Action rail: photo + check-in */}
            <div className="px-4 py-3 border-t border-border/40 flex items-center gap-2">
              {cfgTakePhoto && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoPick}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-br from-pink-50 to-fuchsia-100 dark:from-fuchsia-950/40 dark:to-pink-950/40 border border-fuchsia-200/60 dark:border-fuchsia-900/60 flex items-center justify-center gap-2 text-xs font-medium text-fuchsia-700 dark:text-fuchsia-300 hover:brightness-105 transition disabled:opacity-60"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : photos.length > 0 ? (
                      <ImagePlus className="h-4 w-4" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {uploadingPhoto ? "Uploading" : photos.length > 0 ? "Add More" : "Photo"}
                  </button>
                </>
              )}

              {cfgCheckIn && (
                <button
                  onClick={handleCheckIn}
                  disabled={checkedIn || checkingIn}
                  className={cn(
                    "flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-medium transition border",
                    checkedIn
                      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/60"
                      : "bg-gradient-to-br from-sky-50 to-indigo-100 dark:from-indigo-950/40 dark:to-sky-950/40 border-sky-200/60 dark:border-sky-900/60 text-indigo-700 dark:text-indigo-300 hover:brightness-105"
                  )}
                >
                  {checkingIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                  {checkedIn ? "Checked In" : "Check In"}
                </button>
              )}

              <div className="flex-1 h-11 rounded-xl border border-border bg-muted/30 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ShieldAlert className={cn("h-4 w-4", currentRisk.key === "green" ? "text-emerald-500" : currentRisk.key === "orange" ? "text-amber-500" : "text-red-500")} />
                {currentRisk.label}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border/60 bg-background flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {selectedProject && (
                <Badge variant="secondary" className="rounded-full text-[10px] px-2 py-0">
                  {selectedProject.name}
                </Badge>
              )}
              {activityType && (
                <Badge className="rounded-full text-[10px] px-2 py-0 bg-fuchsia-600 hover:bg-fuchsia-600">
                  {activityType}
                </Badge>
              )}
            </div>
            <Button
              onClick={handlePost}
              disabled={!canPost || saving}
              className="rounded-full h-10 px-5 bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white hover:brightness-110 shadow-md"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              Post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
