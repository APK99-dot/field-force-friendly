import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight } from "lucide-react";
import { REPORTS } from "@/components/reports/reportConfig";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function Reports() {
  const navigate = useNavigate();

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.div variants={item} className="gradient-hero text-primary-foreground p-6 rounded-b-2xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Reports</h1>
            <p className="text-xs opacity-80">Filter, preview and download professional PDF reports</p>
          </div>
        </div>
      </motion.div>

      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORTS.map((r) => (
            <motion.div key={r.type} variants={item}>
              <Card className="shadow-card h-full hover:shadow-lg transition-shadow">
                <CardContent className="p-4 flex flex-col h-full">
                  <div className="flex items-start gap-3">
                    <div
                      className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-r ${r.color} shadow-md shrink-0`}
                    >
                      <r.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm">{r.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => navigate(`/reports/${r.type}`)}
                  >
                    Open Report <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
