import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, CalendarIcon, Download, Car, Utensils, Receipt, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subWeeks, subMonths, subQuarters, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import AdditionalExpenses from '@/components/AdditionalExpenses';
import ProductivityTracking from '@/components/ProductivityTracking';

interface ExpenseRow {
  id: string;
  date: string;
  beat_name: string;
  beat_id: string;
  ta: number;
  da: number;
  additional_expenses: number;
  order_value: number;
  productive_visits: number;
  isOnLeave: boolean;
}

interface DARecord {
  date: string;
  da_amount: number;
  day_start_time: string;
  day_end_time: string;
  market_hours: string;
  isOnLeave: boolean;
}

interface AdditionalExpenseData {
  date: string;
  expense_type: string;
  details: string;
  value: number;
  bill_attached: boolean;
}

type FilterType = 'today' | 'yesterday' | 'current_week' | 'last_week' | 'current_month' | 'last_month' | 'current_quarter' | 'previous_quarter' | 'custom';

const BeatAllowanceManagement = () => {
  const [userId, setUserId] = useState<string>();
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [dateRangeStart, setDateRangeStart] = useState<Date>();
  const [dateRangeEnd, setDateRangeEnd] = useState<Date>();
  const [filterType, setFilterType] = useState<FilterType>('current_week');
  const [loading, setLoading] = useState(true);
  const [isAdditionalExpensesOpen, setIsAdditionalExpensesOpen] = useState(false);
  const [isProductivityReportOpen, setIsProductivityReportOpen] = useState(false);
  const [daRecords, setDARecords] = useState<DARecord[]>([]);
  const [additionalExpenseData, setAdditionalExpenseData] = useState<AdditionalExpenseData[]>([]);
  const [activeTab, setActiveTab] = useState<'expenses' | 'da' | 'additional'>('expenses');
  const [leaveDates, setLeaveDates] = useState<Set<string>>(new Set());
  const fetchVersionRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  const getDateRange = (): { start: Date; end: Date } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    switch (filterType) {
      case 'today': return { start: today, end: today };
      case 'yesterday': { const y = subDays(today, 1); return { start: y, end: y }; }
      case 'current_week': return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
      case 'last_week': { const lw = subWeeks(today, 1); return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) }; }
      case 'current_month': return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'last_month': { const lm = subMonths(today, 1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; }
      case 'current_quarter': return { start: startOfQuarter(today), end: endOfQuarter(today) };
      case 'previous_quarter': { const pq = subQuarters(today, 1); return { start: startOfQuarter(pq), end: endOfQuarter(pq) }; }
      case 'custom':
        if (dateRangeStart && dateRangeEnd) return { start: dateRangeStart, end: dateRangeEnd };
        return { start: startOfMonth(today), end: endOfMonth(today) };
      default: return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  const fetchLeaveDates = async () => {
    if (!userId) return;
    const { data } = await supabase.from('attendance').select('date, status')
      .in('status', ['leave', 'on_leave', 'absent']).eq('user_id', userId);
    const leaveSet = new Set<string>();
    data?.forEach((r: any) => leaveSet.add(r.date));
    if (isMountedRef.current) setLeaveDates(leaveSet);
  };

  const fetchExpenseData = async () => {
    if (!userId) return;
    const { data: configData } = await supabase.from('expense_master_config').select('*').limit(1).maybeSingle();
    const taType = configData?.ta_type || 'fixed';
    const fixedTaAmount = configData?.fixed_ta_amount || 0;

    const { data: beatPlans } = await supabase.from('beat_plans').select('plan_date, beat_id, beat_name')
      .eq('user_id', userId).order('plan_date', { ascending: true });

    const { data: beatAllowancesData } = await supabase.from('beat_allowances').select('beat_id, beat_name, ta_amount');
    const beatTAMap = new Map();
    beatAllowancesData?.forEach((ba: any) => beatTAMap.set(ba.beat_id, ba.ta_amount || 0));

    const { data: expensesData } = await supabase.from('additional_expenses').select('*').eq('user_id', userId);
    const expensesMap = new Map();
    expensesData?.forEach((e: any) => {
      const current = expensesMap.get(e.expense_date) || 0;
      expensesMap.set(e.expense_date, current + parseFloat(e.amount));
    });

    const { data: ordersData } = await supabase.from('orders').select('total_amount, visit_id, created_at').eq('user_id', userId);
    const { data: visitsData } = await supabase.from('visits').select('id, planned_date, status').eq('user_id', userId);

    const productiveVisitsMap = new Map();
    const orderValueByDateMap = new Map();
    const visitsById = new Map();
    visitsData?.forEach((v: any) => {
      visitsById.set(v.id, v);
      if (v.status === 'productive') productiveVisitsMap.set(v.planned_date, (productiveVisitsMap.get(v.planned_date) || 0) + 1);
    });
    ordersData?.forEach((order: any) => {
      const amt = parseFloat(order.total_amount || 0);
      let date: string;
      if (order.visit_id) {
        const visit = visitsById.get(order.visit_id);
        date = visit ? visit.planned_date : format(new Date(order.created_at), 'yyyy-MM-dd');
      } else {
        date = format(new Date(order.created_at), 'yyyy-MM-dd');
      }
      orderValueByDateMap.set(date, (orderValueByDateMap.get(date) || 0) + amt);
    });

    const rows: ExpenseRow[] = [];
    beatPlans?.forEach((plan: any) => {
      const isOnLeave = leaveDates.has(plan.plan_date);
      const ta = isOnLeave ? 0 : (taType === 'fixed' ? fixedTaAmount : (beatTAMap.get(plan.beat_id) || 0));
      rows.push({
        id: plan.plan_date + '-' + plan.beat_id,
        date: plan.plan_date, beat_name: plan.beat_name || '-', beat_id: plan.beat_id || '',
        ta, da: 0, additional_expenses: expensesMap.get(plan.plan_date) || 0,
        order_value: orderValueByDateMap.get(plan.plan_date) || 0,
        productive_visits: productiveVisitsMap.get(plan.plan_date) || 0, isOnLeave
      });
    });
    if (isMountedRef.current) setExpenseRows(rows);
  };

  const fetchDAData = async () => {
    if (!userId) return;
    const { data: configData } = await supabase.from('expense_master_config').select('fixed_da_amount').limit(1).maybeSingle();
    const daPerDay = configData?.fixed_da_amount || 0;

    const { data: attendanceData } = await supabase.from('attendance').select('date, check_in_time, check_out_time, status')
      .eq('user_id', userId).order('date', { ascending: true });

    const records: DARecord[] = (attendanceData || []).map((r: any) => {
      const isOnLeave = ['leave', 'on_leave', 'absent'].includes(r.status);
      const daAmount = isOnLeave ? 0 : (r.status === 'present' ? daPerDay : 0);
      let dayStartTime = '-', dayEndTime = '-', marketHours = '0h 0m';
      if (r.check_in_time) { const ci = new Date(r.check_in_time); dayStartTime = `${ci.getHours().toString().padStart(2, '0')}:${ci.getMinutes().toString().padStart(2, '0')}`; }
      if (r.check_out_time) { const co = new Date(r.check_out_time); dayEndTime = `${co.getHours().toString().padStart(2, '0')}:${co.getMinutes().toString().padStart(2, '0')}`; }
      if (r.check_in_time && r.check_out_time) {
        const ms = new Date(r.check_out_time).getTime() - new Date(r.check_in_time).getTime();
        marketHours = `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
      } else if (r.check_in_time && !r.check_out_time) { marketHours = '-'; }
      return { date: r.date, da_amount: daAmount, day_start_time: dayStartTime, day_end_time: dayEndTime, market_hours: marketHours, isOnLeave };
    });
    if (isMountedRef.current) setDARecords(records);
  };

  const fetchAdditionalExpenseData = async () => {
    if (!userId) return;
    const { data } = await supabase.from('additional_expenses').select('expense_date, category, custom_category, description, amount, bill_url')
      .eq('user_id', userId).order('expense_date', { ascending: true });
    const items: AdditionalExpenseData[] = (data || []).map((item: any) => ({
      date: item.expense_date, expense_type: item.category === 'Other' ? item.custom_category : item.category,
      details: item.description || '', value: item.amount, bill_attached: !!item.bill_url
    }));
    if (isMountedRef.current) setAdditionalExpenseData(items);
  };

  useEffect(() => {
    isMountedRef.current = true;
    const fetchAll = async () => {
      if (!userId) return;
      const ver = ++fetchVersionRef.current;
      setLoading(true);
      try {
        await fetchLeaveDates();
        if (ver !== fetchVersionRef.current || !isMountedRef.current) return;
        await Promise.all([fetchExpenseData(), fetchDAData(), fetchAdditionalExpenseData()]);
      } catch (e) { console.error(e); }
      finally { if (ver === fetchVersionRef.current && isMountedRef.current) setLoading(false); }
    };
    fetchAll();
    return () => { isMountedRef.current = false; };
  }, [userId, filterType, dateRangeStart, dateRangeEnd]);

  const filterByDate = (dateString: string) => {
    const rowDate = new Date(dateString); rowDate.setHours(0, 0, 0, 0);
    const { start, end } = getDateRange();
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(23, 59, 59, 999);
    return rowDate >= s && rowDate <= e;
  };

  const filteredExpenseRows = expenseRows.filter(r => filterByDate(r.date));
  const filteredDARecords = daRecords.filter(r => filterByDate(r.date));
  const filteredAdditionalExpenses = additionalExpenseData.filter(r => filterByDate(r.date));

  const totalTA = useMemo(() => filteredExpenseRows.reduce((s, r) => s + r.ta, 0), [filteredExpenseRows]);
  const totalDA = useMemo(() => filteredDARecords.reduce((s, r) => s + r.da_amount, 0), [filteredDARecords]);
  const totalAdditionalExpenses = useMemo(() => filteredAdditionalExpenses.reduce((s, r) => s + r.value, 0), [filteredAdditionalExpenses]);

  const downloadXLS = async () => {
    const XLSX = await import('xlsx');
    const { start, end } = getDateRange();
    const dateStr = `${format(start, 'dd-MMM-yyyy')}_to_${format(end, 'dd-MMM-yyyy')}`;
    const wb = XLSX.utils.book_new();
    
    const expSheet = filteredExpenseRows.map(r => ({
      'Date': format(new Date(r.date), 'dd-MMM-yyyy'), 'Beat': r.beat_name,
      'TA Amount (₹)': r.ta, 'Productive Visits': r.productive_visits,
      'Order Value (₹)': r.order_value, 'On Leave': r.isOnLeave ? 'Yes' : 'No'
    }));
    expSheet.push({ 'Date': 'TOTAL', 'Beat': '', 'TA Amount (₹)': totalTA, 'Productive Visits': filteredExpenseRows.reduce((s, r) => s + r.productive_visits, 0), 'Order Value (₹)': filteredExpenseRows.reduce((s, r) => s + r.order_value, 0), 'On Leave': '' });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expSheet), 'My Expenses');

    const daSheet = filteredDARecords.map(r => ({
      'Date': format(new Date(r.date), 'dd-MMM-yyyy'), 'DA Amount (₹)': r.da_amount,
      'Day Start Time': r.day_start_time, 'Day End Time': r.day_end_time,
      'Market Hours': r.market_hours, 'On Leave': r.isOnLeave ? 'Yes' : 'No'
    }));
    daSheet.push({ 'Date': 'TOTAL', 'DA Amount (₹)': totalDA, 'Day Start Time': '', 'Day End Time': '', 'Market Hours': '', 'On Leave': '' });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(daSheet), 'DA');

    const addSheet = filteredAdditionalExpenses.map(r => ({
      'Date': format(new Date(r.date), 'dd-MMM-yyyy'), 'Type': r.expense_type,
      'Details': r.details, 'Amount (₹)': r.value, 'Bill Attached': r.bill_attached ? 'Yes' : 'No'
    }));
    addSheet.push({ 'Date': 'TOTAL', 'Type': '', 'Details': '', 'Amount (₹)': totalAdditionalExpenses, 'Bill Attached': '' });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(addSheet), 'Additional Expenses');

    XLSX.writeFile(wb, `Expenses_${dateStr}.xlsx`);
    toast.success('Expense report downloaded successfully');
  };

  const getFilterLabel = () => {
    const { start, end } = getDateRange();
    if (filterType === 'today') return 'Today';
    if (filterType === 'yesterday') return 'Yesterday';
    return `${format(start, 'dd MMM')} - ${format(end, 'dd MMM yyyy')}`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-3">
      {/* Compact Filter Bar */}
      <Card>
        <CardContent className="py-2.5 px-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterType} onValueChange={(v: FilterType) => setFilterType(v)}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="current_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="current_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="current_quarter">This Quarter</SelectItem>
                <SelectItem value="previous_quarter">Last Quarter</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {filterType === 'custom' && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-8 w-[90px] justify-start text-left font-normal text-xs px-2", !dateRangeStart && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />{dateRangeStart ? format(dateRangeStart, "MMM dd") : "Start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <Calendar mode="single" selected={dateRangeStart} onSelect={setDateRangeStart} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-8 w-[90px] justify-start text-left font-normal text-xs px-2", !dateRangeEnd && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />{dateRangeEnd ? format(dateRangeEnd, "MMM dd") : "End"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <Calendar mode="single" selected={dateRangeEnd} onSelect={setDateRangeEnd} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <Button onClick={() => setIsProductivityReportOpen(true)} variant="outline" size="sm" className="h-8 px-2 text-xs">
                <BarChart3 className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Report</span>
              </Button>
              <Button onClick={downloadXLS} variant="outline" size="sm" className="h-8 px-2 text-xs">
                <Download className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">XLS</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Highlight Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Car className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
              <div><p className="text-xs text-muted-foreground">Total TA</p><p className="text-lg font-bold text-blue-600 dark:text-blue-400">₹{totalTA.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg"><Utensils className="h-5 w-5 text-green-600 dark:text-green-400" /></div>
              <div><p className="text-xs text-muted-foreground">Total DA</p><p className="text-lg font-bold text-green-600 dark:text-green-400">₹{totalDA.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg"><Receipt className="h-5 w-5 text-purple-600 dark:text-purple-400" /></div>
              <div><p className="text-xs text-muted-foreground">Additional</p><p className="text-lg font-bold text-purple-600 dark:text-purple-400">₹{totalAdditionalExpenses.toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6 px-3 sm:px-6">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 xs:gap-3">
            <CardTitle className="text-lg sm:text-xl">Expense Details</CardTitle>
            <Button onClick={() => setIsAdditionalExpensesOpen(true)} variant="default" size="sm" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 h-auto">
              <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden xs:inline">Additional </span>Expenses
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{getFilterLabel()}</p>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-8 sm:h-10">
              <TabsTrigger value="expenses" className="text-xs sm:text-sm">My Expenses</TabsTrigger>
              <TabsTrigger value="da" className="text-xs sm:text-sm">DA</TabsTrigger>
              <TabsTrigger value="additional" className="text-xs sm:text-sm">Additional Expenses</TabsTrigger>
            </TabsList>

            <TabsContent value="expenses" className="space-y-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">Date</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">Beat</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm whitespace-nowrap">TA Amount</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm whitespace-nowrap">Productive Visits</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm whitespace-nowrap">Order Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenseRows.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-xs sm:text-sm">No expense records found for the selected criteria</TableCell></TableRow>
                    ) : (
                      <>
                        {filteredExpenseRows.map((row) => (
                          <TableRow key={row.id} className={row.isOnLeave ? 'bg-muted/50' : ''}>
                            <TableCell className="font-medium text-xs sm:text-sm whitespace-nowrap">
                              {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              {row.isOnLeave && <span className="ml-1 text-xs text-orange-500">(Leave)</span>}
                            </TableCell>
                            <TableCell className="font-medium text-xs sm:text-sm">{row.beat_name}</TableCell>
                            <TableCell className="text-right text-xs sm:text-sm whitespace-nowrap">₹{row.ta.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-xs sm:text-sm whitespace-nowrap">{row.productive_visits}</TableCell>
                            <TableCell className="text-right text-xs sm:text-sm whitespace-nowrap">₹{row.order_value.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 bg-muted/30">
                          <TableCell className="font-bold text-xs sm:text-sm">Total</TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-right font-bold text-xs sm:text-sm whitespace-nowrap">₹{totalTA.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-bold text-xs sm:text-sm whitespace-nowrap">{filteredExpenseRows.reduce((s, r) => s + r.productive_visits, 0)}</TableCell>
                          <TableCell className="text-right font-bold text-xs sm:text-sm whitespace-nowrap">₹{filteredExpenseRows.reduce((s, r) => s + r.order_value, 0).toLocaleString()}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="da" className="space-y-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">Date</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm whitespace-nowrap">DA Amount</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">Day Start Time</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">Day End Time</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">Market Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDARecords.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-xs sm:text-sm">No DA records found for the selected criteria</TableCell></TableRow>
                    ) : (
                      <>
                        {filteredDARecords.map((record, i) => (
                          <TableRow key={i} className={record.isOnLeave ? 'bg-muted/50' : ''}>
                            <TableCell className="font-medium text-xs sm:text-sm whitespace-nowrap">
                              {new Date(record.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              {record.isOnLeave && <span className="ml-1 text-xs text-orange-500">(Leave)</span>}
                            </TableCell>
                            <TableCell className="text-right text-xs sm:text-sm whitespace-nowrap">₹{record.da_amount.toLocaleString()}</TableCell>
                            <TableCell className="text-xs sm:text-sm whitespace-nowrap">{record.day_start_time}</TableCell>
                            <TableCell className="text-xs sm:text-sm whitespace-nowrap">{record.day_end_time}</TableCell>
                            <TableCell className="text-xs sm:text-sm whitespace-nowrap">{record.market_hours}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 bg-muted/30">
                          <TableCell className="font-bold text-xs sm:text-sm">Total</TableCell>
                          <TableCell className="text-right font-bold text-xs sm:text-sm whitespace-nowrap">₹{totalDA.toLocaleString()}</TableCell>
                          <TableCell></TableCell><TableCell></TableCell><TableCell></TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="additional" className="space-y-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">Date</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">Type</TableHead>
                      <TableHead className="text-xs sm:text-sm">Details</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm whitespace-nowrap">Add on expense</TableHead>
                      <TableHead className="text-center text-xs sm:text-sm whitespace-nowrap">Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAdditionalExpenses.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-xs sm:text-sm">No additional expenses found for the selected criteria</TableCell></TableRow>
                    ) : (
                      <>
                        {filteredAdditionalExpenses.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs sm:text-sm whitespace-nowrap">{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{item.expense_type}</TableCell>
                            <TableCell className="text-xs sm:text-sm max-w-[100px] truncate">{item.details}</TableCell>
                            <TableCell className="text-right text-xs sm:text-sm whitespace-nowrap">₹{item.value}</TableCell>
                            <TableCell className="text-center">{item.bill_attached ? <span className="text-green-600 text-sm">✓</span> : <span className="text-red-600 text-sm">✗</span>}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 bg-muted/30">
                          <TableCell className="font-bold text-xs sm:text-sm">Total</TableCell>
                          <TableCell></TableCell><TableCell></TableCell>
                          <TableCell className="text-right font-bold text-xs sm:text-sm whitespace-nowrap">₹{totalAdditionalExpenses.toLocaleString()}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Additional Expenses Dialog */}
      <Dialog open={isAdditionalExpensesOpen} onOpenChange={setIsAdditionalExpensesOpen}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Additional Expenses</DialogTitle></DialogHeader>
          <AdditionalExpenses onExpensesUpdated={() => { fetchExpenseData(); fetchAdditionalExpenseData(); setIsAdditionalExpensesOpen(false); }} />
        </DialogContent>
      </Dialog>

      {/* Productivity Report Dialog */}
      <Dialog open={isProductivityReportOpen} onOpenChange={setIsProductivityReportOpen}>
        <DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Productivity Report</DialogTitle></DialogHeader>
          <ProductivityTracking />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BeatAllowanceManagement;
