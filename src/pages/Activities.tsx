import { useState, useEffect, useMemo, Suspense, lazy, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks, parseISO, isToday } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Navigation2,
  Sparkles,
  Clock,
  Users,
  MapPin,
  Activity,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Trash2,
  Edit,
  Loader2,
  LogIn,
  LogOut,
  Route,
  Octagon,
  Timer,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition } from "@/utils/nativePermissions";
import { useActivities, type Activity as ActivityType } from "@/hooks/useActivities";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LeafletMap = lazy(() => import("@/components/LeafletMap"));

const statusOptions = ["planned", "in_progress", "completed"];

const statusColors: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info border-info/20",
  completed: "bg-success/10 text-success border-success/20",
};

const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

const defaultForm = {
  activity_name: "",
  activity_type: "",
  activity_date: format(new Date(), "yyyy-MM-dd"),
  start_time: "",
  end_time: "",
  duration_type: "hour_based",
  half_day_type: "first_half",
  description: "",
  status: "planned",
  site_id: "",
  location_address: "",
  total_hours: 0,
  owner_user_id: "",
};

export default function Activities() {
  const { activities, loading, users, projects, sites, fetchActivities, fetchDropdowns, createActivity, updateActivity, deleteActivity, fetchAttendanceForDate, fetchGPSTrackingForDate } = useActivities();
  const { isAdmin, role } = useUserProfile();
  const navigate = useNavigate();
  const isManagerOrAdmin = isAdmin || role === "sales_manager";

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"timeline" | "gps" | "activity">("activity");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // Dynamic activity types from DB
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [showAddTypeDialog, setShowAddTypeDialog] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [addingType, setAddingType] = useState(false);

  // Add new site dialog
  const [showAddSiteDialog, setShowAddSiteDialog] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [addingSite, setAddingSite] = useState(false);

  const fetchActivityTypes = useCallback(async () => {
    const { data } = await supabase
      .from("activity_types_master")
      .select("name")
      .eq("is_active", true)
      .order("name");
    setActivityTypes((data || []).map((d: any) => d.name));
  }, []);

  useEffect(() => {
    fetchActivityTypes();
  }, [fetchActivityTypes]);

  const handleAddNewType = async () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) return;
    if (activityTypes.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("This activity type already exists");
      return;
    }
    setAddingType(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("activity_types_master").insert({ name: trimmed, created_by: user?.id });
      if (error) throw error;
      await fetchActivityTypes();
      setForm((f) => ({ ...f, activity_type: trimmed }));
      setNewTypeName("");
      setShowAddTypeDialog(false);
      toast.success(`"${trimmed}" added`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add type");
    } finally {
      setAddingType(false);
    }
  };

  // Timeline state
  const [attendance, setAttendance] = useState<{ check_in_time: string | null; check_out_time: string | null } | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // GPS state
  const [gpsData, setGpsData] = useState<{ points: any[]; stops: any[] }>({ points: [], stops: [] });
  const [gpsLoading, setGpsLoading] = useState(false);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Get current user id
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const effectiveUserId = selectedUserId && selectedUserId !== "all" ? selectedUserId : currentUserId;

  // Fetch attendance & GPS when tab/date/user changes
  useEffect(() => {
    if (!effectiveUserId) return;
    if (activeTab === "timeline") {
      setAttendanceLoading(true);
      fetchAttendanceForDate(effectiveUserId, dateStr).then((data) => {
        setAttendance(data);
        setAttendanceLoading(false);
      });
    }
  }, [activeTab, effectiveUserId, dateStr, fetchAttendanceForDate]);

  useEffect(() => {
    if (!effectiveUserId) return;
    if (activeTab === "gps") {
      setGpsLoading(true);
      fetchGPSTrackingForDate(effectiveUserId, dateStr).then((data) => {
        setGpsData(data);
        setGpsLoading(false);
      });
    }
  }, [activeTab, effectiveUserId, dateStr, fetchGPSTrackingForDate]);

  // Filter activities by selected date and optionally by user
  const dayActivities = useMemo(() => {
    return activities.filter((a) => {
      const dateMatch = a.activity_date === dateStr;
      const userMatch = !selectedUserId || selectedUserId === "all" || a.user_id === selectedUserId;
      return dateMatch && userMatch;
    });
  }, [activities, dateStr, selectedUserId]);

  const filteredActivities = useMemo(() => {
    if (!searchQuery) return dayActivities;
    const q = searchQuery.toLowerCase();
    return dayActivities.filter(
      (a) =>
        a.activity_name.toLowerCase().includes(q) ||
        a.activity_type.toLowerCase().includes(q) ||
        (a.user_full_name || "").toLowerCase().includes(q)
    );
  }, [dayActivities, searchQuery]);

  // Sort by start_time for timeline
  const timelineSorted = useMemo(() => {
    return [...filteredActivities].sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
  }, [filteredActivities]);

  // Stats for selected date
  const stats = useMemo(() => {
    const completed = dayActivities.filter((a) => a.status === "completed");
    const pending = dayActivities.filter((a) => a.status !== "completed");
    const totalHours = dayActivities.reduce((sum, a) => sum + (a.total_hours || 0), 0);
    return {
      total: dayActivities.length,
      completed: completed.length,
      pending: pending.length,
      totalHours: Math.round(totalHours * 10) / 10,
    };
  }, [dayActivities]);

  // Check which days have activities (green dot)
  const daysWithActivities = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((a) => set.add(a.activity_date));
    return set;
  }, [activities]);

  // GPS distance calculation
  const gpsStats = useMemo(() => {
    const pts = gpsData.points;
    if (pts.length < 2) return { distance: 0, stops: gpsData.stops.length, duration: 0 };
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += haversine(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude);
    }
    const duration = pts.length >= 2
      ? (new Date(pts[pts.length - 1].timestamp).getTime() - new Date(pts[0].timestamp).getTime()) / 3600000
      : 0;
    return { distance: Math.round(dist * 10) / 10, stops: gpsData.stops.length, duration: Math.round(duration * 10) / 10 };
  }, [gpsData]);

  const handleOpenCreate = () => {
    setForm({ ...defaultForm, activity_date: dateStr, owner_user_id: currentUserId });
    setEditingId(null);
    setShowForm(true);
  };

  const handleAddNewSite = async () => {
    const trimmed = newSiteName.trim();
    if (!trimmed) return;
    setAddingSite(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("project_sites").insert({ site_name: trimmed, created_by: user?.id });
      if (error) throw error;
      await fetchDropdowns();
      const newSite = sites.find(s => s.site_name === trimmed) || (await supabase.from("project_sites").select("id").eq("site_name", trimmed).maybeSingle()).data;
      if (newSite) setForm((f) => ({ ...f, site_id: newSite.id }));
      setNewSiteName("");
      setShowAddSiteDialog(false);
      toast.success(`"${trimmed}" added`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add site");
    } finally {
      setAddingSite(false);
    }
  };

  const handleOpenEdit = (a: ActivityType) => {
    setForm({
      activity_name: a.activity_name,
      activity_type: a.activity_type,
      activity_date: a.activity_date,
      start_time: a.start_time ? format(parseISO(a.start_time), "HH:mm") : "",
      end_time: a.end_time ? format(parseISO(a.end_time), "HH:mm") : "",
      duration_type: a.duration_type || "hour_based",
      half_day_type: (a as any).half_day_type || "first_half",
      description: a.description || "",
      status: a.status,
      site_id: a.site_id || "",
      location_address: a.location_address || "",
      total_hours: a.total_hours || 0,
      owner_user_id: a.user_id,
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.activity_type) return;
    setSaving(true);
    try {
      const payload: any = {
        activity_name: form.activity_type,
        activity_type: form.activity_type,
        activity_date: form.activity_date,
        start_time: form.start_time ? `${form.activity_date}T${form.start_time}:00` : null,
        end_time: form.end_time ? `${form.activity_date}T${form.end_time}:00` : null,
        duration_type: form.duration_type,
        description: form.description || null,
        status: form.status,
        site_id: form.site_id || null,
        location_address: form.location_address || null,
        total_hours: form.total_hours || 0,
      };
      if (editingId) {
        await updateActivity(editingId, payload);
      } else {
        const targetUserId = isManagerOrAdmin && form.owner_user_id ? form.owner_user_id : undefined;
        await createActivity(payload, targetUserId);
      }
      setShowForm(false);
      fetchActivities();
    } catch (err: any) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this activity?")) return;
    await deleteActivity(id);
    fetchActivities();
  };

  return (
    <motion.div className="space-y-0" variants={container} initial="hidden" animate="show">
      {/* Gradient Header */}
      <motion.div variants={item} className="gradient-hero text-primary-foreground p-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Activities</h1>
            <p className="text-xs opacity-80">Log & track daily work</p>
          </div>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-[140px] h-8 bg-white/15 border-white/20 text-primary-foreground text-xs">
              <Users className="h-3.5 w-3.5 mr-1 opacity-80" />
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name || "Unknown"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Week Info + Navigation */}
        <div className="flex items-center gap-2 mt-3 mb-3">
          <CalendarDays className="h-4 w-4 opacity-80" />
          <span className="text-xs opacity-80">Week of {format(weekStart, "MMM d, yyyy")}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10" onClick={() => setSelectedDate(subWeeks(selectedDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10" onClick={() => setSelectedDate(addWeeks(selectedDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Week Day Selector */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => {
            const isActive = isSameDay(day, selectedDate);
            const dayKey = format(day, "yyyy-MM-dd");
            const hasActivities = daysWithActivities.has(dayKey);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`rounded-lg py-2 text-center transition-colors relative ${isActive ? "bg-white text-primary font-semibold" : "bg-white/15 text-primary-foreground/80 hover:bg-white/25"}`}
              >
                <p className="text-[10px]">{format(day, "EEE")}</p>
                <p className="text-sm font-semibold">{format(day, "d")}</p>
                {hasActivities && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Action Buttons Row */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-all"
            onClick={() => navigate("/activity-timeline")}
          >
            <Clock className="h-4 w-4" />Timeline
          </button>
          <button
            className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-all"
            onClick={() => navigate("/gps-tracking")}
          >
            <Navigation2 className="h-4 w-4" />GPS Track
          </button>
          <button
            className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 transition-all"
            onClick={handleOpenCreate}
          >
            <Sparkles className="h-4 w-4" />Activity
          </button>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={item} className="p-4 grid grid-cols-4 gap-2">
        <div className="bg-card rounded-xl p-3 text-center shadow-card">
          <p className="text-lg font-bold">{stats.total}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center shadow-card">
          <p className="text-lg font-bold text-emerald-600">{stats.completed}</p>
          <p className="text-[10px] text-muted-foreground">Done</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center shadow-card">
          <p className="text-lg font-bold text-amber-600">{stats.pending}</p>
          <p className="text-[10px] text-muted-foreground">Pending</p>
        </div>
        <div className="bg-card rounded-xl p-3 text-center shadow-card">
          <p className="text-lg font-bold text-violet-600">{stats.totalHours}h</p>
          <p className="text-[10px] text-muted-foreground">Hours</p>
        </div>
      </motion.div>

      {/* Search + New Button */}
      <motion.div variants={item} className="px-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search activities..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Button className="gradient-hero text-primary-foreground" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>
      </motion.div>

      {/* Content based on active tab */}
      <motion.div variants={item} className="px-4 pb-24 pt-3 space-y-3">
        {activeTab === "activity" && (
          <>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredActivities.length === 0 ? (
              <Card className="shadow-card">
                <CardContent className="p-8 text-center">
                  <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm font-semibold text-muted-foreground">No activities found</p>
                  <p className="text-xs text-muted-foreground mt-1">Log a new activity for this date</p>
                </CardContent>
              </Card>
            ) : (
              filteredActivities.map((a) => (
                <ActivityCard key={a.id} a={a} isAdmin={isAdmin} onEdit={handleOpenEdit} onDelete={handleDelete} onStatusChanged={() => fetchActivities()} updateActivity={updateActivity} />
              ))
            )}
          </>
        )}

        {activeTab === "gps" && (
          <GPSTrackView
            gpsData={gpsData}
            gpsStats={gpsStats}
            gpsLoading={gpsLoading}
            activities={filteredActivities}
          />
        )}
      </motion.div>

      {/* Create/Edit Activity Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Activity" : "Log New Activity"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Activity Owner - only for managers/admins */}
            {isManagerOrAdmin && !editingId && (
              <div>
                <Label className="text-xs font-medium">Activity Owner</Label>
                <Select value={form.owner_user_id} onValueChange={(v) => setForm({ ...form, owner_user_id: v })}>
                  <SelectTrigger>
                    <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || "Unknown"} {u.id === currentUserId ? "(You)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Activity Type *</Label>
                <Select value={form.activity_type} onValueChange={(v) => {
                    if (v === "__add_new__") {
                      setShowAddTypeDialog(true);
                      return;
                    }
                    setForm({ ...form, activity_type: v });
                  }}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {activityTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    <Separator className="my-1" />
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Add new type...</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Project / Site</Label>
              <Select value={form.site_id} onValueChange={(v) => {
                if (v === "__add_new_site__") {
                  setShowAddSiteDialog(true);
                  return;
                }
                setForm({ ...form, site_id: v });
              }}>
                <SelectTrigger><SelectValue placeholder="Select site (optional)" /></SelectTrigger>
                <SelectContent>
                  {sites.filter(s => s.is_active).map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
                  <Separator className="my-1" />
                  <SelectItem value="__add_new_site__" className="text-primary font-medium">
                    <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Add new site...</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Activity Date</Label>
              <Input type="date" value={form.activity_date} onChange={(e) => setForm({ ...form, activity_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Duration Type</Label>
              <Select value={form.duration_type} onValueChange={(v) => setForm({ ...form, duration_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hour_based">Hour Based</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                  <SelectItem value="full_day">Full Day</SelectItem>
                  <SelectItem value="multiple_days">Multiple Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.duration_type === "half_day" && (
              <div>
                <Label className="text-xs">Half Day Period</Label>
                <Select value={form.half_day_type} onValueChange={(v) => setForm({ ...form, half_day_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_half">First Half</SelectItem>
                    <SelectItem value="second_half">Second Half</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.duration_type === "hour_based" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Start Time</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">End Time</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Activity details..." rows={3} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving || !form.activity_type}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? "Saving..." : editingId ? "Update Activity" : "Log Activity"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add New Activity Type Dialog */}
      <Dialog open={showAddTypeDialog} onOpenChange={setShowAddTypeDialog}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Add New Activity Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="e.g. Quality Check"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNewType()}
              autoFocus
            />
            <Button className="w-full" onClick={handleAddNewType} disabled={addingType || !newTypeName.trim()}>
              {addingType ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {addingType ? "Adding..." : "Add Type"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add New Site Dialog */}
      <Dialog open={showAddSiteDialog} onOpenChange={setShowAddSiteDialog}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Add New Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="e.g. Koramangala Site"
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNewSite()}
              autoFocus
            />
            <Button className="w-full" onClick={handleAddNewSite} disabled={addingSite || !newSiteName.trim()}>
              {addingSite ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {addingSite ? "Adding..." : "Add Site"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// ---- Timeline View Component ----
function TimelineView({
  activities,
  attendance,
  attendanceLoading,
  loading,
  isAdmin,
  onEdit,
  onDelete,
}: {
  activities: ActivityType[];
  attendance: { check_in_time: string | null; check_out_time: string | null } | null;
  attendanceLoading: boolean;
  loading: boolean;
  isAdmin: boolean;
  onEdit: (a: ActivityType) => void;
  onDelete: (id: string) => void;
}) {
  if (loading || attendanceLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasCheckIn = attendance?.check_in_time;
  const hasCheckOut = attendance?.check_out_time;

  if (!hasCheckIn && activities.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-8 text-center">
          <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-semibold text-muted-foreground">No day start recorded</p>
          <p className="text-xs text-muted-foreground mt-1">No attendance or activities for this date</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-border" />

      {/* Day Started */}
      {hasCheckIn && (
        <TimelineNode
          time={format(parseISO(attendance!.check_in_time!), "h:mm a")}
          icon={<LogIn className="h-3.5 w-3.5 text-emerald-600" />}
          color="bg-emerald-100 border-emerald-300"
        >
          <p className="text-sm font-semibold text-emerald-700">Day Started</p>
          <p className="text-xs text-muted-foreground">Check-in recorded</p>
        </TimelineNode>
      )}

      {/* Activity nodes */}
      {activities.map((a) => (
        <TimelineNode
          key={a.id}
          time={a.start_time ? format(parseISO(a.start_time), "h:mm a") : "--:--"}
          icon={<Activity className="h-3.5 w-3.5 text-primary" />}
          color="bg-primary/10 border-primary/30"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">{a.activity_name}</span>
                <Badge variant="outline" className={`text-[10px] py-0 ${statusColors[a.status]}`}>
                  {statusLabels[a.status] || a.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{a.activity_type}</p>
              {a.location_address && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <MapPin className="h-3 w-3 inline mr-1" />{a.location_address}
                </p>
              )}
              {a.total_hours ? (
                <p className="text-xs text-muted-foreground mt-0.5">Duration: {a.total_hours}h</p>
              ) : null}
              {isAdmin && a.user_full_name && (
                <p className="text-xs text-muted-foreground mt-0.5">👤 {a.user_full_name}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0 ml-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(a)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(a.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </TimelineNode>
      ))}

      {/* Day Ended */}
      {hasCheckOut && (
        <TimelineNode
          time={format(parseISO(attendance!.check_out_time!), "h:mm a")}
          icon={<LogOut className="h-3.5 w-3.5 text-red-600" />}
          color="bg-red-100 border-red-300"
        >
          <p className="text-sm font-semibold text-red-700">Day Ended</p>
          <p className="text-xs text-muted-foreground">Check-out recorded</p>
        </TimelineNode>
      )}
    </div>
  );
}

function TimelineNode({ time, icon, color, children }: { time: string; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-4 relative">
      <div className="flex flex-col items-center shrink-0 z-10">
        <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center ${color} bg-card`}>
          {icon}
        </div>
      </div>
      <div className="flex-1 pt-1">
        <p className="text-[10px] text-muted-foreground font-mono mb-0.5">{time}</p>
        <Card className="shadow-card">
          <CardContent className="p-3">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- GPS Track View Component ----
function GPSTrackView({
  gpsData,
  gpsStats,
  gpsLoading,
  activities,
}: {
  gpsData: { points: any[]; stops: any[] };
  gpsStats: { distance: number; stops: number; duration: number };
  gpsLoading: boolean;
  activities: ActivityType[];
}) {
  if (gpsLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (gpsData.points.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-8 text-center">
          <Navigation2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm font-semibold text-muted-foreground">No GPS data</p>
          <p className="text-xs text-muted-foreground mt-1">GPS tracking data will appear once the day is started</p>
        </CardContent>
      </Card>
    );
  }

  const activityMarkers = activities
    .filter((a) => a.location_lat && a.location_lng)
    .map((a) => ({ lat: Number(a.location_lat), lng: Number(a.location_lng), name: a.activity_name }));

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <Route className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="text-sm font-bold">{gpsStats.distance} km</p>
            <p className="text-[10px] text-muted-foreground">Distance</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <Octagon className="h-4 w-4 mx-auto text-amber-500 mb-1" />
            <p className="text-sm font-bold">{gpsStats.stops}</p>
            <p className="text-[10px] text-muted-foreground">Stops</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <Timer className="h-4 w-4 mx-auto text-violet-500 mb-1" />
            <p className="text-sm font-bold">{gpsStats.duration}h</p>
            <p className="text-[10px] text-muted-foreground">Duration</p>
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      <Card className="shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[400px] relative">
            <Suspense fallback={
              <div className="h-full w-full flex items-center justify-center bg-muted">
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            }>
              <LeafletMap gpsPoints={gpsData.points} activityMarkers={activityMarkers} />
            </Suspense>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Activity Card Component ----
function ActivityCard({ a, isAdmin, onEdit, onDelete, onStatusChanged, updateActivity }: { a: ActivityType; isAdmin: boolean; onEdit: (a: ActivityType) => void; onDelete: (id: string) => void; onStatusChanged: () => void; updateActivity: (id: string, updates: Partial<ActivityType>) => Promise<void> }) {
  const [changingStatus, setChangingStatus] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === a.status) return;
    setChangingStatus(true);
    try {
      const updates: Partial<ActivityType> = {
        status: newStatus,
        status_changed_at: new Date().toISOString(),
      };

      // Capture GPS location
      try {
        const pos = await getCurrentPosition();
        updates.status_change_lat = pos.latitude;
        updates.status_change_lng = pos.longitude;
        updates.location_lat = pos.latitude;
        updates.location_lng = pos.longitude;

        // Reverse geocode
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.latitude}&lon=${pos.longitude}&format=json`);
          const geo = await res.json();
          if (geo.display_name) {
            updates.location_address = geo.display_name;
          }
        } catch {}
      } catch (geoErr) {
        console.warn("Geolocation failed:", geoErr);
        toast.error("Could not capture location. Status updated without location.");
      }

      // Set start/end time based on transition
      if (newStatus === "in_progress" && !a.start_time) {
        updates.start_time = new Date().toISOString();
      } else if (newStatus === "completed") {
        updates.end_time = new Date().toISOString();
      }

      await updateActivity(a.id, updates);
      fetchActivities();
      toast.success(`Status changed to ${statusLabels[newStatus]}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setChangingStatus(false);
    }
  };

  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold text-sm truncate">{a.activity_name}</span>
            </div>
            <p className="text-xs text-muted-foreground ml-6">{a.activity_type}</p>
            {a.location_address && (
              <p className="text-xs text-muted-foreground ml-6 mt-0.5">
                <MapPin className="h-3 w-3 inline mr-1" />{a.location_address}
              </p>
            )}
            {a.start_time && (
              <p className="text-xs text-muted-foreground ml-6 mt-0.5">
                <Clock className="h-3 w-3 inline mr-1" />
                {format(parseISO(a.start_time), "h:mm a")}
                {a.end_time && ` - ${format(parseISO(a.end_time), "h:mm a")}`}
                {a.total_hours ? ` (${a.total_hours}h)` : ""}
              </p>
            )}
            {(a.site_name || a.project_name) && (
              <p className="text-xs text-primary ml-6 mt-0.5">📁 {a.site_name || a.project_name}</p>
            )}
            {a.user_full_name && (
              <p className="text-xs text-muted-foreground ml-6 mt-0.5">👤 {a.user_full_name}</p>
            )}
            {a.description && (
              <p className="text-xs text-muted-foreground ml-6 mt-1 line-clamp-2">{a.description}</p>
            )}
            {/* Status change location & timestamp */}
            {a.status_changed_at && (
              <p className="text-[10px] text-muted-foreground ml-6 mt-1">
                📍 Status updated {format(parseISO(a.status_changed_at), "h:mm a, MMM d")}
                {a.status_change_lat && a.status_change_lng && (
                  <span> • {Number(a.status_change_lat).toFixed(4)}, {Number(a.status_change_lng).toFixed(4)}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={changingStatus}>
                <button className="cursor-pointer">
                  <Badge variant="outline" className={`${statusColors[a.status] || ""} ${changingStatus ? "opacity-50" : "hover:opacity-80"}`}>
                    {changingStatus ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    {statusLabels[a.status] || a.status}
                  </Badge>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Change Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {statusOptions.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={a.status === s ? "font-bold" : ""}
                  >
                    <Badge variant="outline" className={`${statusColors[s]} mr-2 text-[10px]`}>
                      {statusLabels[s]}
                    </Badge>
                    {a.status === s && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(a)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(a.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Haversine distance calculation (km) ----
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
