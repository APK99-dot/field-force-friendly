import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Activity {
  id: string;
  user_id: string;
  activity_name: string;
  activity_type: string;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_type: string | null;
  from_date: string | null;
  to_date: string | null;
  total_days: number | null;
  total_hours: number | null;
  description: string | null;
  remarks: string | null;
  status: string;
  project_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  attachment_urls: string[];
  created_at: string;
  // joined
  user_full_name?: string;
  project_name?: string;
}

export interface ActivityFilters {
  employee: string;
  project: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const { toast } = useToast();

  const fetchActivities = useCallback(async (filters?: ActivityFilters) => {
    setLoading(true);
    try {
      let query = supabase
        .from("activity_events")
        .select("*")
        .order("activity_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (filters?.employee) query = query.eq("user_id", filters.employee);
      if (filters?.project) query = query.eq("project_id", filters.project);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.dateFrom) query = query.gte("activity_date", filters.dateFrom);
      if (filters?.dateTo) query = query.lte("activity_date", filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;

      // Fetch user names and project names
      const userIds = [...new Set((data || []).map((a: any) => a.user_id))];
      const projectIds = [...new Set((data || []).filter((a: any) => a.project_id).map((a: any) => a.project_id))];

      let userMap: Record<string, string> = {};
      let projectMap: Record<string, string> = {};

      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", userIds);
        (usersData || []).forEach((u: any) => { userMap[u.id] = u.full_name || u.id; });
      }

      if (projectIds.length > 0) {
        const { data: projData } = await supabase
          .from("pm_projects")
          .select("id, name")
          .in("id", projectIds);
        (projData || []).forEach((p: any) => { projectMap[p.id] = p.name; });
      }

      const mapped: Activity[] = (data || []).map((a: any) => ({
        ...a,
        attachment_urls: a.attachment_urls || [],
        user_full_name: userMap[a.user_id] || "",
        project_name: a.project_id ? projectMap[a.project_id] || "" : "",
      }));

      setActivities(mapped);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchDropdowns = useCallback(async () => {
    const [usersRes, projRes] = await Promise.all([
      supabase.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("pm_projects").select("id, name").eq("is_template", false).order("name"),
    ]);
    setUsers((usersRes.data || []).map((u: any) => ({ id: u.id, full_name: u.full_name || "" })));
    setProjects((projRes.data || []).map((p: any) => ({ id: p.id, name: p.name })));
  }, []);

  const createActivity = useCallback(async (activity: Partial<Activity>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase.from("activity_events").insert({
      user_id: user.id,
      activity_name: activity.activity_name!,
      activity_type: activity.activity_type!,
      activity_date: activity.activity_date!,
      start_time: activity.start_time || null,
      end_time: activity.end_time || null,
      duration_type: activity.duration_type || null,
      from_date: activity.from_date || null,
      to_date: activity.to_date || null,
      total_days: activity.total_days || null,
      total_hours: activity.total_hours || 0,
      description: activity.description || null,
      remarks: activity.remarks || null,
      status: activity.status || "planned",
      project_id: activity.project_id || null,
      location_lat: activity.location_lat || null,
      location_lng: activity.location_lng || null,
      location_address: activity.location_address || null,
      attachment_urls: activity.attachment_urls || [],
    });

    if (error) throw error;
    toast({ title: "Activity Created", description: "Activity logged successfully" });
  }, [toast]);

  const updateActivity = useCallback(async (id: string, updates: Partial<Activity>) => {
    const { error } = await supabase
      .from("activity_events")
      .update({
        activity_name: updates.activity_name,
        activity_type: updates.activity_type,
        activity_date: updates.activity_date,
        start_time: updates.start_time,
        end_time: updates.end_time,
        duration_type: updates.duration_type,
        total_hours: updates.total_hours,
        description: updates.description,
        remarks: updates.remarks,
        status: updates.status,
        project_id: updates.project_id,
        location_address: updates.location_address,
      })
      .eq("id", id);

    if (error) throw error;
    toast({ title: "Activity Updated" });
  }, [toast]);

  const deleteActivity = useCallback(async (id: string) => {
    const { error } = await supabase.from("activity_events").delete().eq("id", id);
    if (error) throw error;
    toast({ title: "Activity Deleted" });
  }, [toast]);

  useEffect(() => {
    fetchActivities();
    fetchDropdowns();
  }, [fetchActivities, fetchDropdowns]);

  return {
    activities,
    loading,
    users,
    projects,
    fetchActivities,
    createActivity,
    updateActivity,
    deleteActivity,
  };
}
