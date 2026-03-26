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

export function useUserProfile(): UserProfileState {
  const { user } = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ["user-profile-full", user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Fire ensure_current_user + profile fetch in parallel
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

      // Fetch role name (non-blocking — we already have the critical data)
      let roleName: string | null = null;
      const { data: userRow } = await supabase
        .from("users")
        .select("role_id")
        .eq("id", user.id)
        .single();

      if (userRow?.role_id) {
        const { data: roleRow } = await supabase
          .from("roles")
          .select("name")
          .eq("id", userRow.role_id)
          .single();
        roleName = roleRow?.name ?? null;
      }

      return { profile, role, roleName };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const profile = data?.profile ?? null;
  const role = data?.role ?? null;
  const roleName = data?.roleName ?? null;

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
