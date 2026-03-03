import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Loader2, Plus, Trash2, CheckCircle2, XCircle, Download, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";
import RejectionReasonDialog from "@/components/RejectionReasonDialog";
import * as XLSX from "xlsx";

interface ExpenseCategory {
  id: string;
  name: string;
  monthly_limit: number | null;
  daily_limit: number | null;
  receipt_required_above: number | null;
  auto_approval_limit: number | null;
  is_active: boolean;
}

interface ExpensePolicy {
  id: string;
  submission_deadline: number;
  allow_backdate: boolean;
  max_back_days: number;
  multi_level_approval: boolean;
  month_lock_enabled: boolean;
}

interface ExpenseRow {
  id: string;
  user_id: string;
  category: string;
  category_id: string | null;
  amount: number;
  expense_date: string;
  description: string | null;
  bill_url: string | null;
  status: string;
  rejection_reason: string | null;
  month_key: string | null;
  user_name?: string;
}

export default function AdminExpenseManagement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("configuration");

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-2 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button onClick={() => navigate('/admin-controls')} variant="ghost" size="sm" className="p-1.5 sm:p-2">
            <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">Expense Master</h1>
            <p className="text-sm sm:text-base text-muted-foreground hidden sm:block">Configure categories, manage approvals & view reports</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="approvals">Pending Approvals</TabsTrigger>
            <TabsTrigger value="overview">Monthly Overview</TabsTrigger>
          </TabsList>

          <TabsContent value="configuration"><ConfigurationTab /></TabsContent>
          <TabsContent value="approvals"><ApprovalsTab /></TabsContent>
          <TabsContent value="overview"><OverviewTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── TAB 1: Configuration ───────────────────────────────────────
