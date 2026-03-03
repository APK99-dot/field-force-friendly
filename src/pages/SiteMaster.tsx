import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import SiteMasterManagement from "@/components/admin/SiteMasterManagement";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function SiteMasterPage() {
  const navigate = useNavigate();

  return (
    <motion.div
      className="p-4 space-y-6 max-w-6xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item} className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Project / Site Master</h1>
          <p className="text-sm text-muted-foreground">Manage project sites for activity logging</p>
        </div>
      </motion.div>

      <motion.div variants={item}>
        <SiteMasterManagement />
      </motion.div>
    </motion.div>
  );
}
