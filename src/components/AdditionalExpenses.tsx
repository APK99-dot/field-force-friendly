import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Upload, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AdditionalExpensesProps {
  beatId?: string;
  beatName?: string;
  expenseDate?: string;
  onExpensesUpdated?: () => void;
}

interface AdditionalExpense {
  id?: string;
  category: string;
  custom_category?: string;
  amount: number;
  description?: string;
  bill_url?: string;
  bill_file?: File;
  expense_date: string;
}

const EXPENSE_CATEGORIES = [
  'Telephone Expense',
  'Outlocation travel',
  'Food Expenses',
  'Stay',
  'Other'
];

const AdditionalExpenses: React.FC<AdditionalExpensesProps> = ({
  beatId,
  beatName,
  expenseDate,
  onExpensesUpdated
}) => {
  const [userId, setUserId] = useState<string>();
  const [userName, setUserName] = useState<string>('');
  const [isFormOpen, setIsFormOpen] = useState(true);
  const [expenses, setExpenses] = useState<AdditionalExpense[]>([]);
  const [savedExpenses, setSavedExpenses] = useState<AdditionalExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);

  const defaultDate = expenseDate || new Date().toISOString().split('T')[0];

  const initialExpense: AdditionalExpense = {
    category: '',
    amount: 0,
    description: '',
    expense_date: defaultDate
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        supabase.from('profiles').select('full_name').eq('id', user.id).single()
          .then(({ data }) => setUserName(data?.full_name || ''));
      }
    });
  }, []);

  useEffect(() => {
    if (userId) fetchSavedExpenses();
  }, [userId]);

  useEffect(() => {
    const total = [...expenses, ...savedExpenses].reduce((sum, expense) => sum + expense.amount, 0);
    setTotalAmount(total);
  }, [expenses, savedExpenses]);

  const fetchSavedExpenses = async () => {
    if (!userId) return;
    try {
      let query = supabase.from('additional_expenses').select('*').eq('user_id', userId);
      if (beatId && expenseDate) query = query.eq('expense_date', expenseDate);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      setSavedExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Failed to fetch expenses');
    }
  };

  const addExpenseRow = () => setExpenses([...expenses, { ...initialExpense }]);

  const removeExpenseRow = (index: number) => setExpenses(expenses.filter((_, i) => i !== index));

  const updateExpense = (index: number, field: keyof AdditionalExpense, value: any) => {
    const newExpenses = [...expenses];
    newExpenses[index] = { ...newExpenses[index], [field]: value };
    setExpenses(newExpenses);
  };

  const handleFileChange = (index: number, file: File | null) => {
    if (file) updateExpense(index, 'bill_file', file);
  };

  const uploadFile = async (file: File, uid: string): Promise<string | null> => {
    const fileName = `${uid}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('expense-bills').upload(fileName, file);
    if (error) { console.error('Error uploading file:', error); return null; }
    return fileName;
  };

  const saveExpenses = async () => {
    if (!userId || expenses.length === 0) return;
    setLoading(true);
    try {
      const expensesToSave = [];
      for (const expense of expenses) {
        let billUrl = null;
        if (expense.bill_file) {
          billUrl = await uploadFile(expense.bill_file, userId);
          if (!billUrl) { toast.error('Failed to upload file'); continue; }
        }
        expensesToSave.push({
          user_id: userId,
          category: expense.category,
          custom_category: expense.category === 'Other' ? expense.custom_category : null,
          amount: expense.amount,
          description: beatName ? `${expense.description} (${beatName})` : expense.description,
          bill_url: billUrl,
          expense_date: expense.expense_date
        });
      }
      const { error } = await supabase.from('additional_expenses').insert(expensesToSave);
      if (error) throw error;
      toast.success('Expenses saved successfully!');
      setExpenses([]);
      setIsFormOpen(false);
      fetchSavedExpenses();
      onExpensesUpdated?.();
    } catch (error) {
      console.error('Error saving expenses:', error);
      toast.error('Failed to save expenses');
    } finally {
      setLoading(false);
    }
  };

  const deleteSavedExpense = async (expenseId: string) => {
    try {
      const { error } = await supabase.from('additional_expenses').delete().eq('id', expenseId);
      if (error) throw error;
      toast.success('Expense deleted successfully!');
      fetchSavedExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense');
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText size={20} />
          Additional Expenses
          {totalAmount > 0 && (
            <span className="text-lg font-bold text-primary ml-2">₹{totalAmount.toFixed(2)}</span>
          )}
        </CardTitle>
        <Button onClick={() => setIsFormOpen(!isFormOpen)} variant={isFormOpen ? "outline" : "default"} size="sm">
          {isFormOpen ? 'Cancel' : 'Edit'}
        </Button>
      </CardHeader>

      <CardContent>
        {isFormOpen && (
          <div className="space-y-6 mb-6">
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <Label className="text-sm font-medium">User: {userName || 'Loading...'}</Label>
              {beatName && <Label className="text-sm font-medium text-primary">Beat: {beatName}</Label>}
              {expenseDate && <Label className="text-sm font-medium text-muted-foreground">Date: {new Date(expenseDate).toLocaleDateString()}</Label>}
            </div>

            <div className="space-y-4">
              {expenses.map((expense, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="font-medium">Expense {index + 1}</Label>
                    <Button variant="ghost" size="sm" onClick={() => removeExpenseRow(index)} className="text-destructive hover:text-destructive">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Category</Label>
                      <Select onValueChange={(v) => updateExpense(index, 'category', v)} value={expense.category}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {expense.category === 'Other' && (
                      <div>
                        <Label>Custom Category</Label>
                        <Input value={expense.custom_category || ''} onChange={(e) => updateExpense(index, 'custom_category', e.target.value)} placeholder="Enter custom category" />
                      </div>
                    )}
                    <div>
                      <Label>Amount (₹)</Label>
                      <Input type="number" value={expense.amount} onChange={(e) => updateExpense(index, 'amount', parseFloat(e.target.value) || 0)} placeholder="0.00" min="0" step="0.01" />
                    </div>
                    <div>
                      <Label>Date</Label>
                      <Input type="date" value={expense.expense_date} onChange={(e) => updateExpense(index, 'expense_date', e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={expense.description || ''} onChange={(e) => updateExpense(index, 'description', e.target.value)} placeholder="Enter expense description" rows={2} />
                  </div>
                  <div>
                    <Label>Attach Bill</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input type="file" accept="image/*,.pdf" onChange={(e) => handleFileChange(index, e.target.files?.[0] || null)} className="flex-1" />
                      <Upload size={16} className="text-muted-foreground" />
                    </div>
                    {expense.bill_file && <p className="text-sm text-muted-foreground mt-1">Selected: {expense.bill_file.name}</p>}
                  </div>
                </div>
              ))}
              <Button onClick={addExpenseRow} variant="outline" className="w-full border-dashed">
                <Plus size={16} className="mr-2" />Add More Expense
              </Button>
            </div>

            {expenses.length > 0 && (
              <div className="flex justify-between items-center pt-4">
                <div className="text-lg font-semibold">Total: ₹{expenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}</div>
                <Button onClick={saveExpenses} disabled={loading}>{loading ? 'Saving...' : 'Save Expenses'}</Button>
              </div>
            )}
          </div>
        )}

        {savedExpenses.length > 0 && (
          <div className="space-y-3">
            <Label className="font-medium">Saved Expenses:</Label>
            {savedExpenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{expense.category === 'Other' ? expense.custom_category : expense.category}</span>
                    <span className="text-sm text-muted-foreground">• {new Date(expense.expense_date).toLocaleDateString()}</span>
                  </div>
                  {expense.description && <p className="text-sm text-muted-foreground">{expense.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">₹{expense.amount}</span>
                  <Button variant="ghost" size="sm" onClick={() => deleteSavedExpense(expense.id!)} className="text-destructive hover:text-destructive">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2 border-t">
              <div className="text-lg font-bold">Total Expenses: ₹{totalAmount.toFixed(2)}</div>
            </div>
          </div>
        )}

        {savedExpenses.length === 0 && !isFormOpen && (
          <p className="text-muted-foreground text-center py-4">No additional expenses recorded. Click "Edit" to add expenses.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default AdditionalExpenses;
