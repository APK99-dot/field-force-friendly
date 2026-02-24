import { useState } from "react";
import { motion } from "framer-motion";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Car, Utensils, Receipt, BarChart3, Download } from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

type FilterType = "this_week" | "last_week" | "this_month" | "last_month";

export default function Expenses() {
  const [filterType, setFilterType] = useState<FilterType>("this_week");
  const [activeTab, setActiveTab] = useState("expenses");

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const dateRangeLabel = `${format(weekStart, "dd MMM")} - ${format(weekEnd, "dd MMM yyyy")}`;

  const filterLabels: Record<FilterType, string> = {
    this_week: "This Week",
    last_week: "Last Week",
    this_month: "This Month",
    last_month: "Last Month",
  };

  return (
    <motion.div
      className="p-4 space-y-4 max-w-4xl mx-auto"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Filter + Actions Row */}
      <motion.div variants={item} className="flex items-center justify-between">
        <Select
          value={filterType}
          onValueChange={(v) => setFilterType(v as FilterType)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(filterLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <BarChart3 className="h-4 w-4 mr-1" />
            Report
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            XLS
          </Button>
        </div>
      </motion.div>

      {/* Summary Boxes - TA, DA, Additional */}
      <motion.div variants={item} className="grid grid-cols-3 gap-3">
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Car className="h-4 w-4 text-success" />
              <span className="text-xs text-muted-foreground">Total TA</span>
            </div>
            <p className="text-xl font-bold">₹0</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Utensils className="h-4 w-4 text-info" />
              <span className="text-xs text-muted-foreground">Total DA</span>
            </div>
            <p className="text-xl font-bold">₹0</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Additional</span>
            </div>
            <p className="text-xl font-bold">₹0</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Expense Details Card */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Expense Details</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{dateRangeLabel}</p>
              </div>
              <Button size="sm" className="gradient-hero text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" />
                Additional Expenses
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="expenses" className="flex-1">My Expenses</TabsTrigger>
                <TabsTrigger value="da" className="flex-1">DA</TabsTrigger>
                <TabsTrigger value="additional" className="flex-1">Additional Expenses</TabsTrigger>
              </TabsList>

              <TabsContent value="expenses" className="mt-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Beat</TableHead>
                        <TableHead>TA Amount</TableHead>
                        <TableHead>Productive Visits</TableHead>
                        <TableHead>Order Value</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                          No expense records found for the selected criteria
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="da" className="mt-4">
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No DA records found for the selected criteria
                </div>
              </TabsContent>

              <TabsContent value="additional" className="mt-4">
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No additional expense records found
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
