import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UomRow {
  id: string;
  uom_name: string;
  uom_code: string | null;
  is_active: boolean;
}

/**
 * Fetches active UOM names from the master_uom table (single source of truth).
 * Optionally include a currently-selected value that may be inactive/legacy so it
 * still shows in the dropdown.
 */
export function useUomOptions(includeValue?: string | null) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("master_uom")
      .select("uom_name")
      .eq("is_active", true)
      .order("uom_name");
    setOptions((data || []).map((r: any) => r.uom_name as string));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const withValue =
    includeValue && !options.includes(includeValue) ? [includeValue, ...options] : options;

  return { options: withValue, loading, refetch: fetchOptions };
}
