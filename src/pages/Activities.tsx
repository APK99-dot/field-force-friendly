import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActivities, type Activity as ActivityType } from "@/hooks/useActivities";
import { useUserProfile } from "@/hooks/useUserProfile";

const activityTypes = [
  "Site Visit",
  "Contractor Meeting",
  "Inspection",
  "Training",
  "Internal Work",
  "Client Meeting",
  "Documentation",
  "Other",
];

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
  description: "",
  status: "planned",
  project_id: "",
  location_address: "",
  total_hours: 0,
};

export default function Activities() {
  const { activities, loading, users, projects, fetchActivities, createActivity, updateActivity, deleteActivity } = useActivities();
  const { isAdmin } = useUserProfile();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"timeline" | "gps" | "activity">("timeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Filter activities by selected date and optionally by user
  const dayActivities = useMemo(() => {
    return activities.filter((a) => {
      const dateMatch = a.activity_date === dateStr;
      const userMatch = !selectedUserId || a.user_id === selectedUserId;
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

  const handleOpenCreate = () => {
    setForm({ ...defaultForm, activity_date: dateStr });
    setEditingId(null);
    setShowForm(true);
  };

  const handleOpenEdit = (a: ActivityType) => {
    setForm({
      activity_name: a.activity_name,
      activity_type: a.activity_type,
      activity_date: a.activity_date,
      start_time: a.start_time ? format(parseISO(a.start_time), "HH:mm") : "",
      end_time: a.end_time ? format(parseISO(a.end_time), "HH:mm") : "",
      duration_type: a.duration_type || "hour_based",
      description: a.description || "",
      status: a.status,
      project_id: a.project_id || "",
      location_address: a.location_address || "",
      total_hours: a.total_hours || 0,
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.activity_name || !form.activity_type) return;
    setSaving(true);
    try {
      const payload: any = {
        activity_name: form.activity_name,
        activity_type: form.activity_type,
        activity_date: form.activity_date,
        start_time: form.start_time ? `${form.activity_date}T${form.start_time}:00` : null,
        end_time: form.end_time ? `${form.activity_date}T${form.end_time}:00` : null,
        duration_type: form.duration_type,
        description: form.description || null,
        status: form.status,
        project_id: form.project_id || null,
        location_address: form.location_address || null,
        total_hours: form.total_hours || 0,
      };
      if (editingId) {
        await updateActivity(editingId, payload);
      } else {
        await createActivity(payload);
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
      {/* Gradient Header - Matching Visits/Staging-Quickapp */}
      <motion.div variants={item} className="gradient-hero text-primary-foreground p-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Activities</h1>
            <p className="text-xs opacity-80">Log & track daily work</p>
          </div>
          {/* User Select Dropdown */}
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

        {/* Action Buttons Row: Timeline, GPS Track, Activity */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Button
            variant="ghost"
            className={`h-9 text-xs ${activeTab === "timeline" ? "bg-white/20 text-primary-foreground" : "text-primary-foreground/60 hover:bg-white/10"}`}
            onClick={() => setActiveTab("timeline")}
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" />Timeline
          </Button>
          <Button
            variant="ghost"
            className={`h-9 text-xs ${activeTab === "gps" ? "bg-white/20 text-primary-foreground" : "text-primary-foreground/60 hover:bg-white/10"}`}
            onClick={() => setActiveTab("gps")}
          >
            <Navigation2 className="h-3.5 w-3.5 mr-1.5" />GPS Track
          </Button>
          <Button
            variant="ghost"
            className={`h-9 text-xs ${activeTab === "activity" ? "bg-white/20 text-primary-foreground" : "text-primary-foreground/60 hover:bg-white/10"}`}
            onClick={() => {
              setActiveTab("activity");
              handleOpenCreate();
            }}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />Activity
          </Button>
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

      {/* Activity List */}
      <motion.div variants={item} className="px-4 pb-24 pt-3 space-y-3">
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
            <Card key={a.id} className="shadow-card">
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
                    {a.project_name && (
                      <p className="text-xs text-primary ml-6 mt-0.5">📁 {a.project_name}</p>
                    )}
                    {isAdmin && a.user_full_name && (
                      <p className="text-xs text-muted-foreground ml-6 mt-0.5">👤 {a.user_full_name}</p>
                    )}
                    {a.description && (
                      <p className="text-xs text-muted-foreground ml-6 mt-1 line-clamp-2">{a.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant="outline" className={statusColors[a.status] || ""}>
                      {statusLabels[a.status] || a.status}
                    </Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(a)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </motion.div>

      {/* Create/Edit Activity Dialog - Reusing existing form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Activity" : "Log New Activity"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Activity Name *</Label>
              <Input value={form.activity_name} onChange={(e) => setForm({ ...form, activity_name: e.target.value })} placeholder="e.g. Site inspection at Block A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Activity Type *</Label>
                <Select value={form.activity_type} onValueChange={(v) => setForm({ ...form, activity_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {activityTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select project (optional)" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
              <Label className="text-xs">Total Hours</Label>
              <Input type="number" step="0.5" min="0" value={form.total_hours} onChange={(e) => setForm({ ...form, total_hours: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Input value={form.location_address} onChange={(e) => setForm({ ...form, location_address: e.target.value })} placeholder="Enter location or address" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Activity details..." rows={3} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving || !form.activity_name || !form.activity_type}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? "Saving..." : editingId ? "Update Activity" : "Log Activity"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
