import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, IndianRupee, Clock, CheckCircle2, XCircle, Loader2, Pencil, Trash2, Eye, Upload, Camera } from 'lucide-react';
import CameraCapture from '@/components/CameraCapture';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths } from 'date-fns';
import { toast } from 'sonner';
import MyTeamExpenses from '@/components/expenses/MyTeamExpenses';

interface Expense {
  id: string;
  category: string;
  category_id: string | null;
  custom_category: string | null;
  amount: number;
  description: string | null;
  expense_date: string;
  status: string;
  bill_url: string | null;
  rejection_reason: string | null;
}

interface ExpenseCategory {
  id: string;
  name: string;
  is_active: boolean;
  auto_approval_limit: number | null;
}

export default function Expenses() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>();
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [rejectionView, setRejectionView] = useState<string | null>(null);

  // Form state
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formCategory, setFormCategory] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') };
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
    supabase.from('expense_categories').select('*').eq('is_active', true).order('name').then(({ data }) => {
      if (data) setCategories(data as ExpenseCategory[]);
    });
  }, []);

  useEffect(() => { if (userId) fetchExpenses(); }, [userId, selectedMonth]);

  const fetchExpenses = async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('additional_expenses')
      .select('*')
      .eq('user_id', userId)
      .gte('expense_date', `${selectedMonth}-01`)
      .lte('expense_date', `${selectedMonth}-31`)
      .order('expense_date', { ascending: false });
    setExpenses((data || []) as Expense[]);
    setLoading(false);
  };

  const filtered = statusFilter === 'all' ? expenses : expenses.filter(e => e.status === statusFilter);

  const totalSubmitted = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalApproved = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0);
  const totalPending = expenses.filter(e => e.status === 'submitted' || e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);
  const totalRejected = expenses.filter(e => e.status === 'rejected').reduce((s, e) => s + Number(e.amount), 0);

  const resetForm = () => {
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormCategory('');
    setFormAmount('');
    setFormDescription('');
    setFormFile(null);
    setEditingExpense(null);
  };

  const openAdd = () => { resetForm(); setShowAddDialog(true); };

  const openEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setFormDate(exp.expense_date);
    setFormCategory(exp.category);
    setFormAmount(String(exp.amount));
    setFormDescription(exp.description || '');
    setFormFile(null);
    setShowAddDialog(true);
  };

  const handleSubmit = async () => {
    if (!userId || !formCategory || !formAmount) { toast.error('Fill required fields'); return; }
    setSubmitting(true);

    let billUrl = editingExpense?.bill_url || null;
    if (formFile) {
      const fileName = `${userId}/${Date.now()}_${formFile.name}`;
      const { error: uploadErr } = await supabase.storage.from('expense-bills').upload(fileName, formFile);
      if (uploadErr) { toast.error('Failed to upload receipt'); setSubmitting(false); return; }
      billUrl = fileName;
    }

    const cat = categories.find(c => c.name === formCategory);
    const amount = parseFloat(formAmount);
    const autoApprove = cat?.auto_approval_limit && amount < cat.auto_approval_limit;
    const monthKey = formDate.substring(0, 7);

    const payload = {
      category: formCategory,
      category_id: cat?.id || null,
      amount,
      description: formDescription || null,
      expense_date: formDate,
      bill_url: billUrl,
      status: autoApprove ? 'approved' : 'submitted',
      month_key: monthKey,
    };

    if (editingExpense) {
      const { error } = await supabase.from('additional_expenses').update(payload).eq('id', editingExpense.id);
      if (error) { toast.error('Failed to update'); setSubmitting(false); return; }
      toast.success(autoApprove ? 'Expense auto-approved!' : 'Expense updated & submitted');
    } else {
      const { error } = await supabase.from('additional_expenses').insert({ ...payload, user_id: userId });
      if (error) { toast.error('Failed to submit'); setSubmitting(false); return; }

      // Notify reporting manager
      if (!autoApprove) {
        const { data: userData } = await supabase.from('users').select('reporting_manager_id, full_name').eq('id', userId).single();
        if (userData?.reporting_manager_id) {
          await supabase.rpc('send_notification', {
            user_id_param: userData.reporting_manager_id,
            title_param: `Expense Claim - ${userData.full_name}`,
            message_param: `New expense of ₹${amount} (${formCategory}) submitted for approval`,
            type_param: 'expense_request',
            related_table_param: 'additional_expenses',
          });
        }
      }
      toast.success(autoApprove ? 'Expense auto-approved!' : 'Expense submitted for approval');
    }

    setShowAddDialog(false);
    resetForm();
    fetchExpenses();
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('additional_expenses').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success('Expense deleted');
    fetchExpenses();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'draft': return <Badge variant="secondary">Draft</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3 mr-1" />Submitted</Badge>;
    }
  };

  return (
    <motion.div className="p-4 space-y-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="text-xl font-bold">Expenses</h1>

      <Tabs defaultValue="my-expenses" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="my-expenses" className="flex-1">My Expenses</TabsTrigger>
          <TabsTrigger value="my-team" className="flex-1">My Team</TabsTrigger>
        </TabsList>

        <TabsContent value="my-expenses">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Expense</Button>
            </div>

            {/* Month & Status Filter */}
            <div className="flex flex-wrap gap-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Submitted</p><p className="text-lg font-bold">₹{totalSubmitted.toFixed(0)}</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-xs text-green-600">Approved</p><p className="text-lg font-bold text-green-600">₹{totalApproved.toFixed(0)}</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-xs text-yellow-600">Pending</p><p className="text-lg font-bold text-yellow-600">₹{totalPending.toFixed(0)}</p></CardContent></Card>
              <Card><CardContent className="p-4 text-center"><p className="text-xs text-destructive">Rejected</p><p className="text-lg font-bold text-destructive">₹{totalRejected.toFixed(0)}</p></CardContent></Card>
            </div>

            {/* Expense List */}
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No expenses found.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {filtered.map(exp => (
                  <Card key={exp.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{exp.category}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(exp.expense_date), 'dd MMM yyyy')}</p>
                          {exp.description && <p className="text-sm text-muted-foreground mt-1">{exp.description}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-bold">₹{Number(exp.amount).toFixed(0)}</span>
                          {statusBadge(exp.status)}
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex gap-2 mt-3">
                        {(exp.status === 'draft' || exp.status === 'rejected') && (
                          <Button variant="outline" size="sm" onClick={() => openEdit(exp)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                        )}
                        {exp.status === 'draft' && (
                          <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDelete(exp.id)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                        )}
                        {exp.status === 'pending' && (
                          <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDelete(exp.id)}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                        )}
                        {exp.status === 'rejected' && exp.rejection_reason && (
                          <Button variant="ghost" size="sm" onClick={() => setRejectionView(exp.rejection_reason)}>
                            <Eye className="h-3 w-3 mr-1" />Reason
                          </Button>
                        )}
                        {exp.bill_url && (
                          <Button variant="ghost" size="sm" onClick={() => window.open(exp.bill_url!, '_blank')}><Eye className="h-3 w-3 mr-1" />Receipt</Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="my-team">
          <MyTeamExpenses />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Expense'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" min="0" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Enter description" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Receipt</Label>
              <div className="flex items-center gap-2">
                <Input type="file" accept="image/*,.pdf" onChange={e => setFormFile(e.target.files?.[0] || null)} className="flex-1" />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowCamera(true)} title="Take photo">
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
              {formFile && <p className="text-xs text-muted-foreground">Selected: {formFile.name}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !formCategory || !formAmount}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingExpense ? 'Update & Submit' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason View */}
      <Dialog open={!!rejectionView} onOpenChange={() => setRejectionView(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle className="text-destructive">Rejection Reason</DialogTitle></DialogHeader>
          <p className="text-sm">{rejectionView}</p>
        </DialogContent>
      </Dialog>

      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(blob) => {
          const file = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' });
          setFormFile(file);
        }}
        title="Capture Receipt"
      />
    </motion.div>
  );
}