function ConfigurationTab() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [policy, setPolicy] = useState<ExpensePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [catRes, polRes] = await Promise.all([
      supabase.from("expense_categories").select("*").order("name"),
      supabase.from("expense_policy").select("*").limit(1).maybeSingle(),
    ]);
    if (catRes.data) setCategories(catRes.data as ExpenseCategory[]);
    if (polRes.data) setPolicy(polRes.data as ExpensePolicy);
    setLoading(false);
  };

  const updateCategory = async (id: string, updates: Partial<ExpenseCategory>) => {
    const { error } = await supabase.from("expense_categories").update(updates).eq("id", id);
    if (error) { toast.error("Failed to update category"); return; }
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    toast.success("Category updated");
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const { data, error } = await supabase.from("expense_categories").insert({ name: newCatName.trim() }).select().single();
    if (error) { toast.error("Failed to add category"); return; }
    setCategories(prev => [...prev, data as ExpenseCategory]);
    setNewCatName("");
    setShowAddDialog(false);
    toast.success("Category added");
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) { toast.error("Cannot delete category (may be in use)"); return; }
    setCategories(prev => prev.filter(c => c.id !== id));
    toast.success("Category deleted");
  };

  const savePolicy = async () => {
    if (!policy) return;
    setSaving(true);
    const { error } = await supabase.from("expense_policy").update({
      submission_deadline: policy.submission_deadline,
      allow_backdate: policy.allow_backdate,
      max_back_days: policy.max_back_days,
      multi_level_approval: policy.multi_level_approval,
      month_lock_enabled: policy.month_lock_enabled,
    }).eq("id", policy.id);
    if (error) toast.error("Failed to save policy");
    else toast.success("Policy saved");
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 mt-4">
      {/* Categories */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Expense Categories</CardTitle>
          <Button size="sm" onClick={() => setShowAddDialog(true)}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Monthly Limit</TableHead>
                  <TableHead>Daily Limit</TableHead>
                  <TableHead>Receipt Above ₹</TableHead>
                  <TableHead>Auto Approve Below ₹</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(cat => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <Input type="number" className="w-24" value={cat.monthly_limit ?? ""} placeholder="—"
                        onChange={e => updateCategory(cat.id, { monthly_limit: e.target.value ? Number(e.target.value) : null })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" className="w-24" value={cat.daily_limit ?? ""} placeholder="—"
                        onChange={e => updateCategory(cat.id, { daily_limit: e.target.value ? Number(e.target.value) : null })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" className="w-24" value={cat.receipt_required_above ?? ""} placeholder="—"
                        onChange={e => updateCategory(cat.id, { receipt_required_above: e.target.value ? Number(e.target.value) : null })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" className="w-24" value={cat.auto_approval_limit ?? ""} placeholder="—"
                        onChange={e => updateCategory(cat.id, { auto_approval_limit: e.target.value ? Number(e.target.value) : null })} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={cat.is_active} onCheckedChange={v => updateCategory(cat.id, { is_active: v })} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => deleteCategory(cat.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Policy Settings */}
      {policy && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Policy Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Submission Deadline (day of month)</Label>
                <Input type="number" min={1} max={28} value={policy.submission_deadline}
                  onChange={e => setPolicy({ ...policy, submission_deadline: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground">Expenses must be submitted by this day of the next month</p>
              </div>
              <div className="space-y-2">
                <Label>Max Back Days</Label>
                <Input type="number" min={0} value={policy.max_back_days}
                  onChange={e => setPolicy({ ...policy, max_back_days: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground">Maximum days allowed for backdated entries</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label>Allow Backdated Entries</Label>
                <Switch checked={policy.allow_backdate} onCheckedChange={v => setPolicy({ ...policy, allow_backdate: v })} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label>Multi-Level Approval</Label>
                <Switch checked={policy.multi_level_approval} onCheckedChange={v => setPolicy({ ...policy, multi_level_approval: v })} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label>Lock Month After Deadline</Label>
                <Switch checked={policy.month_lock_enabled} onCheckedChange={v => setPolicy({ ...policy, month_lock_enabled: v })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={savePolicy} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Policy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Category Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Category Name</Label>
            <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Transportation" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={addCategory} disabled={!newCatName.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── TAB 2: Pending Approvals ───────────────────────────────────
function ApprovalsTab() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") };
  });

  useEffect(() => { fetchExpenses(); }, [selectedMonth, statusFilter]);

  const fetchExpenses = async () => {
    setLoading(true);
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-31`;

    let query = supabase
      .from("additional_expenses")
      .select("*")
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .order("expense_date", { ascending: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data } = await query;
    
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: users } = await supabase.from("users").select("id, full_name").in("id", userIds);
      const userMap = new Map(users?.map(u => [u.id, u.full_name]) || []);
      setExpenses(data.map(e => ({ ...e, user_name: userMap.get(e.user_id) || "Unknown" })) as ExpenseRow[]);
    } else {
      setExpenses([]);
    }
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("additional_expenses").update({ status: "approved" }).eq("id", id);
    if (error) { toast.error("Failed to approve"); return; }
    toast.success("Expense approved");
    fetchExpenses();
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    const { error } = await supabase.from("additional_expenses").update({ status: "rejected", rejection_reason: reason }).eq("id", rejectTarget);
    if (error) { toast.error("Failed to reject"); return; }
    toast.success("Expense rejected");
    setRejectTarget(null);
    fetchExpenses();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected": return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Submitted</Badge>;
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : expenses.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No expenses found.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell className="font-medium">{exp.user_name}</TableCell>
                      <TableCell>{exp.category === "Other" ? exp.description : exp.category}</TableCell>
                      <TableCell>{format(new Date(exp.expense_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-semibold">₹{Number(exp.amount).toFixed(0)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{exp.description || "—"}</TableCell>
                      <TableCell>
                        {exp.bill_url ? (
                          <Button variant="ghost" size="sm" onClick={() => window.open(exp.bill_url!, "_blank")}><Eye className="h-4 w-4" /></Button>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{statusBadge(exp.status)}</TableCell>
                      <TableCell>
                        {exp.status === "submitted" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => handleApprove(exp.id)}>
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5" onClick={() => setRejectTarget(exp.id)}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {exp.status === "rejected" && exp.rejection_reason && (
                          <span className="text-xs text-destructive">{exp.rejection_reason}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <RejectionReasonDialog
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="Reject Expense"
        description="Please provide a reason for rejecting this expense claim."
      />
    </div>
  );
}

// ─── TAB 3: Monthly Overview ────────────────────────────────────
function OverviewTab() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") };
  });

  useEffect(() => { fetchAll(); }, [selectedMonth]);

  const fetchAll = async () => {
    setLoading(true);
    const startDate = `${selectedMonth}-01`;
    const endDate = `${selectedMonth}-31`;
    const { data } = await supabase
      .from("additional_expenses")
      .select("*")
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .order("expense_date", { ascending: false });

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: users } = await supabase.from("users").select("id, full_name").in("id", userIds);
      const userMap = new Map(users?.map(u => [u.id, u.full_name]) || []);
      setExpenses(data.map(e => ({ ...e, user_name: userMap.get(e.user_id) || "Unknown" })) as ExpenseRow[]);
    } else {
      setExpenses([]);
    }
    setLoading(false);
  };

  const totalClaimed = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalApproved = expenses.filter(e => e.status === "approved").reduce((s, e) => s + Number(e.amount), 0);
  const totalPending = expenses.filter(e => e.status === "submitted").reduce((s, e) => s + Number(e.amount), 0);
  const totalRejected = expenses.filter(e => e.status === "rejected").reduce((s, e) => s + Number(e.amount), 0);

  // Group by user
  const userSummary = expenses.reduce((acc, e) => {
    if (!acc[e.user_id]) acc[e.user_id] = { name: e.user_name || "Unknown", total: 0, approved: 0, pending: 0, rejected: 0, expenses: [] };
    acc[e.user_id].total += Number(e.amount);
    if (e.status === "approved") acc[e.user_id].approved += Number(e.amount);
    else if (e.status === "submitted") acc[e.user_id].pending += Number(e.amount);
    else if (e.status === "rejected") acc[e.user_id].rejected += Number(e.amount);
    acc[e.user_id].expenses.push(e);
    return acc;
  }, {} as Record<string, { name: string; total: number; approved: number; pending: number; rejected: number; expenses: ExpenseRow[] }>);

  const exportToXLS = () => {
    const rows = expenses.map(e => ({
      User: e.user_name || "",
      Category: e.category,
      Date: e.expense_date,
      Amount: Number(e.amount),
      Status: e.status,
      Description: e.description || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `expenses_${selectedMonth}.xlsx`);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportToXLS}><Download className="h-4 w-4 mr-1" />Export XLS</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Claimed</p><p className="text-xl font-bold">₹{totalClaimed.toFixed(0)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-green-600">Approved</p><p className="text-xl font-bold text-green-600">₹{totalApproved.toFixed(0)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-yellow-600">Pending</p><p className="text-xl font-bold text-yellow-600">₹{totalPending.toFixed(0)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-destructive">Rejected</p><p className="text-xl font-bold text-destructive">₹{totalRejected.toFixed(0)}</p></CardContent></Card>
      </div>

      {/* User-wise Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Total Applied</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Rejected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(userSummary).map(([uid, u]) => (
                  <>
                    <TableRow key={uid} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedUser(expandedUser === uid ? null : uid)}>
                      <TableCell>{expandedUser === uid ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>₹{u.total.toFixed(0)}</TableCell>
                      <TableCell className="text-green-600">₹{u.approved.toFixed(0)}</TableCell>
                      <TableCell className="text-yellow-600">₹{u.pending.toFixed(0)}</TableCell>
                      <TableCell className="text-destructive">₹{u.rejected.toFixed(0)}</TableCell>
                    </TableRow>
                    {expandedUser === uid && u.expenses.map(exp => (
                      <TableRow key={exp.id} className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{exp.category}</TableCell>
                        <TableCell className="text-xs">{format(new Date(exp.expense_date), "dd MMM")}</TableCell>
                        <TableCell className="text-xs font-medium">₹{Number(exp.amount).toFixed(0)}</TableCell>
                        <TableCell colSpan={2} className="text-xs">{exp.status}</TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
                {Object.keys(userSummary).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No expenses this month.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
