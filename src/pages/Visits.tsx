import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Mic,
  Navigation2,
  Sparkles,
} from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export default function Visits() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"gps" | "activity">("gps");
  const [searchQuery, setSearchQuery] = useState("");

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <motion.div
      className="space-y-0"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header Hero Section */}
      <motion.div variants={item} className="gradient-hero text-primary-foreground p-4 pb-6">
        <h1 className="text-lg font-bold">My Visits</h1>
        <p className="text-xs opacity-80">No beats planned</p>

        {/* Week Selector */}
        <div className="flex items-center gap-2 mt-3 mb-3">
          <CalendarDays className="h-4 w-4 opacity-80" />
          <span className="text-xs opacity-80">
            Week of {format(weekStart, "MMM d, yyyy")}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
              onClick={() => setSelectedDate(subWeeks(selectedDate, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
              onClick={() => setSelectedDate(addWeeks(selectedDate, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Day Pills */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day) => {
            const isActive = isSameDay(day, selectedDate);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`rounded-lg py-2 text-center transition-colors ${
                  isActive
                    ? "bg-white text-primary font-semibold"
                    : "bg-white/15 text-primary-foreground/80 hover:bg-white/25"
                }`}
              >
                <p className="text-[10px]">{format(day, "EEE")}</p>
                <p className="text-sm font-semibold">{format(day, "d")}</p>
              </button>
            );
          })}
        </div>

        {/* GPS Track / Activity Tabs */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button
            variant="ghost"
            className={`h-9 text-xs ${
              activeTab === "gps"
                ? "bg-white/20 text-primary-foreground"
                : "text-primary-foreground/60 hover:bg-white/10"
            }`}
            onClick={() => setActiveTab("gps")}
          >
            <Navigation2 className="h-3.5 w-3.5 mr-1.5" />
            GPS Track
          </Button>
          <Button
            variant="ghost"
            className={`h-9 text-xs ${
              activeTab === "activity"
                ? "bg-white/20 text-primary-foreground"
                : "text-primary-foreground/60 hover:bg-white/10"
            }`}
            onClick={() => setActiveTab("activity")}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Activity
          </Button>
        </div>
      </motion.div>

      {/* Search + Filters */}
      <motion.div variants={item} className="p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone"
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon">
            <Mic className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      {/* Visit List / Empty State */}
      <motion.div variants={item} className="px-4 pb-24">
        <Card className="shadow-card">
          <CardContent className="p-8 text-center">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground">No visits found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search or create a new visit
            </p>
            <Button className="mt-4 gradient-hero text-primary-foreground" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Create New Visit
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
