import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  CalendarDays,
  DollarSign,
  Lock,
  Building2,
  ArrowLeft,
  Search,
  FolderKanban,
} from "lucide-react";

const adminModules = [
  {
    title: "User Management",
    description: "Manage user accounts, roles, and permissions",
    icon: Users,
    color: "bg-orange-100 text-orange-600",
    path: "/admin/users",
  },
  {
    title: "Projects",
    description: "Manage projects, tasks, sprints, and timelines.",
    icon: FolderKanban,
    color: "bg-blue-100 text-blue-600",
    path: "/projects",
  },
  {
    title: "Attendance Management",
    description: "Manage user attendance, holidays, and leave approvals",
    icon: CalendarDays,
    color: "bg-purple-100 text-purple-600",
    path: "/admin/attendance",
  },
  {
    title: "Expense Management",
    description: "Track team productivity and expense analytics",
    icon: DollarSign,
    color: "bg-yellow-100 text-yellow-600",
    path: "/admin/expenses",
  },
  {
    title: "Security & Access",
    description: "Manage user profiles, permissions, and data access control",
    icon: Lock,
    color: "bg-blue-100 text-blue-600",
    path: "/admin/security",
  },
  {
    title: "Company Profile",
    description: "Manage company details, bank information, and header branding",
    icon: Building2,
    color: "bg-indigo-100 text-indigo-600",
    path: "/admin/company",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function AdminControls() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredModules = adminModules.filter(
    (m) =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      className="p-4 space-y-6 max-w-6xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Admin Controls</h1>
          <p className="text-sm text-muted-foreground">Manage different aspects of your system</p>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div variants={item} className="max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search admin modules..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Module Grid */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModules.map((module) => {
          const Icon = module.icon;
          return (
            <Card
              key={module.path}
              className="cursor-pointer hover:shadow-elevated transition-shadow"
              onClick={() => navigate(module.path)}
            >
              <CardHeader className="text-center pb-2">
                <div className={`mx-auto mb-3 p-4 rounded-full w-16 h-16 flex items-center justify-center ${module.color}`}>
                  <Icon className="h-7 w-7" />
                </div>
                <CardTitle className="text-base">{module.title}</CardTitle>
                <CardDescription className="text-xs">{module.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}

        {filteredModules.length === 0 && (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground text-sm">
              No modules found matching "{searchQuery}"
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
