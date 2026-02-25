import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Car, Utensils, Receipt, BarChart3, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useExpenses } from "@/hooks/useExpenses";
import { toast } from "sonner";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

type FilterType = "this_week" | "last_week" | "this_month" | "last_month";

const CATEGORIES = [
  "Travel",
  "Food",
  "Accommodation",
  "Phone/Internet",
  "Printing/Stationery",
  "Entertainment",
  "Medical",
  "Other",
];

export default function Expenses() {
  const [filterType, setFilterType] = useState<FilterType>("this_week");
  const [activeTab, setActiveTab] = useState("expenses");
  const [userId, setUserId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({
    category: "",
    amount: "",
    description: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const { expenses, totalTA, totalDA, totalAdditional, isLoading, createExpense, dateRange } =
    useExpenses(userId, filterType);

  const filterLabels: Record<FilterType, string> = {
    this_week: "This Week",
    last_week: "Last Week",
    this_month: "This Month",
    last_month: "Last Month",
  };

  const handleCreateExpense = async () => {
    if (!newExpense.category || !newExpense.amount) {
      toast.error("Category and amount are required");
      return;
    }
    try {
      await createExpense.mutateAsync({
        category: newExpense.category,
        amount: parseFloat(newExpense.amount),
        description: newExpense.description || undefined,
        expense_date: newExpense.expense_date,
      });
      toast.success("Expense added!");
      setCreateOpen(false);
      setNewExpense({ category: "", amount: "", description: "", expense_date: format(new Date(), "yyyy-MM-dd") });
    } catch (err: any) {
      toast.error(err.message || "Failed to add expense");
    }
  };

  return (
    <motion.div className="p-4 space-y-4 max-w-4xl mx-auto" variants={container} initial="hidden" animate="show">
      {/* Filter + Actions Row */}
      <motion.div variants={item} className="flex items-center justify-between">
        <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(filterLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 mr-1" />Report</Button>
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />XLS</Button>
        </div>
      </motion.div>

      {/* Summary Boxes */}
      <motion.div variants={item} className="grid grid-cols-3 gap-3">
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Car className="h-4 w-4 text-success" />
              <span className="text-xs text-muted-foreground">Total TA</span>
            </div>
            <p className="text-xl font-bold">₹{totalTA.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Utensils className="h-4 w-4 text-info" />
              <span className="text-xs text-muted-foreground">Total DA</span>
            </div>
            <p className="text-xl font-bold">₹{totalDA.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Additional</span>
            </div>
            <p className="text-xl font-bold">₹{totalAdditional.toFixed(0)}</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Expense Details */}
      <motion.div variants={item}>
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Expense Details</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{dateRange.from} - {dateRange.to}</p>
              </div>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gradient-hero text-primary-foreground">
                    <Plus className="h-4 w-4 mr-1" />Additional Expenses
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={newExpense.category} onValueChange={(v) => setNewExpense((p) => ({ ...p, category: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (₹)</Label>
                      <Input type="number" value={newExpense.amount} onChange={(e) => setNewExpense((p) => ({ ...p, amount: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={newExpense.expense_date} onChange={(e) => setNewExpense((p) => ({ ...p, expense_date: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input value={newExpense.description} onChange={(e) => setNewExpense((p) => ({ ...p, description: e.target.value }))} placeholder="Optional" />
                    </div>
                    <Button onClick={handleCreateExpense} className="w-full" disabled={createExpense.isPending}>
                      {createExpense.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Add Expense
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
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
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : expenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                            No expense records found for the selected criteria
                          </TableCell>
                        </TableRow>
                      ) : (
                        expenses.map((exp) => (
                          <TableRow key={exp.id}>
                            <TableCell className="text-sm">{exp.expense_date}</TableCell>
                            <TableCell className="text-sm">{exp.category}</TableCell>
                            <TableCell className="text-sm font-medium">₹{Number(exp.amount).toFixed(0)}</TableCell>
                            <TableCell>
                              <Badge variant={exp.status === "approved" ? "default" : exp.status === "rejected" ? "destructive" : "secondary"}>
                                {exp.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="da" className="mt-4">
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {totalDA > 0 ? `DA for this period: ₹${totalDA.toFixed(0)}` : "No DA records found for the selected criteria"}
                </div>
              </TabsContent>

              <TabsContent value="additional" className="mt-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                            No additional expense records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        expenses.map((exp) => (
                          <TableRow key={exp.id}>
                            <TableCell className="text-sm">{exp.expense_date}</TableCell>
                            <TableCell className="text-sm">{exp.category}</TableCell>
                            <TableCell className="text-sm font-medium">₹{Number(exp.amount).toFixed(0)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{exp.description || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={exp.status === "approved" ? "default" : exp.status === "rejected" ? "destructive" : "secondary"}>
                                {exp.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
