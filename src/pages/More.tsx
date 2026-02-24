import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  MapPin,
  Shield,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  FileText,
  Users,
  BarChart3,
  Calendar,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const menuSections = [
  {
    title: "Admin",
    items: [
      { label: "User Management", icon: Users, to: "/admin/users" },
      { label: "Reports & Analytics", icon: BarChart3, to: "/admin/reports" },
      { label: "Leave Management", icon: Calendar, to: "/admin/leaves" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "My Profile", icon: User, to: "/profile" },
      { label: "GPS Day Tracking", icon: MapPin, to: "/gps-tracking" },
      { label: "Documents", icon: FileText, to: "/documents" },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "App Settings", icon: Settings, to: "/settings" },
      { label: "Privacy & Security", icon: Shield, to: "/privacy" },
      { label: "Help & Support", icon: HelpCircle, to: "/help" },
    ],
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export default function More() {
  const navigate = useNavigate();

  return (
    <motion.div
      className="p-4 space-y-4 max-w-2xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Profile Card */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-4">
            <Avatar className="h-14 w-14 border-2 border-primary/20">
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-lg">
                RK
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-bold text-base">Rajesh Kumar</h2>
              <p className="text-xs text-muted-foreground">Field Executive • Bangalore South</p>
              <p className="text-xs text-muted-foreground">rajesh.kumar@bharathbuilders.in</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Menu Sections */}
      {menuSections.map((section) => (
        <motion.div key={section.title} variants={item} className="space-y-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            {section.title}
          </h3>
          <Card className="shadow-card">
            <CardContent className="p-0 divide-y divide-border">
              {section.items.map((menuItem) => (
                <button
                  key={menuItem.label}
                  onClick={() => navigate(menuItem.to)}
                  className="w-full flex items-center justify-between p-3.5 hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                      <menuItem.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium">{menuItem.label}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      ))}

      {/* Logout */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardContent className="p-0">
            <button
              onClick={() => navigate("/auth")}
              className="w-full flex items-center gap-3 p-3.5 hover:bg-destructive/5 transition-colors rounded-lg"
            >
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <LogOut className="h-4 w-4 text-destructive" />
              </div>
              <span className="text-sm font-medium text-destructive">Sign Out</span>
            </button>
          </CardContent>
        </Card>
      </motion.div>

      <p className="text-center text-[10px] text-muted-foreground py-2">
        Bharath Builders v1.0 • Field Force Management
      </p>
    </motion.div>
  );
}
