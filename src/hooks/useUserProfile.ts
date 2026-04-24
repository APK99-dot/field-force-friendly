import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
  phone_number: string | null;
}

interface UserProfileState {
  profile: UserProfile | null;
  role: string | null;
  roleName: string | null;
  isAdmin: boolean;
  loading: boolean;
  initials: string;
}

const PROFILE_CACHE_KEY = "user_profile_cache_v1";

function readCache(userId: string | undefined): { profile: UserProfile; role: string } | undefined {
  if (!userId) return undefined;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed?.userId !== userId) return undefined;
    return { profile: parsed.profile, role: parsed.role };
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, profile: UserProfile, role: string) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile, role }));
  } catch { /* quota */ }
}

export function useUserProfile(): UserProfileState {
  const { user } = useCurrentUser();
  const cached = readCache(user?.id);

  // Primary query — only the data needed for first paint (name, avatar, role flag)
  const { data, isLoading } = useQuery({
    queryKey: ["user-profile-core", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const [rpcRes, profileRes] = await Promise.all([
        supabase.rpc("ensure_current_user", {
          _email: user.email ?? "",
          _full_name: null,
          _username: null,
        }),
        supabase
          .from("profiles")
          .select("id, full_name, username, profile_picture_url, phone_number")
          .eq("id", user.id)
          .single(),
      ]);

      const rpcData = rpcRes.data;
      const profile: UserProfile = profileRes.data ?? {
        id: user.id,
        full_name: rpcData?.[0]?.full_name ?? null,
        username: rpcData?.[0]?.username ?? null,
        profile_picture_url: null,
        phone_number: null,
      };

      const role = rpcData?.[0]?.role ?? "user";
      writeCache(user.id, profile, role);
      return { profile, role };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    initialData: cached,
  });

  // Secondary query — role display name (not blocking dashboard render)
  const { data: roleNameData } = useQuery({
    queryKey: ["user-role-name", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: userRow } = await supabase
        .from("users")
        .select("role_id, roles(name)")
        .eq("id", user.id)
        .single();
      const roles = (userRow as { roles?: { name?: string } | null } | null)?.roles;
      return roles?.name ?? null;
    },
    enabled: !!user,
    staleTime: 30 * 60 * 1000,
  });

  const profile = data?.profile ?? null;
  const role = data?.role ?? null;
  const roleName = roleNameData ?? null;

  const displayName = profile?.full_name || profile?.username || "";
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  return {
    profile,
    role,
    roleName,
    isAdmin: role === "admin",
    loading: isLoading,
    initials,
  };
}
