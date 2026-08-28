import { useState, useEffect, useMemo, useRef, Suspense, lazy, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks, parseISO, isToday } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { updateMilestoneProgress } from "@/utils/milestoneProgress";
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
  ClipboardCheck,
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
  Mic,
  
  AudioLines,
  Square,
  Play,
  Pause,
  X,
  ChevronDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition } from "@/utils/nativePermissions";
import { useActivities, type Activity as ActivityType, type ActivityPhotoEntry, type ActivityStatusEntry } from "@/hooks/useActivities";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useModuleConfig } from "@/hooks/useModuleConfig";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

import ActivityPhotoManager from "@/components/activities/ActivityPhotoManager";

import { MultiUserPicker } from "@/components/pm/MultiUserPicker";
import { milestoneStatusLabel } from "@/components/admin/SiteMilestonesDialog";
import OpenGRNPicker from "@/components/procurement/OpenGRNPicker";
import ReceiveGoodsDialog from "@/components/procurement/ReceiveGoodsDialog";
import CreativeActivityForm from "@/components/activities/CreativeActivityForm";
import { Sparkles, LayoutList } from "lucide-react";

interface MilestoneOption {
  id: string;
  name: string;
  status: string;
  percent_complete: number;
  start_date: string;
  end_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  notes: string | null;
}
import { PlayCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { ActivityAudioPlayer } from "@/components/activities/ActivityAudioPlayer";

const LeafletMap = lazy(() => import("@/components/LeafletMap"));

const statusOptions = ["planned", "in_progress", "completed"];

const statusColors: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info border-info/20",
  completed: "bg-success/10 text-success border-success/20",
};

const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "Work In Progress",
  completed: "Completed",
};

const getActivitySeriesKey = (activity: ActivityType) =>
  [
    activity.user_id,
    activity.activity_name,
    activity.activity_type,
    activity.from_date ?? "",
    activity.to_date ?? "",
    activity.project_id ?? "",
    activity.site_id ?? "",
    activity.description ?? "",
    activity.total_days ?? "",
  ].join("::");

const buildRecurringDates = (form: {
  recurrence_pattern: string;
  recurrence_interval: number;
  recurrence_start_date: string;
  recurrence_end_date: string;
  recurrence_no_end: boolean;
}): string[] => {
  if (!form.recurrence_start_date) return [];
  const start = new Date(`${form.recurrence_start_date}T00:00:00`);
  if (isNaN(start.getTime())) return [];
  const MAX_OCCURRENCES = 366;
  let end: Date;
  if (form.recurrence_no_end || !form.recurrence_end_date) {
    end = new Date(start);
    end.setDate(end.getDate() + 90);
  } else {
    end = new Date(`${form.recurrence_end_date}T00:00:00`);
    if (isNaN(end.getTime()) || end < start) return [];
  }
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end && dates.length < MAX_OCCURRENCES) {
    dates.push(format(d, "yyyy-MM-dd"));
    switch (form.recurrence_pattern) {
      case "weekly":
        d.setDate(d.getDate() + 7);
        break;
      case "monthly":
        d.setMonth(d.getMonth() + 1);
        break;
      case "custom":
        d.setDate(d.getDate() + Math.max(1, form.recurrence_interval || 1));
        break;
      default:
        d.setDate(d.getDate() + 1);
    }
  }
  return dates;
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

type SiteFlag = "red" | "orange" | "green";

const FLAG_CONFIG: Record<SiteFlag, { color: string; label: string }> = {
  red: { color: "bg-red-500", label: "Critical / Urgent" },
  orange: { color: "bg-orange-500", label: "Needs Attention" },
  green: { color: "bg-emerald-500", label: "On Track" },
};

