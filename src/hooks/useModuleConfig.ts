import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";
import { useUserProfile } from "./useUserProfile";
import { useAppConfiguration } from "./useAppConfiguration";

/**
 * Convenience hook for reading saved configuration and enforcing it in feature
 * modules. Wraps useAppConfiguration with role-scope helpers so components can
 * hide/disable UI based on the admin-defined toggles.
 *
 * Scope values used across config:
 *  - "all"           → everyone
 *  - "admin_manager" → admins and managers (users who have subordinates)
 *  - "admin"         → admins only
 */
export function useModuleConfig(module: string) {
  const { getValue, isLoading } = useAppConfiguration();
  const { isAdmin } = useUserProfile();
  const { userId } = useCurrentUser();

  // A user is treated as a "manager" if anyone reports to them.
  const { data: isManager = false } = useQuery({
    queryKey: ["is-manager", userId],
    enabled: !!userId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return false;
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("reporting_manager_id", userId)
        .eq("is_active", true);
      return (count ?? 0) > 0;
    },
  });

  function get<T = unknown>(key: string): T {
    return getValue<T>(module, key);
  }

  function bool(key: string): boolean {
    return Boolean(getValue<boolean>(module, key));
  }

  function num(key: string): number {
    return Number(getValue<number>(module, key));
  }

  function str(key: string): string {
    return String(getValue<string>(module, key) ?? "");
  }

  /** Whether the current user satisfies a permission-scope value. */
  function canByScope(scope: string | undefined): boolean {
    if (!scope || scope === "all") return true;
    if (scope === "admin") return isAdmin;
    if (scope === "admin_manager") return isAdmin || isManager;
    return true;
  }

  /** Read a scope key and evaluate it against the current user. */
  function canDo(key: string): boolean {
    return canByScope(str(key));
  }

  return { get, bool, num, str, canByScope, canDo, isAdmin, isManager, isLoading };
}
