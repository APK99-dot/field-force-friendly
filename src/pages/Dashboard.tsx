import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  MapPin,
  Clock,
  Receipt,
  CheckCircle2,
  TrendingUp,
  Calendar,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const quickActions = [
  { label: "Check In", icon: Clock, color: "bg-success text-success-foreground" },
  { label: "Plan Visit", icon: MapPin, color: "bg-primary text-primary-foreground" },
  { label: "Submit Expense", icon: Receipt, color: "bg-accent text-accent-foreground" },
];

const activities = [
  { text: "Checked in at Site Alpha", time: "9:02 AM", icon: CheckCircle2, status: "success" },
  { text: "Visit to Metro Hardware completed", time: "11:30 AM", icon: MapPin, status: "info" },
  { text: "Expense claim ₹1,250 submitted", time: "1:15 PM", icon: Receipt, status: "warning" },
  { text: "Beat plan updated for tomorrow", time: "3:45 PM", icon: Calendar, status: "muted" },
];

export default function Dashboard() {
  const today = format(new Date(), "EEEE, MMMM d");

  return (
    <motion.div
      className="p-4 space-y-5 max-w-2xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Greeting banner */}
      <motion.div variants={item} className="gradient-hero rounded-xl p-5 text-primary-foreground">
        <p className="text-sm opacity-80">{today}</p>
        <h1 className="text-xl font-bold mt-1">Good Morning, Rajesh!</h1>
        <p className="text-sm opacity-70 mt-1">You have 4 visits planned today</p>
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={item} className="grid grid-cols-3 gap-3">
        {quickActions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            className="h-auto flex-col gap-2 py-4 border-border hover:shadow-elevated transition-shadow"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${action.color}`}>
              <action.icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium">{action.label}</span>
          </Button>
        ))}
      </motion.div>

      {/* Today's Summary */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Today's Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="text-xs text-muted-foreground">Attendance</p>
                <p className="text-sm font-semibold text-success">Checked In</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Visits</p>
                <p className="text-sm font-semibold">2 / 4</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-accent/10">
              <AlertCircle className="h-5 w-5 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-sm font-semibold">3 Approvals</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-info/10">
              <TrendingUp className="h-5 w-5 text-info" />
              <div>
                <p className="text-xs text-muted-foreground">Target</p>
                <p className="text-sm font-semibold">72%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Target Progress */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Monthly Target</CardTitle>
              <Badge variant="secondary" className="text-xs">Feb 2026</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">Visits Completed</span>
                <span className="font-semibold">54 / 75</span>
              </div>
              <Progress value={72} className="h-2.5" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">Revenue Target</span>
                <span className="font-semibold">₹8.4L / ₹12L</span>
              </div>
              <Progress value={70} className="h-2.5" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">New Retailers</span>
                <span className="font-semibold">7 / 10</span>
              </div>
              <Progress value={70} className="h-2.5" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Activity */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {activities.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  a.status === "success" ? "bg-success/10 text-success" :
                  a.status === "info" ? "bg-info/10 text-info" :
                  a.status === "warning" ? "bg-accent/10 text-accent" :
                  "bg-muted text-muted-foreground"
                }`}>
                  <a.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{a.text}</p>
                  <p className="text-xs text-muted-foreground">{a.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
