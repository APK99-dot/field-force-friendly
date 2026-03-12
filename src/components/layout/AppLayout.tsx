import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { supabase } from "@/integrations/supabase/client";
import ProfileSetupModal from "@/components/ProfileSetupModal";
import PWAInstallBanner from "@/components/PWAInstallBanner";

export function AppLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null | undefined>(undefined);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        // Check remember-me expiry
        const expiresAt = localStorage.getItem("remember_me_expires");
        if (expiresAt && Date.now() > Number(expiresAt)) {
          localStorage.removeItem("remember_me_expires");
          supabase.auth.signOut().then(() => navigate("/auth", { replace: true }));
          return;
        }
        setReady(true);
        setUserId(session.user.id);
        supabase.from("profiles").select("profile_picture_url, onboarding_completed").eq("id", session.user.id).single()
          .then(({ data }) => {
            setProfilePictureUrl(data?.profile_picture_url ?? null);
            setOnboardingCompleted(data?.onboarding_completed ?? false);
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

  const showProfileSetup = userId && onboardingCompleted === false && profilePictureUrl === null;

  return (
    <div className="min-h-screen flex flex-col w-full max-w-full bg-background overflow-x-hidden">
      <AppHeader />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
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
