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
  isAdmin: boolean;
  loading: boolean;
  initials: string;
}

export function useUserProfile(): UserProfileState {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const [profileRes, roleRes] = await Promise.all([
          supabase.from("profiles").select("id, full_name, username, profile_picture_url, phone_number").eq("id", user.id).single(),
          supabase.from("user_roles").select("role").eq("user_id", user.id).single(),
        ]);

        if (!cancelled) {
          setProfile(profileRes.data);
          setRole(roleRes.data?.role ?? "user");
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  const displayName = profile?.full_name || profile?.username || "User";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return {
    profile,
    role,
    isAdmin: role === "admin",
    loading,
    initials,
  };
}
