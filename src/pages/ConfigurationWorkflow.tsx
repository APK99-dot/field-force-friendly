import { useState } from "react";
import { motion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SlidersHorizontal,
  Activity,
  Building2,
  ShoppingCart,
  PackageCheck,
  Wallet,
  CalendarDays,
  Clock,
  FileBarChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ModulePanel } from "@/components/config/panels";

const MODULES = [
  { id: "activities", label: "Activities", icon: Activity },
  { id: "projects", label: "Projects / Sites", icon: Building2 },
  { id: "procurement", label: "Procurement", icon: ShoppingCart },
  { id: "goods_receipt", label: "Goods Receipt", icon: PackageCheck },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "leave", label: "Leave", icon: CalendarDays },
  { id: "attendance", label: "Attendance", icon: Clock },
  { id: "reports", label: "Reports", icon: FileBarChart },
];

export default function ConfigurationWorkflow() {
  const { isAdmin, loading } = useUserProfile();
  const [activeModule, setActiveModule] = useState("activities");
  const [tab, setTab] = useState<"config" | "approval">("config");

  if (loading) {
    return (
      <div className="p-4 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/admin" replace />;

  const current = MODULES.find((m) => m.id === activeModule)!;

  return (
    <motion.div className="space-y-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="gradient-hero px-4 safe-top-20 pb-6 -mx-4 -mt-4 md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <SlidersHorizontal className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Configuration & Approval Workflow</h1>
            <p className="text-sm text-white/70">Control every module's settings, features and approval flows</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 md:px-4 pt-4 md:pt-5">
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          {/* Sidebar */}
          <Card className="border-border/60 h-fit">
            <CardContent className="p-2">
              <nav className="flex md:flex-col gap-1 overflow-x-auto">
                {MODULES.map((m) => {
                  const Icon = m.icon;
                  const active = m.id === activeModule;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setActiveModule(m.id);
                        setTab("config");
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left whitespace-nowrap transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {m.label}
                    </button>
                  );
                })}
              </nav>
            </CardContent>
          </Card>

          {/* Panel */}
          <Card className="border-border/60">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-center gap-2 mb-4">
                <current.icon className="h-5 w-5 text-foreground" />
                <h2 className="text-lg font-semibold">{current.label}</h2>
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as "config" | "approval")}>
                <TabsList className="mb-4">
                  <TabsTrigger value="config">Configuration</TabsTrigger>
                  <TabsTrigger value="approval">Approval Workflow</TabsTrigger>
                </TabsList>
                <TabsContent value="config">
                  <ModulePanel module={activeModule} tab="config" />
                </TabsContent>
                <TabsContent value="approval">
                  <ModulePanel module={activeModule} tab="approval" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
