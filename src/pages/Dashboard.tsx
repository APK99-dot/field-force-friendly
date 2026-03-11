import { useState, useEffect } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  Clock,
  CheckCircle,
  LogIn,
  ListTodo,
  CalendarOff,
  Receipt,
  CheckSquare,
  Loader,
  Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useDashboard } from "@/hooks/useDashboard";
import { useProfilePermissions } from "@/hooks/useProfilePermissions";
import { supabase } from "@/integrations/supabase/client";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning!";
  if (hour < 18) return "Good Afternoon!";
  return "Good Evening!";
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, isAdmin, initials } = useUserProfile();
  const { hasModuleAccess } = useProfilePermissions();
  const [userId, setUserId] = useState<string>();
  const displayName = profile?.full_name || profile?.username || "";

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const {
    dayStarted,
    attendance,
    activeProjects,
    myTasks,
    pendingLeaves,
    pendingExpenses,
  } = useDashboard(userId);

  const handleStartDay = () => {
    navigate("/attendance");
  };

  const overviewCards = [
    { label: "My Tasks", value: myTasks.total, icon: ListTodo, colorClass: "bg-info/5 text-info", path: "/projects", module: null },
    { label: "Completed", value: myTasks.completed, icon: CheckSquare, colorClass: "bg-success/5 text-success", path: "/projects", module: null },
    { label: "In Progress", value: myTasks.inProgress, icon: Loader, colorClass: "bg-warning/5 text-warning", path: "/projects", module: null },
    { label: "Pending Leaves", value: pendingLeaves, icon: CalendarOff, colorClass: "bg-accent/5 text-accent", path: "/attendance", module: "module_attendance" },
    { label: "Pending Expenses", value: pendingExpenses.count, icon: Receipt, colorClass: "bg-destructive/5 text-destructive", path: "/expenses", module: "module_expenses" },
  ];

  const visibleCards = overviewCards.filter((c) => !c.module || hasModuleAccess(c.module));

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header with gradient */}
      <div className="relative overflow-hidden gradient-hero text-primary-foreground">
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent" />
        <div className="relative p-4">
          <div className="flex items-center">
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate("/more")}
            >
              <Avatar className="h-10 w-10 border-2 border-white/30">
                {profile?.profile_picture_url ? (
                  <AvatarImage src={profile.profile_picture_url} alt="Profile" />
                ) : null}
                <AvatarFallback className="bg-white/20 text-primary-foreground font-bold text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-[10px] opacity-80">{getGreeting()}</p>
                <h1 className="text-base font-bold leading-tight">{displayName}</h1>
                <p className="text-[10px] opacity-70">{isAdmin ? "Admin" : "Team Member"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <motion.div
        className="p-4 -mt-3 relative z-10 space-y-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Check-in Status Banner */}
        {hasModuleAccess("module_attendance") && (
          <motion.div variants={item}>
            {!dayStarted ? (
              <Card className="bg-gradient-to-r from-accent/20 to-accent/10 border-accent/30">
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Day Not Started</p>
                      <p className="text-xs text-muted-foreground">
                        Start your day by marking attendance
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleStartDay}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Start My Day
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="bg-gradient-to-r from-success/10 to-success/5 border-success/20">
                <div className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-success" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-success">Day Started</p>
                    <p className="text-xs text-muted-foreground">
                      {attendance?.check_in_time
                        ? format(new Date(attendance.check_in_time), "h:mm a")
                        : ""}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {/* Module Stats Grid */}
        <motion.div variants={item}>
          <Card className="shadow-card">
            <CardContent className="p-4">
              <p className="text-sm font-bold mb-4">Overview</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {visibleCards.map((card) => (
                  <div
                    key={card.label}
                    className={`rounded-xl border border-border ${card.colorClass.split(" ")[0]} p-4 text-center cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => navigate(card.path)}
                  >
                    <card.icon className={`h-5 w-5 mx-auto mb-1 ${card.colorClass.split(" ")[1]}`} />
                    <p className="text-xl font-bold">{card.value}</p>
                    <p className="text-[10px] text-muted-foreground">{card.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
