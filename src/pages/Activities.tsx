import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { format, parseISO, isToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Filter,
  MapPin,
  CalendarDays,
  Search,
  Trash2,
  Edit,
  RotateCcw,
} from "lucide-react";
import { useActivities, type Activity as ActivityType, type ActivityFilters } from "@/hooks/useActivities";
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

const durationTypes = ["hour_based", "half_day", "full_day", "multiple_days"];
const statusOptions = ["planned", "in_progress", "completed"];

const statusColors: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
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

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [filters, setFilters] = useState<ActivityFilters>({
    employee: "",
    project: "",
    dateFrom: "",
    dateTo: "",
    status: "",
  });

  // Dashboard stats
  const stats = useMemo(() => {
    const today = activities.filter((a) => {
      try { return isToday(parseISO(a.activity_date)); } catch { return false; }
    });
    const completed = today.filter((a) => a.status === "completed");
    const pending = today.filter((a) => a.status !== "completed");
    const totalHours = today.reduce((sum, a) => sum + (a.total_hours || 0), 0);
    return {
      total: today.length,
      completed: completed.length,
      pending: pending.length,
      totalHours: Math.round(totalHours * 10) / 10,
    };
  }, [activities]);

  const filtered = useMemo(() => {
    if (!searchQuery) return activities;
    const q = searchQuery.toLowerCase();
    return activities.filter(
      (a) =>
        a.activity_name.toLowerCase().includes(q) ||
        a.activity_type.toLowerCase().includes(q) ||
        (a.user_full_name || "").toLowerCase().includes(q) ||
        (a.project_name || "").toLowerCase().includes(q)
    );
  }, [activities, searchQuery]);

  const handleApplyFilters = () => {
    fetchActivities(filters);
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    const reset: ActivityFilters = { employee: "", project: "", dateFrom: "", dateTo: "", status: "" };
    setFilters(reset);
    fetchActivities(reset);
    setShowFilters(false);
  };

  const handleOpenCreate = () => {
    setForm(defaultForm);
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
      fetchActivities(filters);
    } catch (err: any) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this activity?")) return;
    await deleteActivity(id);
    fetchActivities(filters);
  };

  return (
    <motion.div
      className="p-4 space-y-4 max-w-7xl mx-auto pb-24"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Activities</h1>
          <p className="text-xs text-muted-foreground">Log & track daily work activities</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowFilters(true)}>
            <Filter className="h-4 w-4 mr-1" /> Filter
          </Button>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Today's Activities</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Activity className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Pending</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Hours Logged</p>
                <p className="text-2xl font-bold">{stats.totalHours}</p>
              </div>
              <Clock className="h-8 w-8 text-violet-500/30" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search */}
      <motion.div variants={item} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search activities..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </motion.div>

      {/* Activity List */}
      <motion.div variants={item} className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No activities found</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-1" /> Log Activity
            </Button>
          </div>
        ) : (
          filtered.map((a) => (
            <Card key={a.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold truncate">{a.activity_name}</h3>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColors[a.status] || ""}`}>
                        {statusLabels[a.status] || a.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Activity className="h-3 w-3" /> {a.activity_type}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> {format(parseISO(a.activity_date), "dd MMM yyyy")}
                      </span>
                      {a.total_hours ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {a.total_hours}h
                        </span>
                      ) : null}
                      {a.location_address && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {a.location_address}
                        </span>
                      )}
                    </div>
                    {a.project_name && (
                      <p className="text-xs text-primary mt-1">📁 {a.project_name}</p>
                    )}
                    {isAdmin && a.user_full_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">👤 {a.user_full_name}</p>
                    )}
                    {a.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(a)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </motion.div>

      {/* Create/Edit Dialog */}
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
              {saving ? "Saving..." : editingId ? "Update Activity" : "Log Activity"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters Dialog */}
      <Dialog open={showFilters} onOpenChange={setShowFilters}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Filter Activities</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {isAdmin && (
              <div>
                <Label className="text-xs">Employee</Label>
                <Select value={filters.employee} onValueChange={(v) => setFilters({ ...filters, employee: v })}>
                  <SelectTrigger><SelectValue placeholder="All Employees" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Project</Label>
              <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
                <SelectTrigger><SelectValue placeholder="All Projects" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleApplyFilters}>Apply</Button>
              <Button variant="outline" className="flex-1" onClick={handleResetFilters}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
