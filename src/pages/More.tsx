import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Shield,
  Clock,
  Car,
  Navigation2,
  Receipt,
  FolderKanban,
  MapPin,
  LogOut,
  ChevronRight,
  Search,
  Settings,
  User,
  Users,
  HelpCircle,
  FileText,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";

const adminItems = [
  { icon: Shield, label: "Admin Controls", href: "/admin-controls", color: "from-emerald-500 to-emerald-600" },
];

const navigationItems = [
  { icon: Clock, label: "Attendance", href: "/attendance", color: "from-blue-500 to-blue-600" },
  { icon: Car, label: "Visit", href: "/visits", color: "from-green-500 to-green-600" },
  { icon: Navigation2, label: "GPS Track", href: "/gps-tracking", color: "from-purple-500 to-purple-600" },
  { icon: Receipt, label: "Expenses", href: "/expenses", color: "from-indigo-500 to-indigo-600" },
  { icon: FolderKanban, label: "Projects", href: "/projects", color: "from-sky-500 to-sky-600" },
];

const accountItems = [
  { label: "My Profile", icon: User, to: "/profile" },
  { label: "Documents", icon: FileText, to: "/documents" },
  { label: "App Settings", icon: Settings, to: "/settings" },
  { label: "Help & Support", icon: HelpCircle, to: "/help" },
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
      className="space-y-0"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* User Profile Header */}
      <motion.div variants={item} className="gradient-hero text-primary-foreground p-6 rounded-b-2xl">
        <div
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate("/profile")}
        >
          <Avatar className="h-12 w-12 border-2 border-white/30">
            <AvatarFallback className="bg-white/20 text-primary-foreground font-bold">
              A
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-bold">Alice</h2>
            <div className="flex items-center gap-1.5 text-xs opacity-80">
              <Shield className="h-3.5 w-3.5" />
              <span>Admin</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="p-4 space-y-6">
        {/* Admin Controls Section */}
        <motion.div variants={item}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">Admin Controls</h3>
          <div className="grid grid-cols-3 gap-3">
            {adminItems.map((navItem) => (
              <NavLink
                key={navItem.href}
                to={navItem.href}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${navItem.color} shadow-md`}>
                  <navItem.icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs font-medium text-center leading-tight">{navItem.label}</span>
              </NavLink>
            ))}
          </div>
        </motion.div>

        {/* Navigation Section */}
        <motion.div variants={item}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground px-1">Navigation</h3>
            <div className="flex items-center gap-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Settings className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {navigationItems.map((navItem) => (
              <NavLink
                key={navItem.href}
                to={navItem.href}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${navItem.color} shadow-md`}>
                  <navItem.icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs font-medium text-center leading-tight">{navItem.label}</span>
              </NavLink>
            ))}
          </div>
        </motion.div>

        {/* Account Settings */}
        <motion.div variants={item} className="space-y-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Account
          </h3>
          <Card className="shadow-card">
            <CardContent className="p-0 divide-y divide-border">
              {accountItems.map((menuItem) => (
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
      </div>
    </motion.div>
  );
}
