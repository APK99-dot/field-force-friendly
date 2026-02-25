import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { supabase } from "@/integrations/supabase/client";

export function AppLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
      } else {
        setReady(true);
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

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <AppHeader />
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
