import { useState, useEffect } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  Clock,
  CheckCircle,
  LogIn,
  Plus,
  FolderOpen,
  ListTodo,
  CalendarOff,
  Receipt,
  CheckSquare,
  Loader,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useDashboard } from "@/hooks/useDashboard";
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

        {/* Module Stats Grid */}
        <motion.div variants={item}>
          <Card className="shadow-card">
            <CardContent className="p-4">
              <p className="text-sm font-bold mb-4">Overview</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div
                  className="rounded-xl border border-border bg-primary/5 p-4 text-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate("/projects")}
                >
                  <FolderOpen className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-xl font-bold">{activeProjects}</p>
                  <p className="text-[10px] text-muted-foreground">Active Projects</p>
                </div>
                <div
                  className="rounded-xl border border-border bg-info/5 p-4 text-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate("/projects")}
                >
                  <ListTodo className="h-5 w-5 mx-auto mb-1 text-info" />
                  <p className="text-xl font-bold">{myTasks.total}</p>
                  <p className="text-[10px] text-muted-foreground">My Tasks</p>
                </div>
                <div
                  className="rounded-xl border border-border bg-success/5 p-4 text-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate("/projects")}
                >
                  <CheckSquare className="h-5 w-5 mx-auto mb-1 text-success" />
                  <p className="text-xl font-bold">{myTasks.completed}</p>
                  <p className="text-[10px] text-muted-foreground">Completed</p>
                </div>
                <div
                  className="rounded-xl border border-border bg-warning/5 p-4 text-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate("/projects")}
                >
                  <Loader className="h-5 w-5 mx-auto mb-1 text-warning" />
                  <p className="text-xl font-bold">{myTasks.inProgress}</p>
                  <p className="text-[10px] text-muted-foreground">In Progress</p>
                </div>
                <div
                  className="rounded-xl border border-border bg-accent/5 p-4 text-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate("/attendance")}
                >
                  <CalendarOff className="h-5 w-5 mx-auto mb-1 text-accent" />
                  <p className="text-xl font-bold">{pendingLeaves}</p>
                  <p className="text-[10px] text-muted-foreground">Pending Leaves</p>
                </div>
                <div
                  className="rounded-xl border border-border bg-destructive/5 p-4 text-center cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate("/expenses")}
                >
                  <Receipt className="h-5 w-5 mx-auto mb-1 text-destructive" />
                  <p className="text-xl font-bold">{pendingExpenses.count}</p>
                  <p className="text-[10px] text-muted-foreground">Pending Expenses</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
