import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Loader2, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Receipt, Tags, GitBranch, Scale, StickyNote, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  policy_notes: string | null;
}

interface ApprovalWorkflow {
  id: string;
  name: string;
  approval_type: string;
  steps: number;
  is_default: boolean;
  is_active: boolean;
}

interface ApprovalRule {
  id: string;
  rule_name: string;
  condition_type: string;
  min_amount: number | null;
  max_amount: number | null;
  category_id: string | null;
  workflow_id: string;
  priority: number;
  is_active: boolean;
}

export default function AdminExpenseManagement() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [policy, setPolicy] = useState<ExpensePolicy | null>(null);
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Category dialog
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<ExpenseCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: "", receipt_required_above: "" as string, auto_approval_limit: "" as string });

  // Workflow dialog
  const [showWfDialog, setShowWfDialog] = useState(false);
  const [wfForm, setWfForm] = useState({ name: "", approval_type: "sequential", steps: 1, is_default: false });
  const [editingWf, setEditingWf] = useState<ApprovalWorkflow | null>(null);

  // Rule form (inline)
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({ rule_name: "", condition_type: "amount_range", min_amount: "", max_amount: "", workflow_id: "", priority: "100" });

  // Workflow expand
  const [expandedWf, setExpandedWf] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [catRes, polRes, wfRes, ruleRes] = await Promise.all([
      supabase.from("expense_categories").select("*").order("name"),
      supabase.from("expense_policy").select("*").limit(1).maybeSingle(),
      supabase.from("expense_approval_workflows").select("*").order("name"),
      supabase.from("expense_approval_rules").select("*").order("priority"),
    ]);
    if (catRes.data) setCategories(catRes.data as ExpenseCategory[]);
    if (polRes.data) setPolicy(polRes.data as ExpensePolicy);
    if (wfRes.data) setWorkflows(wfRes.data as ApprovalWorkflow[]);
    if (ruleRes.data) setRules(ruleRes.data as ApprovalRule[]);
    setLoading(false);
  };

  // ─── Policy ───
  const savePolicy = async () => {
    if (!policy) return;
    setSaving(true);
    const { error } = await supabase.from("expense_policy").update({
      submission_deadline: policy.submission_deadline,
      allow_backdate: policy.allow_backdate,
      max_back_days: policy.max_back_days,
      multi_level_approval: policy.multi_level_approval,
      month_lock_enabled: policy.month_lock_enabled,
      policy_notes: policy.policy_notes,
    }).eq("id", policy.id);
    if (error) toast.error("Failed to save policy");
    else toast.success("Policy saved");
    setSaving(false);
  };

  // ─── Categories ───
  const openAddCat = () => {
    setEditingCat(null);
    setCatForm({ name: "", receipt_required_above: "", auto_approval_limit: "" });
    setShowCatDialog(true);
  };
  const openEditCat = (cat: ExpenseCategory) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name,
      receipt_required_above: cat.receipt_required_above != null ? String(cat.receipt_required_above) : "",
      auto_approval_limit: cat.auto_approval_limit != null ? String(cat.auto_approval_limit) : "",
    });
    setShowCatDialog(true);
  };
  const saveCat = async () => {
    if (!catForm.name.trim()) return;
    const payload = {
      name: catForm.name.trim(),
      receipt_required_above: catForm.receipt_required_above ? Number(catForm.receipt_required_above) : null,
      auto_approval_limit: catForm.auto_approval_limit ? Number(catForm.auto_approval_limit) : null,
    };
    if (editingCat) {
      const { error } = await supabase.from("expense_categories").update(payload).eq("id", editingCat.id);
      if (error) { toast.error("Failed to update"); return; }
      toast.success("Category updated");
    } else {
      const { error } = await supabase.from("expense_categories").insert(payload);
      if (error) { toast.error("Failed to add"); return; }
      toast.success("Category added");
    }
    setShowCatDialog(false);
    fetchAll();
  };
  const toggleCat = async (id: string, active: boolean) => {
    await supabase.from("expense_categories").update({ is_active: active }).eq("id", id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, is_active: active } : c));
  };
  const deleteCat = async (id: string) => {
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) { toast.error("Cannot delete (may be in use)"); return; }
    setCategories(prev => prev.filter(c => c.id !== id));
    toast.success("Deleted");
  };

  // ─── Workflows ───
  const openAddWf = () => {
    setEditingWf(null);
    setWfForm({ name: "", approval_type: "sequential", steps: 1, is_default: false });
    setShowWfDialog(true);
  };
  const openEditWf = (wf: ApprovalWorkflow) => {
    setEditingWf(wf);
    setWfForm({ name: wf.name, approval_type: wf.approval_type, steps: wf.steps, is_default: wf.is_default });
    setShowWfDialog(true);
  };
  const saveWf = async () => {
    if (!wfForm.name.trim()) return;
    if (editingWf) {
      const { error } = await supabase.from("expense_approval_workflows").update(wfForm).eq("id", editingWf.id);
      if (error) { toast.error("Failed to update"); return; }
      toast.success("Workflow updated");
    } else {
      const { error } = await supabase.from("expense_approval_workflows").insert(wfForm);
      if (error) { toast.error("Failed to add"); return; }
      toast.success("Workflow added");
    }
    setShowWfDialog(false);
    fetchAll();
  };
  const deleteWf = async (id: string) => {
    const { error } = await supabase.from("expense_approval_workflows").delete().eq("id", id);
    if (error) { toast.error("Cannot delete (may be in use by rules)"); return; }
    fetchAll();
    toast.success("Deleted");
  };

  // ─── Rules ───
  const addRule = async () => {
    if (!ruleForm.rule_name.trim() || !ruleForm.workflow_id) { toast.error("Fill required fields"); return; }
    const { error } = await supabase.from("expense_approval_rules").insert({
      rule_name: ruleForm.rule_name,
      condition_type: ruleForm.condition_type,
      min_amount: ruleForm.min_amount ? Number(ruleForm.min_amount) : null,
      max_amount: ruleForm.max_amount ? Number(ruleForm.max_amount) : null,
      workflow_id: ruleForm.workflow_id,
      priority: Number(ruleForm.priority) || 100,
    });
    if (error) { toast.error("Failed to add rule"); return; }
    toast.success("Rule added");
    setShowRuleForm(false);
    setRuleForm({ rule_name: "", condition_type: "amount_range", min_amount: "", max_amount: "", workflow_id: "", priority: "100" });
    fetchAll();
  };
  const deleteRule = async (id: string) => {
    await supabase.from("expense_approval_rules").delete().eq("id", id);
    setRules(prev => prev.filter(r => r.id !== id));
    toast.success("Rule deleted");
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-2 sm:p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-4">
          <Button onClick={() => navigate('/admin-controls')} variant="ghost" size="sm" className="p-1.5 sm:p-2">
            <ArrowLeft size={18} />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Expense Management</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">Configure expense policies, categories & approval workflows</p>
          </div>
        </div>

        {/* 1. Additional Expenses Policy */}
        {policy && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" />Additional Expenses Policy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Max per Day (₹)</Label>
                  <Input type="number" min={0} value={policy.max_back_days} onChange={e => setPolicy({ ...policy, max_back_days: Number(e.target.value) })} />
                  <p className="text-xs text-primary">0 = no limit</p>
                </div>
                <div className="space-y-2">
                  <Label>Max per Month (₹)</Label>
                  <Input type="number" min={0} value={policy.submission_deadline} onChange={e => setPolicy({ ...policy, submission_deadline: Number(e.target.value) })} />
                  <p className="text-xs text-primary">0 = no limit</p>
                </div>
                <div className="space-y-2">
                  <Label>Bill Required Above (₹)</Label>
                  <Input type="number" min={0} value={policy.month_lock_enabled ? 1 : 0} onChange={() => {}} placeholder="500" />
                  <p className="text-xs text-muted-foreground">Mandatory bill attachment above this amount</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={savePolicy} disabled={saving} size="sm">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 2. Expense Categories */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Tags className="h-5 w-5 text-orange-500" />Expense Categories</CardTitle>
            <Button size="sm" onClick={openAddCat}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-primary">Name</TableHead>
                    <TableHead className="text-primary">Receipt</TableHead>
                    <TableHead className="text-primary">Limit</TableHead>
                    <TableHead className="text-primary">Active</TableHead>
                    <TableHead className="text-primary">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map(cat => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell>{cat.receipt_required_above != null ? "Yes" : "No"}</TableCell>
                      <TableCell>{cat.auto_approval_limit ? `₹${cat.auto_approval_limit}` : "—"}</TableCell>
                      <TableCell>
                        <Switch checked={cat.is_active} onCheckedChange={v => toggleCat(cat.id, v)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditCat(cat)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteCat(cat.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {categories.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No categories configured.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* 3. Approval Workflows */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg flex items-center gap-2"><GitBranch className="h-5 w-5 text-violet-500" />Approval Workflows</CardTitle>
              <span className="text-muted-foreground cursor-help" title="Configure approval chains for expense claims">ⓘ</span>
            </div>
            <Button size="sm" onClick={openAddWf}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {workflows.map(wf => (
              <Collapsible key={wf.id} open={expandedWf === wf.id} onOpenChange={() => setExpandedWf(expandedWf === wf.id ? null : wf.id)}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium">{wf.name}</span>
                      <Badge variant="secondary" className="text-xs">{wf.approval_type === "sequential" ? "Sequential" : "Parallel"}</Badge>
                      {wf.is_default && <Badge className="bg-primary text-primary-foreground text-xs">Default</Badge>}
                      <Badge variant="outline" className="text-xs">{wf.steps} steps</Badge>
                    </div>
                    {expandedWf === wf.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 border border-t-0 rounded-b-lg bg-muted/20 space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Type:</span> {wf.approval_type}</div>
                      <div><span className="text-muted-foreground">Steps:</span> {wf.steps}</div>
                      <div><span className="text-muted-foreground">Default:</span> {wf.is_default ? "Yes" : "No"}</div>
                      <div><span className="text-muted-foreground">Active:</span> {wf.is_active ? "Yes" : "No"}</div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => openEditWf(wf)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteWf(wf.id)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
            {workflows.length === 0 && <p className="text-center text-muted-foreground py-6">No workflows configured.</p>}
          </CardContent>
        </Card>

        {/* 4. Approval Rules */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Scale className="h-5 w-5 text-teal-500" />Approval Rules</CardTitle>
            <Button size="sm" onClick={() => setShowRuleForm(true)}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Rules are checked in priority order (lowest first). First match wins. If no rule matches, the default workflow is used.</p>

            {showRuleForm && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-primary">Rule Name</Label>
                    <Input value={ruleForm.rule_name} onChange={e => setRuleForm({ ...ruleForm, rule_name: e.target.value })} placeholder="e.g. High value expenses" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-primary">Condition Type</Label>
                    <Select value={ruleForm.condition_type} onValueChange={v => setRuleForm({ ...ruleForm, condition_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount_range">Amount Range</SelectItem>
                        <SelectItem value="category">Category</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-primary">Min Amount (₹)</Label>
                    <Input type="number" value={ruleForm.min_amount} onChange={e => setRuleForm({ ...ruleForm, min_amount: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-primary">Max Amount (₹)</Label>
                    <Input type="number" value={ruleForm.max_amount} onChange={e => setRuleForm({ ...ruleForm, max_amount: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-primary">Workflow</Label>
                    <Select value={ruleForm.workflow_id} onValueChange={v => setRuleForm({ ...ruleForm, workflow_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select workflow" /></SelectTrigger>
                      <SelectContent>
                        {workflows.map(wf => <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-primary">Priority (lower = first)</Label>
                    <Input type="number" value={ruleForm.priority} onChange={e => setRuleForm({ ...ruleForm, priority: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addRule}><Check className="h-4 w-4 mr-1" />Add</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowRuleForm(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
                </div>
              </div>
            )}

            {rules.length === 0 ? (
              <p className="text-center text-primary py-4">No rules configured. All expenses will use the default workflow.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Range</TableHead>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.rule_name}</TableCell>
                      <TableCell><Badge variant="secondary">{r.condition_type}</Badge></TableCell>
                      <TableCell>{r.min_amount != null || r.max_amount != null ? `₹${r.min_amount ?? 0} – ₹${r.max_amount ?? "∞"}` : "—"}</TableCell>
                      <TableCell>{workflows.find(w => w.id === r.workflow_id)?.name || "—"}</TableCell>
                      <TableCell>{r.priority}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRule(r.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 5. Policy Notes */}
        {policy && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><StickyNote className="h-5 w-5 text-amber-500" />Policy Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={policy.policy_notes || ""}
                onChange={e => setPolicy({ ...policy, policy_notes: e.target.value })}
                placeholder="Add any additional policy notes or guidelines for expense claims..."
                rows={4}
              />
              <div className="flex justify-end">
                <Button onClick={savePolicy} disabled={saving} size="sm">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Notes
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Category Dialog */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>{editingCat ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} placeholder="e.g. Transportation" />
            </div>
            <div className="space-y-2">
              <Label>Receipt Required Above (₹)</Label>
              <Input type="number" value={catForm.receipt_required_above} onChange={e => setCatForm({ ...catForm, receipt_required_above: e.target.value })} placeholder="Leave empty if not required" />
            </div>
            <div className="space-y-2">
              <Label>Auto Approval Limit (₹)</Label>
              <Input type="number" value={catForm.auto_approval_limit} onChange={e => setCatForm({ ...catForm, auto_approval_limit: e.target.value })} placeholder="Leave empty for no auto-approve" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCatDialog(false)}>Cancel</Button>
            <Button onClick={saveCat} disabled={!catForm.name.trim()}>{editingCat ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflow Dialog */}
      <Dialog open={showWfDialog} onOpenChange={setShowWfDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>{editingWf ? "Edit Workflow" : "Add Workflow"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Workflow Name</Label>
              <Input value={wfForm.name} onChange={e => setWfForm({ ...wfForm, name: e.target.value })} placeholder="e.g. Manager + Finance" />
            </div>
            <div className="space-y-2">
              <Label>Approval Type</Label>
              <Select value={wfForm.approval_type} onValueChange={v => setWfForm({ ...wfForm, approval_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="parallel">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Number of Steps</Label>
              <Input type="number" min={1} max={10} value={wfForm.steps} onChange={e => setWfForm({ ...wfForm, steps: Number(e.target.value) })} />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label>Set as Default</Label>
              <Switch checked={wfForm.is_default} onCheckedChange={v => setWfForm({ ...wfForm, is_default: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWfDialog(false)}>Cancel</Button>
            <Button onClick={saveWf} disabled={!wfForm.name.trim()}>{editingWf ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
