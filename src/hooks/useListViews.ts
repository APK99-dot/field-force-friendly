import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";
import type { ListView } from "@/lib/procurementFields";

const ACTIVE_KEY = "procurement.activeListView";

function normalise(row: any): ListView {
  return {
    id: row.id,
    name: row.name,
    owner_id: row.owner_id,
    filters: row.filters && typeof row.filters === "object"
      ? { match: row.filters.match === "any" ? "any" : "all", conditions: Array.isArray(row.filters.conditions) ? row.filters.conditions : [] }
      : { match: "all", conditions: [] },
    columns: Array.isArray(row.columns) ? row.columns : [],
    sort_field: row.sort_field ?? null,
    sort_dir: row.sort_dir === "asc" ? "asc" : "desc",
    visibility: row.visibility ?? "private",
    shared_user_ids: row.shared_user_ids ?? [],
    is_default: !!row.is_default,
  };
}

export function useListViews() {
  const { userId } = useCurrentUser();
  const [views, setViews] = useState<ListView[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY) || null
  );

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("procurement_list_views")
      .select("*")
      .order("name");
    if (error) {
      setViews([]);
    } else {
      setViews((data || []).map(normalise));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fall back to a pinned default the first time.
  useEffect(() => {
    if (loading || activeId) return;
    const pinned = views.find((v) => v.is_default && v.owner_id === userId);
    if (pinned) selectView(pinned.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, views, userId]);

  const selectView = (id: string | null) => {
    setActiveId(id);
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  };

  const activeView = views.find((v) => v.id === activeId) || null;

  const saveView = async (view: Partial<ListView> & { name: string }) => {
    const payload: any = {
      name: view.name.trim(),
      filters: view.filters ?? { match: "all", conditions: [] },
      columns: view.columns ?? [],
      sort_field: view.sort_field ?? null,
      sort_dir: view.sort_dir ?? "desc",
      visibility: view.visibility ?? "private",
      shared_user_ids: view.visibility === "selected" ? (view.shared_user_ids ?? []) : [],
      is_default: !!view.is_default,
    };
    if (view.id) {
      const { error } = await supabase.from("procurement_list_views").update(payload).eq("id", view.id);
      if (error) { toast.error(error.message); return null; }
      toast.success("View updated");
      await load();
      selectView(view.id);
      return view.id;
    }
    payload.owner_id = userId;
    const { data, error } = await supabase
      .from("procurement_list_views").insert(payload).select("id").single();
    if (error) { toast.error(error.message); return null; }
    toast.success("View created");
    await load();
    selectView(data.id);
    return data.id as string;
  };

  const deleteView = async (id: string) => {
    const { error } = await supabase.from("procurement_list_views").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("View deleted");
    if (activeId === id) selectView(null);
    await load();
  };

  const pinDefault = async (id: string | null) => {
    if (!userId) return;
    await supabase.from("procurement_list_views").update({ is_default: false }).eq("owner_id", userId);
    if (!id) {
      toast.success("All Requisitions is now the default view");
      await load();
      return;
    }
    const { error } = await supabase.from("procurement_list_views").update({ is_default: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pinned as default view");
    await load();
  };

  return { views, activeView, activeId, selectView, saveView, deleteView, pinDefault, loading, reload: load, userId };
}
