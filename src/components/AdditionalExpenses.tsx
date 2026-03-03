import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AdditionalExpensesProps {
  onExpensesUpdated?: () => void;
}

interface ExpenseRow {
  category: string;
  custom_category?: string;
  amount: number;
  description?: string;
  expense_date: string;
  bill_file?: File;
}

const EXPENSE_CATEGORIES = [
  'Telephone Expense',
  'Outlocation travel',
  'Food Expenses',
  'Stay',
  'Other'
];

const AdditionalExpenses: React.FC<AdditionalExpensesProps> = ({ onExpensesUpdated }) => {
  const [userId, setUserId] = useState<string>();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);

  const defaultDate = new Date().toISOString().split('T')[0];

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const addRow = () => setExpenses([...expenses, { category: '', amount: 0, description: '', expense_date: defaultDate }]);

  const removeRow = (i: number) => setExpenses(expenses.filter((_, idx) => idx !== i));

  const updateRow = (i: number, field: keyof ExpenseRow, value: any) => {
    const next = [...expenses];
    next[i] = { ...next[i], [field]: value };
    setExpenses(next);
  };

  const uploadFile = async (file: File, uid: string): Promise<string | null> => {
    const fileName = `${uid}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('expense-bills').upload(fileName, file);
    if (error) { console.error('Upload error:', error); return null; }
    return fileName;
  };

  const saveExpenses = async () => {
    if (!userId || expenses.length === 0) return;
    const valid = expenses.every(e => e.category && e.amount > 0);
    if (!valid) { toast.error('Please fill category and amount for all expenses'); return; }

    setLoading(true);
    try {
      const rows = [];
      for (const exp of expenses) {
        let billUrl = null;
        if (exp.bill_file) {
          billUrl = await uploadFile(exp.bill_file, userId);
          if (!billUrl) { toast.error('Failed to upload bill'); continue; }
        }
        rows.push({
          user_id: userId,
          category: exp.category,
          custom_category: exp.category === 'Other' ? exp.custom_category : null,
          amount: exp.amount,
          description: exp.description || null,
          bill_url: billUrl,
          expense_date: exp.expense_date,
        });
      }

      const { error } = await supabase.from('additional_expenses').insert(rows);
      if (error) throw error;

      // Notify reporting manager
      const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
      const { data: userData } = await supabase
        .from('users')
        .select('reporting_manager_id, full_name')
        .eq('id', userId)
        .single();

      if (userData?.reporting_manager_id) {
        await supabase.rpc('send_notification', {
          user_id_param: userData.reporting_manager_id,
          title_param: `Expense Claim - ${userData.full_name}`,
          message_param: `New expense of ₹${totalAmount} submitted for approval`,
          type_param: 'expense_request',
          related_table_param: 'additional_expenses',
        });
      }

      toast.success('Expenses submitted for approval!');
      setExpenses([]);
      onExpensesUpdated?.();
    } catch (error) {
      console.error('Error saving expenses:', error);
      toast.error('Failed to save expenses');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {expenses.map((exp, i) => (
        <div key={i} className="p-4 border rounded-lg space-y-3">
          <div className="flex justify-between items-center">
            <Label className="font-medium">Expense {i + 1}</Label>
            <Button variant="ghost" size="sm" onClick={() => removeRow(i)} className="text-destructive hover:text-destructive">
              <Trash2 size={16} />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={exp.category} onValueChange={(v) => updateRow(i, 'category', v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {exp.category === 'Other' && (
              <div>
                <Label className="text-xs">Custom Category</Label>
                <Input value={exp.custom_category || ''} onChange={(e) => updateRow(i, 'custom_category', e.target.value)} placeholder="Enter category" />
              </div>
            )}
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" value={exp.amount || ''} onChange={(e) => updateRow(i, 'amount', parseFloat(e.target.value) || 0)} placeholder="0" min="0" step="0.01" />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={exp.expense_date} onChange={(e) => updateRow(i, 'expense_date', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={exp.description || ''} onChange={(e) => updateRow(i, 'description', e.target.value)} placeholder="Enter description" rows={2} />
          </div>
          <div>
            <Label className="text-xs">Attach Bill</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="file" accept="image/*,.pdf" onChange={(e) => updateRow(i, 'bill_file', e.target.files?.[0] || undefined)} className="flex-1" />
              <Upload size={16} className="text-muted-foreground" />
            </div>
            {exp.bill_file && <p className="text-xs text-muted-foreground mt-1">Selected: {exp.bill_file.name}</p>}
          </div>
        </div>
      ))}

      <Button onClick={addRow} variant="outline" className="w-full border-dashed">
        <Plus size={16} className="mr-2" />Add Expense
      </Button>

      {expenses.length > 0 && (
        <div className="flex justify-between items-center pt-2">
          <span className="font-semibold">Total: ₹{expenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}</span>
          <Button onClick={saveExpenses} disabled={loading}>{loading ? 'Submitting...' : 'Submit for Approval'}</Button>
        </div>
      )}
    </div>
  );
};

export default AdditionalExpenses;
