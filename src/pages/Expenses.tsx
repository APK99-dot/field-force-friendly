import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Plus, Car, Utensils, Hotel, Package, Receipt, ChevronRight } from "lucide-react";

const categoryIcons: Record<string, any> = {
  Travel: Car,
  Food: Utensils,
  Accommodation: Hotel,
  Miscellaneous: Package,
};

const categoryColors: Record<string, string> = {
  Travel: "bg-info/10 text-info",
  Food: "bg-accent/10 text-accent",
  Accommodation: "bg-primary/10 text-primary",
  Miscellaneous: "bg-muted text-muted-foreground",
};

const expenses = [
  { id: 1, date: "Feb 24", category: "Travel", desc: "Auto fare — Site Alpha to BuildMart", amount: 350, status: "pending" },
  { id: 2, date: "Feb 24", category: "Food", desc: "Lunch at MG Road", amount: 180, status: "pending" },
  { id: 3, date: "Feb 23", category: "Travel", desc: "Bus fare — round trip Jayanagar", amount: 120, status: "approved" },
  { id: 4, date: "Feb 23", category: "Food", desc: "Tea & snacks with client", amount: 90, status: "approved" },
  { id: 5, date: "Feb 22", category: "Miscellaneous", desc: "Printout & courier charges", amount: 250, status: "rejected" },
];

const statusBadge: Record<string, string> = {
  pending: "bg-accent/10 text-accent border-accent/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export default function Expenses() {
  return (
    <motion.div
      className="p-4 space-y-4 max-w-2xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Expenses</h1>
          <p className="text-xs text-muted-foreground">February 2026</p>
        </div>
        <Button size="sm" className="gradient-accent text-accent-foreground">
          <Plus className="h-4 w-4 mr-1" /> Add Expense
        </Button>
      </motion.div>

      {/* Monthly Summary */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Claimed</span>
              <span className="text-lg font-bold">₹4,890</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Approved</span>
              <span className="text-success font-medium">₹3,210</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pending</span>
              <span className="text-accent font-medium">₹1,430</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rejected</span>
              <span className="text-destructive font-medium">₹250</span>
            </div>
            <Progress value={66} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">66% of monthly limit used</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Category Breakdown */}
      <motion.div variants={item} className="grid grid-cols-4 gap-2">
        {Object.entries(categoryIcons).map(([cat, Icon]) => (
          <Card key={cat} className="shadow-card">
            <CardContent className="p-3 text-center">
              <div className={`w-9 h-9 rounded-full mx-auto flex items-center justify-center ${categoryColors[cat]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-[10px] font-medium mt-1.5">{cat}</p>
              <p className="text-xs font-bold mt-0.5">
                ₹{cat === "Travel" ? "470" : cat === "Food" ? "270" : cat === "Accommodation" ? "0" : "250"}
              </p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Expense List */}
      <motion.div variants={item} className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground px-1">Recent Expenses</h3>
        {expenses.map((e) => {
          const Icon = categoryIcons[e.category];
          return (
            <Card key={e.id} className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer">
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${categoryColors[e.category]}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate pr-2">{e.desc}</p>
                    <p className="text-sm font-bold whitespace-nowrap">₹{e.amount}</p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">{e.date}</p>
                    <Badge className={`${statusBadge[e.status]} text-[10px] capitalize`}>
                      {e.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