const defaultForm = {
  activity_name: "",
  activity_type: "",
  custom_activity_name: "",
  activity_date: format(new Date(), "yyyy-MM-dd"),
  start_time: "",
  end_time: "",
  duration_type: "hour_based",
  half_day_type: "",
  from_date: "",
  to_date: "",
  recurrence_pattern: "daily",
  recurrence_interval: 1,
  recurrence_start_date: format(new Date(), "yyyy-MM-dd"),
  recurrence_end_date: "",
  recurrence_no_end: false,
  description: "",
  site_id: "",
  milestone_id: "",
  milestone_progress: 0,
  grn_po_id: "",
  site_flag: "" as string,
  site_status: "" as string,
  location_address: "",
  total_hours: 0,
  owner_user_id: "",
  assigned_user_ids: [] as string[],
  photos: [] as ActivityPhotoEntry[],
};

export default function Activities() {
  const { activities, loading, users, projects, sites, fetchActivities, fetchDropdowns, createActivity, updateActivity, deleteActivity, fetchAttendanceForDate, checkInForDate, fetchGPSTrackingForDate, checkInActivity, checkOutActivity } = useActivities();
  const { isAdmin, role } = useUserProfile();
  const navigate = useNavigate();
  const cfg = useModuleConfig("activities");
  const canAssign = cfg.canDo("assignPermission");
  const cfgCheckIn = cfg.bool("checkIn");
  const cfgTakePhoto = cfg.boolOr("takePhoto", "photoUpload");
  const cfgUploadGallery = cfg.boolOr("uploadGallery", "photoUpload");
  const cfgPhotoUpload = cfgTakePhoto || cfgUploadGallery;
  const cfgVoiceNote = cfg.bool("voiceNote");
  const cfgRequireActivityType = cfg.bool("requireActivityType");
  const cfgRequireMilestone = cfg.bool("requireMilestone");
  const cfgAllowBackdated = cfg.bool("allowBackdated");
  const isManagerOrAdmin = isAdmin || role === "sales_manager";

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"timeline" | "gps" | "activity">("activity");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [detailsActivity, setDetailsActivity] = useState<ActivityType | null>(null);
  const [formAttendance, setFormAttendance] = useState<{ check_in_time: string | null; check_out_time: string | null } | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [receivePoId, setReceivePoId] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [subordinateIds, setSubordinateIds] = useState<string[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const { isRecording, isFinalizing, recording, elapsed, startRecording, stopRecording, clearRecording, formatDuration } = useAudioRecorder();
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [voiceToTextMode, setVoiceToTextMode] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);

  // Dynamic activity types from DB
  const [activityTypes, setActivityTypes] = useState<string[]>([]);

  // Add new site dialog
  const [showAddSiteDialog, setShowAddSiteDialog] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [addingSite, setAddingSite] = useState(false);

  // Active milestones for selected site (read-only, sourced from Site master)
  const [siteMilestones, setSiteMilestones] = useState<MilestoneOption[]>([]);

  // Transcribe audio recording via edge function
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      const extension = audioBlob.type.includes("mp4") || audioBlob.type.includes("aac") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("audio", audioBlob, `recording.${extension}`);
      formData.append("lang", "en");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to use voice-to-text");
        return;
      }

      const response = await supabase.functions.invoke("transcribe-audio", {
        body: formData,
      });

      if (response.error) throw response.error;

      const transcript = response.data?.transcript?.trim();
      if (transcript) {
        setForm((prev: any) => ({
          ...prev,
          description: prev.description ? prev.description + " " + transcript : transcript,
        }));
        toast.success("Voice transcribed successfully");
      } else {
        toast.error("Could not understand the audio. Please try again.");
      }
    } catch (err: any) {
      console.error("Transcription error:", err);
      toast.error("Transcription failed: " + (err.message || "Unknown error"));
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  // Auto-transcribe when voice-to-text recording finishes
  useEffect(() => {
    if (voiceToTextMode && recording && !isRecording && !isTranscribing) {
      transcribeAudio(recording.blob);
      clearRecording();
      setVoiceToTextMode(false);
    }
  }, [voiceToTextMode, recording, isRecording, isTranscribing, transcribeAudio, clearRecording]);

  const handleMicOptionClick = useCallback(async (mode: 'text' | 'audio') => {
    if (isTranscribing || isStartingRecording || isFinalizing) return;

    if (isRecording) {
      setMicMenuOpen(false);
      await stopRecording();
      return;
    }

    clearRecording();
    setVoiceToTextMode(mode === 'text');
    setIsStartingRecording(true);

    try {
      await startRecording();
      setMicMenuOpen(false);
    } catch (err: any) {
      console.error('[Activities] Failed to start recording:', err);
      setVoiceToTextMode(false);
      toast.error(err.message || 'Could not start recording');
    } finally {
      setIsStartingRecording(false);
    }
  }, [clearRecording, isFinalizing, isRecording, isStartingRecording, isTranscribing, startRecording, stopRecording]);

  const fetchActivityTypes = useCallback(async () => {
    const { data } = await supabase
      .from("activity_types_master")
      .select("name")
      .eq("is_active", true)
      .order("sort_order");
    setActivityTypes((data || []).map((d: any) => d.name));
  }, []);

  // Fetch milestones and flag when site_id changes in form
  useEffect(() => {
    if (!form.site_id || form.site_id === "__add_new_site__") {
      setSiteMilestones([]);
      setForm(f => ({ ...f, site_flag: "", site_status: "" }));
      return;
    }
    supabase
      .from("site_milestones")
      .select("id, name, status, percent_complete, start_date, end_date, actual_start_date, actual_end_date, notes")
      .eq("site_id", form.site_id)
      .eq("is_active", true)
      .order("start_date")
      .then(({ data }) => {
        const mapped = (data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          percent_complete: m.percent_complete ?? 0,
          start_date: m.start_date,
          end_date: m.end_date,
          actual_start_date: m.actual_start_date,
          actual_end_date: m.actual_end_date,
          notes: m.notes,
        }));
        setSiteMilestones(mapped);
        setForm((f) => {
          const sel = mapped.find((m) => m.id === f.milestone_id);
          return sel ? { ...f, milestone_progress: sel.percent_complete } : f;
        });
      });
    supabase.from("project_sites").select("flag, status").eq("id", form.site_id).maybeSingle().then(({ data }) => {
      setForm(f => ({ ...f, site_flag: data?.flag || "green", site_status: data?.status || "planned" }));
    });
  }, [form.site_id]);

  useEffect(() => {
    fetchActivityTypes();
  }, [fetchActivityTypes]);




  // Timeline state
  const [attendance, setAttendance] = useState<{ check_in_time: string | null; check_out_time: string | null } | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // GPS state
  const [gpsData, setGpsData] = useState<{ points: any[]; stops: any[] }>({ points: [], stops: [] });
  const [gpsLoading, setGpsLoading] = useState(false);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Get current user id and fetch subordinates
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        // Fetch subordinates using the DB function
        const { data: subs } = await supabase.rpc("get_user_hierarchy", { _manager_id: data.user.id });
        if (subs && subs.length > 0) {
          setSubordinateIds(subs.map((s: any) => s.user_id));
        }
      }
    });
  }, []);

  const effectiveUserId = selectedUserId && selectedUserId !== "all" ? selectedUserId : currentUserId;

  // Filter users to only show subordinates (+ self) for the dropdown
  const hasSubordinates = subordinateIds.length > 0;
  const selectableUsers = useMemo(() => {
    if (!hasSubordinates) return [];
    const subSet = new Set(subordinateIds);
    return users.filter((u) => subSet.has(u.id) || u.id === currentUserId);
  }, [users, subordinateIds, currentUserId, hasSubordinates]);

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

  // Auto-open activity detail when navigated with ?id=...
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || loading || activities.length === 0) return;
    const found = activities.find((a) => a.id === id);
    if (found) {
      setCreativeEditActivity(found);
      setShowCreativeForm(true);

      // Remove the id param so refreshing won't reopen it
      const next = new URLSearchParams(searchParams);
      next.delete("id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, activities, loading, setSearchParams]);

  // Filter activities by selected date and optionally by user.
  // Prefer exact per-date rows; only fall back to legacy ranged rows when no dedicated row exists for that date.
  const dayActivities = useMemo(() => {
    const matchesSelectedUser = (activity: ActivityType) =>
      !selectedUserId || selectedUserId === "all" || activity.user_id === selectedUserId;

    const exactDateSeriesKeys = new Set(
      activities
        .filter(
          (activity) =>
            matchesSelectedUser(activity) &&
            activity.activity_date === dateStr &&
            activity.duration_type === "multiple_days" &&
            activity.from_date &&
            activity.to_date,
        )
        .map(getActivitySeriesKey),
    );

    return activities.filter((activity) => {
      if (!matchesSelectedUser(activity)) return false;

      if (activity.activity_date === dateStr) return true;

      if (activity.duration_type === "multiple_days" && activity.from_date && activity.to_date) {
        const isInRange = dateStr >= activity.from_date && dateStr <= activity.to_date;
        if (!isInRange) return false;

        return !exactDateSeriesKeys.has(getActivitySeriesKey(activity));
      }

      return false;
    });
  }, [activities, dateStr, selectedUserId]);

  const getStatusUpdateTargetId = useCallback(async (activity: ActivityType, targetDate: string) => {
    if (activity.duration_type !== "multiple_days" || !activity.from_date || !activity.to_date) {
      return activity.id;
    }

    const seriesKey = getActivitySeriesKey(activity);
    const seriesActivities = activities.filter((item) => getActivitySeriesKey(item) === seriesKey);
    const existingDates = new Set(seriesActivities.map((item) => item.activity_date));
    let targetId =
      seriesActivities.find((item) => item.activity_date === targetDate)?.id ??
      (activity.activity_date === targetDate ? activity.id : "");

    const startDate = parseISO(activity.from_date);
    const endDate = parseISO(activity.to_date);

    for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
      const currentDate = format(cursor, "yyyy-MM-dd");
      if (existingDates.has(currentDate)) continue;

      const created = await createActivity(
        {
          activity_name: activity.activity_name,
          activity_type: activity.activity_type,
          activity_date: currentDate,
          start_time: currentDate === activity.activity_date ? activity.start_time : null,
          end_time: currentDate === activity.activity_date ? activity.end_time : null,
          duration_type: activity.duration_type,
          from_date: activity.from_date,
          to_date: activity.to_date,
          total_days: activity.total_days,
          total_hours: activity.total_hours,
          description: activity.description,
          remarks: activity.remarks,
          status: activity.status,
          project_id: activity.project_id,
          site_id: activity.site_id,
          location_lat: currentDate === activity.activity_date ? activity.location_lat : null,
          location_lng: currentDate === activity.activity_date ? activity.location_lng : null,
          location_address: currentDate === activity.activity_date ? activity.location_address : null,
          attachment_urls: activity.attachment_urls,
        },
        activity.user_id,
        true,
      );

      existingDates.add(currentDate);
      if (currentDate === targetDate && created?.id) {
        targetId = created.id;
      }
    }

    return targetId || activity.id;
  }, [activities, createActivity]);

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

  // Check which days have activities (green dot) — scoped to the active user selection
  const daysWithActivities = useMemo(() => {
    const normalizeDayKey = (value: string | null | undefined) => {
      if (!value) return null;
      const parsed = parseISO(value);
      return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : format(parsed, "yyyy-MM-dd");
    };

    const indicatorUserId = selectedUserId === "all" ? null : selectedUserId || currentUserId || null;
    const scopedActivities = indicatorUserId
      ? activities.filter((activity) => activity.user_id === indicatorUserId)
      : selectedUserId === "all"
        ? activities
        : [];

    return scopedActivities.reduce((dateSet, activity) => {
      const activityDay = normalizeDayKey(activity.activity_date);
      if (activityDay) {
        dateSet.add(activityDay);
      }

      if (activity.duration_type === "multiple_days" && activity.from_date && activity.to_date) {
        const start = parseISO(activity.from_date);
        const end = parseISO(activity.to_date);

        for (let day = new Date(start); day <= end; day = addDays(day, 1)) {
          dateSet.add(format(day, "yyyy-MM-dd"));
        }
      }

      return dateSet;
    }, new Set<string>());
  }, [activities, selectedUserId, currentUserId]);

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

  const [showFormChooser, setShowFormChooser] = useState(false);
  const [showCreativeForm, setShowCreativeForm] = useState(false);
  const [creativeEditActivity, setCreativeEditActivity] = useState<ActivityType | null>(null);

  const openStandardForm = () => {
    // legacy — no longer used; kept as no-op to preserve helper references.
    setForm({ ...defaultForm, activity_date: dateStr, owner_user_id: currentUserId });
    setEditingId(null);
    setFormAttendance(null);
    fetchAttendanceForDate(currentUserId, dateStr).then(setFormAttendance).catch(() => {});
  };

  const handleOpenCreate = () => {
    setCreativeEditActivity(null);
    setShowCreativeForm(true);
  };

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const result = await checkInForDate(currentUserId, dateStr);
      setFormAttendance(result);
      toast.success("Checked in successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to check in");
    } finally {
      setCheckingIn(false);
    }
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
    setCreativeEditActivity(a);
    setShowCreativeForm(true);
  };


  const handleSave = async () => {
    if (cfgRequireActivityType && !form.activity_type) return;
    const isOther = form.activity_type.trim().toLowerCase() === "other";
    const isGrnType = form.activity_type.trim().toLowerCase().includes("grn");
    if (isOther && !form.custom_activity_name.trim()) {
      toast.error("Please enter a name for the 'Other' activity type.");
      return;
    }
    if (isGrnType && !form.grn_po_id) {
      toast.error("Please select an open purchase order (GRN) to receive against.");
      return;
    }
    if (cfgRequireMilestone && form.site_id && form.site_id !== "__add_new_site__" && siteMilestones.length > 0 && !form.milestone_id) {
      toast.error("Please select a milestone for this activity.");
      return;
    }
    if (!cfgAllowBackdated && form.activity_date < format(new Date(), "yyyy-MM-dd")) {
      toast.error("Backdated activity logging is disabled.");
      return;
    }
    setSaving(true);
    try {
      // Upload audio if recorded
      let audioUrl: string | null = null;
      if (recording) {
        const { data: { user } } = await supabase.auth.getUser();
        const extension = recording.fileExtension || (recording.mimeType.includes("mp4") || recording.mimeType.includes("aac") ? "m4a" : recording.mimeType.includes("ogg") ? "ogg" : "webm");
        const fileName = `${user!.id}/${Date.now()}.${extension}`;
        const { error: uploadErr } = await supabase.storage
          .from("activity-audio")
          .upload(fileName, recording.blob, { contentType: recording.mimeType || "audio/webm" });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("activity-audio").getPublicUrl(fileName);
        audioUrl = urlData.publicUrl;
      }

      const attachmentUrls: string[] = [];
      if (audioUrl) attachmentUrls.push(audioUrl);

      const payload: any = {
        activity_name: isOther ? form.custom_activity_name.trim() : (form.activity_type || "General Activity"),
        activity_type: form.activity_type || "General Activity",
        activity_date: form.activity_date,
        start_time: form.start_time ? `${form.activity_date}T${form.start_time}:00` : null,
        end_time: form.end_time ? `${form.activity_date}T${form.end_time}:00` : null,
        duration_type: form.duration_type,
        from_date: form.duration_type === "multiple_days" && form.from_date ? form.from_date : null,
        to_date: form.duration_type === "multiple_days" && form.to_date ? form.to_date : null,
        total_days: form.duration_type === "multiple_days" && form.from_date && form.to_date
          ? Math.max(1, Math.ceil((new Date(form.to_date).getTime() - new Date(form.from_date).getTime()) / 86400000) + 1)
          : null,
        description: form.description || null,
        site_id: form.site_id || null,
        milestone_id: form.milestone_id || null,
        grn_po_id: isGrnType ? (form.grn_po_id || null) : null,
        location_address: form.location_address || null,
        total_hours: form.total_hours || 0,
        photo_urls: form.photos || [],
        ...(canAssign ? { assigned_user_ids: form.assigned_user_ids || [] } : {}),
        ...(attachmentUrls.length > 0 ? { attachment_urls: attachmentUrls } : {}),
      };
      if (editingId) {
        await updateActivity(editingId, payload);
      } else {
        payload.status = "planned";
        payload.status_history = [{ status: "planned", at: new Date().toISOString() } as ActivityStatusEntry];
        const targetUserId = canAssign && form.owner_user_id ? form.owner_user_id : undefined;
        if (form.duration_type === "multiple_days" && form.from_date && form.to_date) {
          const start = new Date(form.from_date);
          const end = new Date(form.to_date);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split("T")[0];
            await createActivity({
              ...payload,
              activity_date: dateStr,
            }, targetUserId, true);
          }
          toast.success(`Activity logged for ${payload.total_days} days`);
        } else if (form.duration_type === "recurring") {
          const dates = buildRecurringDates(form);
          if (dates.length === 0) {
            toast.error("Please set a valid recurrence schedule.");
            setSaving(false);
            return;
          }
          for (const dateStr of dates) {
            await createActivity({
              ...payload,
              activity_date: dateStr,
              start_time: form.start_time ? `${dateStr}T${form.start_time}:00` : null,
              end_time: form.end_time ? `${dateStr}T${form.end_time}:00` : null,
            }, targetUserId, true);
          }
          toast.success(`Recurring activity created for ${dates.length} occurrences`);
        } else {
          await createActivity(payload, targetUserId);
        }
      }
      // Update site flag if changed
      if (form.site_id && form.site_flag) {
        await supabase.from("project_sites").update({ flag: form.site_flag }).eq("id", form.site_id);
      }
      // Sync milestone progress (single source of truth)
      if (form.milestone_id) {
        const sel = siteMilestones.find((m) => m.id === form.milestone_id);
        if (sel && form.milestone_progress !== sel.percent_complete) {
          try {
            await updateMilestoneProgress(form.milestone_id, form.milestone_progress, sel.status);
          } catch (e) {
            console.error("Failed to update milestone progress", e);
          }
        }
      }
      clearRecording();
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
          {hasSubordinates && (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[140px] h-8 bg-white/15 border-white/20 text-primary-foreground text-xs">
                <Users className="h-3.5 w-3.5 mr-1 opacity-80" />
                <SelectValue placeholder="My Activities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {selectableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
            <ClipboardCheck className="h-4 w-4" />Activity
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
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-9 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Button className="gradient-hero text-primary-foreground shrink-0 px-2.5 sm:px-3" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">New</span>
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
                <ActivityCard
                  key={a.id}
                  a={a}
                  isAdmin={isAdmin}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                  onOpenDetails={(a) => { setCreativeEditActivity(a); setShowCreativeForm(true); }}
                  onReceiveGoods={(poId) => setReceivePoId(poId)}
                  onStatusChanged={() => fetchActivities()}
                  updateActivity={updateActivity}
                  getStatusUpdateTargetId={getStatusUpdateTargetId}
                  selectedDateStr={dateStr}
                />
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




      <CreativeActivityForm
        open={showCreativeForm}
        onOpenChange={(o) => {
          setShowCreativeForm(o);
          if (!o) setCreativeEditActivity(null);
        }}
        projects={sites.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.site_name, image_url: s.image_url, base_lat: s.base_lat, base_lng: s.base_lng, base_address: s.base_address, geofence_radius_m: s.geofence_radius_m }))}
        users={users}
        activityTypes={activityTypes}
        currentUserId={currentUserId}
        canAssign={canAssign}
        cfgCheckIn={cfgCheckIn}
        cfgTakePhoto={cfgTakePhoto}
        cfgUploadGallery={cfgUploadGallery}
        createActivity={createActivity}
        updateActivity={updateActivity}
        checkInForDate={checkInForDate}
        fetchAttendanceForDate={fetchAttendanceForDate}
        checkInActivity={checkInActivity}
        checkOutActivity={checkOutActivity}
        onCreated={() => fetchActivities()}
        editActivity={creativeEditActivity}
        onDelete={async (id) => { await deleteActivity(id); fetchActivities(); }}

      />






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




      {/* Receive Goods (GRN) Dialog */}
      {receivePoId && (
        <ReceiveGoodsDialog
          open={!!receivePoId}
          onOpenChange={(o) => { if (!o) setReceivePoId(""); }}
          poId={receivePoId}
          currentUserId={currentUserId}
          onSaved={() => { setReceivePoId(""); fetchActivities(); }}
        />
      )}
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
function ActivityCard({ a, isAdmin, onEdit, onDelete, onOpenDetails, onReceiveGoods, onStatusChanged, updateActivity, getStatusUpdateTargetId, selectedDateStr }: { a: ActivityType; isAdmin: boolean; onEdit: (a: ActivityType) => void; onDelete: (id: string) => void; onOpenDetails: (a: ActivityType) => void; onReceiveGoods: (poId: string) => void; onStatusChanged: () => void; updateActivity: (id: string, updates: Partial<ActivityType>) => Promise<void>; getStatusUpdateTargetId: (activity: ActivityType, targetDate: string) => Promise<string>; selectedDateStr: string }) {
  const [changingStatus, setChangingStatus] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === a.status) return;
    setChangingStatus(true);
    try {
      const now = new Date().toISOString();
      const updates: Partial<ActivityType> = {
        status: newStatus,
        status_changed_at: now,
      };

      const historyEntry: ActivityStatusEntry = { status: newStatus, at: now };


      // Capture GPS location
      try {
        const pos = await getCurrentPosition();
        updates.status_change_lat = pos.latitude;
        updates.status_change_lng = pos.longitude;
        updates.location_lat = pos.latitude;
        updates.location_lng = pos.longitude;
        historyEntry.lat = pos.latitude;
        historyEntry.lng = pos.longitude;

        // Reverse geocode
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.latitude}&lon=${pos.longitude}&format=json`);
          const geo = await res.json();
          if (geo.display_name) {
            updates.location_address = geo.display_name;
            historyEntry.address = geo.display_name;
          }
        } catch {}
      } catch (geoErr) {
        console.warn("Geolocation failed:", geoErr);
        toast.error("Could not capture location. Status updated without location.");
      }

      // Set start/end time based on transition
      if (newStatus === "in_progress" && !a.start_time) {
        updates.start_time = now;
      } else if (newStatus === "completed") {
        updates.end_time = now;
      }

      updates.status_history = [...(a.status_history || []), historyEntry];

      const targetId = await getStatusUpdateTargetId(a, selectedDateStr);
      await updateActivity(targetId, updates);
      toast.success(`Status changed to ${statusLabels[newStatus]}`);
      onStatusChanged();

    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setChangingStatus(false);
    }
  };

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [editingComment, setEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState(a.description || "");
  const [savingComment, setSavingComment] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const entries = (a.photo_urls || []).slice(0, 6);
    if (entries.length === 0) { setPhotoUrls([]); return; }
    Promise.all(entries.map((p) => resolveActivityPhotoUrl(p.url).catch(() => "")))
      .then((urls) => { if (!cancelled) setPhotoUrls(urls.filter(Boolean)); });
    return () => { cancelled = true; };
  }, [a.photo_urls]);

  useEffect(() => { setCommentDraft(a.description || ""); }, [a.description]);

  const saveComment = async () => {
    setSavingComment(true);
    try {
      await updateActivity(a.id, { description: commentDraft.trim() || null });
      setEditingComment(false);
      onStatusChanged();
    } catch (err: any) {
      toast.error(err.message || "Failed to save comment");
    } finally {
      setSavingComment(false);
    }
  };

  const startAt = (a as any).check_in_at || a.start_time;
  const endAt = (a as any).check_out_at || a.end_time;
  const spentLabel = (() => {
    if (!startAt || !endAt) return null;
    const mins = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
    if (!Number.isFinite(mins) || mins < 0) return null;
    if (mins < 60) return `${mins} min spent`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m spent` : `${h}h spent`;
  })();

  const title = a.site_name ? `${a.activity_name} - ${a.site_name}` : a.activity_name;

  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1 cursor-pointer" onClick={() => onOpenDetails(a)}>
              {a.user_avatar_url ? (
                <img
                  src={a.user_avatar_url}
                  alt={a.user_full_name || "Owner"}
                  className="h-8 w-8 rounded-full object-cover shrink-0 border border-border"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-semibold text-primary">
                    {(a.user_full_name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="font-semibold text-sm break-words min-w-0">{title}</span>
            </div>

            {a.start_time && (
              <p className="text-xs text-muted-foreground ml-10 mt-0.5">
                <Clock className="h-3 w-3 inline mr-1" />
                {format(parseISO(a.start_time), "h:mm a")}
                {a.end_time && ` - ${format(parseISO(a.end_time), "h:mm a")}`}
              </p>
            )}

            {a.milestone_name && (
              <p className="text-xs text-muted-foreground ml-10 mt-0.5">
                🎯 {a.milestone_name}
                <span className="ml-1.5 text-[10px]">({milestoneStatusLabel(a.milestone_status)})</span>
              </p>
            )}

            {/* Editable comment */}
            <div className="ml-10 mt-1.5">
              {editingComment ? (
                <div className="space-y-1.5">
                  <Textarea
                    rows={3}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    className="text-xs"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={saveComment} disabled={savingComment}>
                      {savingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingComment(false); setCommentDraft(a.description || ""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingComment(true)}
                  className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/50 px-2.5 py-1.5"
                >
                  <span className="block text-[9px] font-semibold tracking-wide text-amber-700 dark:text-amber-500">COMMENT</span>
                  <span className="block text-xs text-foreground/80 break-words">
                    {a.description || <span className="text-muted-foreground italic">Add a comment…</span>}
                  </span>
                </button>
              )}
            </div>

            {/* Photos */}
            {photoUrls.length > 0 && (
              <div className="ml-10 mt-2 grid grid-cols-3 gap-1.5">
                {photoUrls.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt="Activity photo"
                    loading="lazy"
                    className="aspect-square w-full rounded-lg object-cover border border-border"
                  />
                ))}
              </div>
            )}

            {/* Audio attachments */}
            {a.attachment_urls && a.attachment_urls.length > 0 && a.attachment_urls.some((url: string) => url.includes("activity-audio")) && (
              <div className="ml-10 mt-1.5">
                {a.attachment_urls.filter((url: string) => url.includes("activity-audio")).map((url: string, idx: number) => (
                  <ActivityAudioPlayer key={idx} url={url} />
                ))}
              </div>
            )}

            {/* Status change location & timestamp */}
            {a.status_changed_at && (
              <p className="text-[10px] text-muted-foreground ml-10 mt-1.5">
                📍 Status updated {format(parseISO(a.status_changed_at), "h:mm a, MMM d")}
                {a.status_change_lat && a.status_change_lng && (
                  <span> • {Number(a.status_change_lat).toFixed(4)}, {Number(a.status_change_lng).toFixed(4)}</span>
                )}
                {a.user_full_name && <span> by {a.user_full_name}</span>}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Badge variant="outline" className={statusColors[a.status] || ""}>
              {statusLabels[a.status] || a.status}
            </Badge>
            {spentLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300 whitespace-nowrap">
                <Clock className="h-3 w-3" />{spentLabel}
              </span>
            )}
            {a.activity_type?.trim().toLowerCase().includes("grn") && (a as any).grn_po_id && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => onReceiveGoods((a as any).grn_po_id)}>
                <Route className="h-3.5 w-3.5" />
                Receive Goods
              </Button>
            )}
            {a.status === "planned" && (
              <Button size="sm" className="h-8 gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleStatusChange("in_progress")} disabled={changingStatus}>
                {changingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                Check-in
              </Button>
            )}
            {a.status === "in_progress" && (
              <Button size="sm" className="h-8 gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleStatusChange("completed")} disabled={changingStatus}>
                {changingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                Check-out
              </Button>
            )}
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
