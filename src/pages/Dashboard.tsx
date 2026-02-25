import { useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  MapPin,
  Clock,
  Users,
  CheckCircle,
  TrendingUp,
  UserPlus,
  Zap,
  LogIn,
  Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useUserProfile } from "@/hooks/useUserProfile";

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

// Mock data
const beatProgress = {
  planned: 0,
  productive: 0,
  remaining: 0,
  newRetailers: 0,
  revenueAchieved: 0,
  points: 0,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [dayStarted, setDayStarted] = useState(false);
  const { profile, isAdmin, initials } = useUserProfile();
  const displayName = profile?.full_name || profile?.username || "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Header with gradient */}
      <div className="relative overflow-hidden gradient-hero text-primary-foreground">
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent" />
        <div className="relative p-4">
          <div className="flex items-center justify-between">
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
                <p className="text-[10px] opacity-70">{isAdmin ? "Admin" : "Field Executive"}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-0 h-9 px-3"
              onClick={() => {}}
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="text-xs">Quick Add</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <motion.div
        className="p-4 -mt-3 relative z-10 space-y-4 max-w-2xl mx-auto"
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
                  onClick={() => {
                    setDayStarted(true);
                    navigate("/attendance");
                  }}
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
                    {format(new Date(), "h:mm a")}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </motion.div>

        {/* Today's Beat Card */}
        <motion.div variants={item}>
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold">Not Planned</p>
                  <p className="text-xs text-muted-foreground">No beat planned</p>
                </div>
              </div>

              {/* Stats Grid - 3x2 like QuickApp */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-card p-3 text-center">
                  <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xl font-bold">{beatProgress.planned}</p>
                  <p className="text-[10px] text-muted-foreground">Planned</p>
                </div>
                <div className="rounded-xl border border-border bg-success/5 p-3 text-center">
                  <CheckCircle className="h-5 w-5 mx-auto mb-1 text-success" />
                  <p className="text-xl font-bold">{beatProgress.productive}</p>
                  <p className="text-[10px] text-muted-foreground">Productive</p>
                </div>
                <div className="rounded-xl border border-border bg-accent/5 p-3 text-center">
                  <Clock className="h-5 w-5 mx-auto mb-1 text-accent" />
                  <p className="text-xl font-bold">{beatProgress.remaining}</p>
                  <p className="text-[10px] text-muted-foreground">Remaining</p>
                </div>
                <div className="rounded-xl border border-border bg-info/5 p-3 text-center">
                  <UserPlus className="h-5 w-5 mx-auto mb-1 text-info" />
                  <p className="text-xl font-bold">{beatProgress.newRetailers}</p>
                  <p className="text-[10px] text-muted-foreground">New Retailers</p>
                </div>
                <div className="rounded-xl border border-border bg-primary/5 p-3 text-center">
                  <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-xl font-bold">₹{beatProgress.revenueAchieved.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">Revenue</p>
                </div>
                <div className="rounded-xl border border-border bg-accent/5 p-3 text-center">
                  <Zap className="h-5 w-5 mx-auto mb-1 text-accent" />
                  <p className="text-xl font-bold">{beatProgress.points}</p>
                  <p className="text-[10px] text-muted-foreground">Points</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
