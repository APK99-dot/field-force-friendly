import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { supabase } from "@/integrations/supabase/client";
import ProfileSetupModal from "@/components/ProfileSetupModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { useNativeStartup } from "@/hooks/useNativeStartup";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// Keys of caches scoped to the signed-in user. Must be cleared on user change.
const USER_SCOPED_CACHE_KEYS = [
  "user_profile_cache_v1",
  "dashboard_cache_v1",
];

function clearUserScopedCaches() {
  try {
    USER_SCOPED_CACHE_KEYS.forEach((k) => localStorage.removeItem(k));
    // Sweep any other per-user caches we may add later
    Object.keys(localStorage)
      .filter((k) => k.endsWith("_cache_v1") || k.startsWith("nav_prefs_"))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lastUserIdRef = useRef<string | null>(null);
  useNativeStartup();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null | undefined>(undefined);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  usePushNotifications(userId ?? undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        const expiresAt = localStorage.getItem("remember_me_expires");
        if (expiresAt && Date.now() > Number(expiresAt)) {
          localStorage.removeItem("remember_me_expires");
          supabase.auth.signOut().then(() => navigate("/auth", { replace: true }));
          return;
        }
        setReady(true);
        setUserId(session.user.id);
        supabase.from("profiles").select("profile_picture_url, onboarding_completed, must_change_password").eq("id", session.user.id).single()
          .then(({ data }) => {
            setProfilePictureUrl(data?.profile_picture_url ?? null);
            setOnboardingCompleted(data?.onboarding_completed ?? false);
            setMustChangePassword((data as any)?.must_change_password ?? false);
          });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!ready) return null;

  const showPasswordChange = userId && mustChangePassword;
  const showProfileSetup = userId && !mustChangePassword && onboardingCompleted === false && profilePictureUrl === null;

  return (
    <div className="min-h-screen flex flex-col w-full max-w-full bg-background overflow-x-hidden">
      <AppHeader />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      {showPasswordChange && (
        <ChangePasswordModal
          userId={userId}
          onComplete={() => setMustChangePassword(false)}
        />
      )}
      {showProfileSetup && (
        <ProfileSetupModal
          userId={userId}
          profilePictureUrl={profilePictureUrl}
          onComplete={() => {
            setOnboardingCompleted(true);
            supabase.from("profiles").select("profile_picture_url").eq("id", userId).single()
              .then(({ data }) => setProfilePictureUrl(data?.profile_picture_url ?? null));
          }}
        />
      )}
      <PWAInstallBanner />
    </div>
  );
}
