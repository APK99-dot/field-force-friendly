import { useState, useCallback, useRef, useEffect } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import {
  Menu,
  ArrowLeft,
  Building2,
  LogOut,
  UserCheck,
  Navigation2,
  FolderKanban,
  Shield,
  AlertTriangle,
  Receipt,
  ClipboardList,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NavLink } from "@/components/NavLink";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { motion, AnimatePresence } from "framer-motion";

const navigationItems = [
  { icon: UserCheck, label: "Attendance", href: "/attendance", color: "from-blue-500 to-blue-600" },
  { icon: Navigation2, label: "GPS Track", href: "/gps-tracking", color: "from-purple-500 to-purple-600" },
  { icon: FolderKanban, label: "Projects", href: "/projects", color: "from-indigo-500 to-indigo-600" },
  { icon: Receipt, label: "Expenses", href: "/expenses", color: "from-orange-500 to-orange-600" },
  { icon: ClipboardList, label: "Activities", href: "/activities", color: "from-teal-500 to-teal-600" },
];

const adminItems = [
  { icon: Shield, label: "Admin Controls", href: "/admin-controls", color: "from-emerald-500 to-emerald-600" },
];

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const { profile, isAdmin, initials } = useUserProfile();
  const displayName = profile?.full_name || profile?.username || "";
  const menuRef = useRef<HTMLDivElement>(null);

  const showBackButton = location.pathname !== "/dashboard" && location.pathname !== "/";

  // Close menu on outside click
  useEffect(() => {
    if (!isMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isMenuOpen]);

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const handleMenuItemClick = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const handleBackClick = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  }, [navigate]);

  return (
    <>
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 gradient-hero text-primary-foreground shadow-lg">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showBackButton && (
                <button
                  onClick={handleBackClick}
                  className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <NavLink to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity text-primary-foreground">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden bg-white/90 p-0.5">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-base font-semibold">Bharath Builders</h1>
                </div>
              </NavLink>
            </div>

            <div className="flex items-center gap-1">
              <NotificationBell />
              <button
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Side Drawer Overlay + Panel */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => setIsMenuOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              ref={menuRef}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-[75vw] max-w-[320px] sm:w-[320px] bg-card shadow-elevated overflow-y-auto z-50"
            >
              {/* User Profile Section */}
              <div className="gradient-hero text-primary-foreground px-4 py-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      navigate("/more");
                      handleMenuItemClick();
                    }}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    <Avatar className="h-12 w-12 border-2 border-primary-foreground/30">
                      <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start">
                      <span className="text-lg font-bold">{displayName}</span>
                      <div className="flex items-center gap-1.5 text-xs opacity-90 mt-0.5">
                        <Shield className="h-3.5 w-3.5" />
                        <span className="font-medium">{isAdmin ? "Admin" : "User"}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setIsMenuOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-5">
                {/* Admin Controls */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">Admin Controls</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {adminItems.map((item) => (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        onClick={handleMenuItemClick}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                      >
                        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${item.color} shadow-md`}>
                          <item.icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>

                {/* Navigation Grid */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">Navigation</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {navigationItems.map((item) => (
                      <NavLink
                        key={item.label}
                        to={item.href}
                        onClick={handleMenuItemClick}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                      >
                        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${item.color} shadow-md`}>
                          <item.icon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>

                {/* Logout */}
                <div className="pt-2 border-t">
                  <button
                    onClick={() => setIsLogoutDialogOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center group-hover:bg-destructive/20 transition-colors">
                      <LogOut className="h-4 w-4 text-destructive" />
                    </div>
                    <span className="text-sm font-medium">Logout</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Logout Confirmation */}
      <AlertDialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Logout
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to log out? You will need to sign in again to access the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setIsLogoutDialogOpen(false);
                await supabase.auth.signOut();
                navigate("/auth");
              }}
            >
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
