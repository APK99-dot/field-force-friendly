import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Filter, IndianRupee, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns';
import AdditionalExpenses from '@/components/AdditionalExpenses';

type FilterType = 'this_week' | 'last_week' | 'this_month' | 'last_month';

function getDateRange(filter: FilterType) {
  const now = new Date();
  let start: Date, end: Date;
  switch (filter) {
    case 'this_week':
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfWeek(now, { weekStartsOn: 1 });
      break;
    case 'last_week':
      start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      end = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      break;
    case 'this_month':
      start = startOfMonth(now);
      end = endOfMonth(now);
      break;
    case 'last_month':
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(subMonths(now, 1));
      break;
  }
  return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') };
}

const FILTER_LABELS: Record<FilterType, string> = {
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
};

interface Expense {
  id: string;
  category: string;
  custom_category: string | null;
  amount: number;
  description: string | null;
  expense_date: string;
  status: string;
  bill_url: string | null;
  created_at: string;
}

export default function Expenses() {
  const [filter, setFilter] = useState<FilterType>('this_month');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { from, to } = getDateRange(filter);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (userId) fetchExpenses();
  }, [userId, filter]);

  const fetchExpenses = async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('additional_expenses')
      .select('*')
      .eq('user_id', userId)
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('expense_date', { ascending: false });
    if (!error) setExpenses(data || []);
    setLoading(false);
  };

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const pending = expenses.filter((e) => e.status === 'pending').length;
  const approved = expenses.filter((e) => e.status === 'approved').length;
  const rejected = expenses.filter((e) => e.status === 'rejected').length;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  return (
    <motion.div className="p-4 space-y-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Expenses</h1>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />Add Expense
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FILTER_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <IndianRupee className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">₹{total.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-600">Pending</span>
              <span className="font-semibold">{pending}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-green-600">Approved</span>
              <span className="font-semibold">{approved}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-destructive">Rejected</span>
              <span className="font-semibold">{rejected}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expense List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : expenses.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No expenses found for {FILTER_LABELS[filter].toLowerCase()}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {expenses.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">
                      {exp.category === 'Other' ? exp.custom_category : exp.category}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(exp.expense_date), 'MMM dd, yyyy')}
                    </p>
                    {exp.description && (
                      <p className="text-sm text-muted-foreground mt-1">{exp.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-bold">₹{Number(exp.amount).toFixed(0)}</span>
                    {statusBadge(exp.status)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <AdditionalExpenses
            onExpensesUpdated={() => {
              setShowAddDialog(false);
              fetchExpenses();
            }}
          />
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
