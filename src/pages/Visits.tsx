import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Clock, Plus, Search, Filter, CheckCircle2, AlertCircle } from "lucide-react";

const statusStyles: Record<string, string> = {
  planned: "bg-info/10 text-info border-info/20",
  "in-progress": "bg-accent/10 text-accent border-accent/20",
  productive: "bg-success/10 text-success border-success/20",
  unproductive: "bg-destructive/10 text-destructive border-destructive/20",
};

const visits = [
  {
    retailer: "Metro Hardware Supplies",
    address: "MG Road, Bangalore",
    time: "10:00 AM - 11:30 AM",
    status: "productive",
    notes: "Order placed — ₹45,000",
  },
  {
    retailer: "BuildMart Trading Co",
    address: "Jayanagar 4th Block",
    time: "12:00 PM - 1:00 PM",
    status: "in-progress",
    notes: "Meeting with procurement head",
  },
  {
    retailer: "Sri Lakshmi Cement Depot",
    address: "Banashankari",
    time: "2:30 PM - 3:30 PM",
    status: "planned",
    notes: "Follow up on quotation",
  },
  {
    retailer: "National Paints & Hardware",
    address: "JP Nagar",
    time: "4:00 PM - 5:00 PM",
    status: "planned",
    notes: "New retailer onboarding",
  },
  {
    retailer: "Vinayaka Steel Works",
    address: "BTM Layout",
    time: "11:00 AM",
    status: "unproductive",
    notes: "Shop closed, reschedule",
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

export default function Visits() {
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
          <h1 className="text-lg font-bold">Today's Visits</h1>
          <p className="text-xs text-muted-foreground">4 planned • 1 completed</p>
        </div>
        <Button size="sm" className="gradient-hero text-primary-foreground">
          <Plus className="h-4 w-4 mr-1" /> New Visit
        </Button>
      </motion.div>

      {/* Search + Filter */}
      <motion.div variants={item} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search retailers..." className="pl-9" />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </motion.div>

      {/* Summary chips */}
      <motion.div variants={item} className="flex gap-2 overflow-x-auto pb-1">
        <Badge className="bg-info/10 text-info border border-info/20 whitespace-nowrap">🔵 2 Planned</Badge>
        <Badge className="bg-accent/10 text-accent border border-accent/20 whitespace-nowrap">🟡 1 In Progress</Badge>
        <Badge className="bg-success/10 text-success border border-success/20 whitespace-nowrap">🟢 1 Productive</Badge>
        <Badge className="bg-destructive/10 text-destructive border border-destructive/20 whitespace-nowrap">🔴 1 Unproductive</Badge>
      </motion.div>

      {/* Visit cards */}
      {visits.map((v, i) => (
        <motion.div key={i} variants={item}>
          <Card className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold">{v.retailer}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" /> {v.address}
                  </p>
                </div>
                <Badge className={`${statusStyles[v.status]} text-xs capitalize`}>
                  {v.status.replace("-", " ")}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {v.time}
                </p>
                <p className="text-xs text-muted-foreground">{v.notes}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
