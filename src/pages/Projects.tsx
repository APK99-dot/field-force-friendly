import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderKanban, Plus, Search, Filter } from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export default function Projects() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  return (
    <motion.div
      className="p-4 space-y-4 max-w-4xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Projects</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Manage all your projects and track progress</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">Templates</Button>
          <Button size="sm" className="gradient-hero text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" />
            New Project
          </Button>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={item} className="flex items-center gap-4 text-sm">
        <span className="font-bold">0 <span className="text-muted-foreground font-normal">Total</span></span>
        <span className="text-info font-bold">0 <span className="text-muted-foreground font-normal">Active</span></span>
        <span className="text-accent font-bold">0 <span className="text-muted-foreground font-normal">Planning</span></span>
        <span className="text-success font-bold">0 <span className="text-muted-foreground font-normal">Completed</span></span>
      </motion.div>

      {/* Filters */}
      <motion.div variants={item} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Empty State */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <FolderKanban className="h-14 w-14 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-lg font-semibold">No projects yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first project to get started.
            </p>
            <Button className="mt-4 gradient-hero text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" />
              Create First Project
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
