import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        // Bootstrap / fetch user record + role from DB
        const { data: userData, error: rpcError } = await supabase.rpc("ensure_current_user", {
          _email: user.email ?? "",
          _full_name: user.user_metadata?.full_name ?? null,
          _username: user.user_metadata?.username ?? null,
        });

        if (rpcError) {
          console.error("ensure_current_user error:", rpcError);
        }

        if (!cancelled && userData && userData.length > 0) {
          const u = userData[0];
          // Also fetch profile table for picture & phone
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, full_name, username, profile_picture_url, phone_number")
            .eq("id", user.id)
            .single();

          setProfile(profileData ?? {
            id: user.id,
            full_name: u.full_name,
            username: u.username,
            profile_picture_url: null,
            phone_number: null,
          });
          setRole(u.role);

          // Fetch the role name from the roles table via users.role_id
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
            if (!cancelled) setRoleName(roleRow?.name ?? null);
          }
        } else if (!cancelled) {
          // Fallback: read from profiles/user_roles directly
          const [profileRes, roleRes] = await Promise.all([
            supabase.from("profiles").select("id, full_name, username, profile_picture_url, phone_number").eq("id", user.id).single(),
            supabase.from("user_roles").select("role").eq("user_id", user.id).single(),
          ]);
          setProfile(profileRes.data);
          setRole(roleRes.data?.role ?? null);
        }

        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => { cancelled = true; };
  }, []);

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
    loading,
    initials,
  };
}
