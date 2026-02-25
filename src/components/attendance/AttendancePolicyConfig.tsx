import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Settings, Calendar, Edit, Save, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface LeavePolicy {
  id: string; leave_type_id: string; yearly_entitlement: number; monthly_accrual: number | null;
  accrual_type: string; carry_forward_allowed: boolean; max_carry_forward: number; is_active: boolean;
  leave_types?: { id: string; name: string; description: string | null };
}

interface WeekOffConfig {
  id: string; day_of_week: number; is_off: boolean; alternate_pattern: string | null;
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const alternatePatterns = [
  { value: 'none', label: 'Working Day' }, { value: 'all', label: 'Full Off' },
  { value: '1st_3rd', label: '1st & 3rd Week Off' }, { value: '2nd_4th', label: '2nd & 4th Week Off' },
];

const AttendancePolicyConfig = () => {
  const [activeSubTab, setActiveSubTab] = useState('leave-entitlements');
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);
  const [weekOffConfig, setWeekOffConfig] = useState<WeekOffConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ leave_type_id: '', yearly_entitlement: 12, monthly_accrual: 0, accrual_type: 'yearly', carry_forward_allowed: false, max_carry_forward: 0 });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [ltRes, polRes, woRes] = await Promise.all([
        supabase.from('leave_types').select('*').order('name'),
        supabase.from('leave_policy').select('*'),
        supabase.from('week_off_config').select('*').order('day_of_week'),
      ]);
      setLeaveTypes(ltRes.data || []);
      setLeavePolicies((polRes.data || []).map(p => ({ ...p, leave_types: ltRes.data?.find(lt => lt.id === p.leave_type_id) })));
      setWeekOffConfig(woRes.data || []);
    } catch { toast.error('Failed to load attendance policies'); } finally { setIsLoading(false); }
  };

  const handleSavePolicy = async () => {
    if (!formData.leave_type_id) { toast.error('Please select a leave type'); return; }
    setIsSaving(true);
    try {
      const policyData = {
        leave_type_id: formData.leave_type_id, yearly_entitlement: formData.yearly_entitlement,
        monthly_accrual: formData.accrual_type === 'monthly' ? formData.monthly_accrual : null,
        accrual_type: formData.accrual_type, carry_forward_allowed: formData.carry_forward_allowed,
        max_carry_forward: formData.carry_forward_allowed ? formData.max_carry_forward : 0, is_active: true,
      };
      if (editingPolicy) {
        const { error } = await supabase.from('leave_policy').update(policyData).eq('id', editingPolicy.id);
        if (error) throw error;
        toast.success('Leave policy updated');
      } else {
        const { error } = await supabase.from('leave_policy').insert(policyData);
        if (error) { if (error.code === '23505') { toast.error('Policy already exists'); return; } throw error; }
        toast.success('Leave policy created');
      }
      setIsDialogOpen(false);
      fetchData();
    } catch { toast.error('Failed to save leave policy'); } finally { setIsSaving(false); }
  };

  const handleWeekOffChange = async (dayOfWeek: number, value: string) => {
    try {
      const isOff = value !== 'none';
      const updateData = { is_off: isOff, alternate_pattern: isOff ? value : 'none' };
      const { error } = await supabase.from('week_off_config').update(updateData).eq('day_of_week', dayOfWeek);
      if (error) throw error;
      setWeekOffConfig(prev => prev.map(c => c.day_of_week === dayOfWeek ? { ...c, ...updateData } : c));
      toast.success(`${dayNames[dayOfWeek]} schedule updated`);
    } catch { toast.error('Failed to update week-off configuration'); }
  };

  const getUnconfiguredLeaveTypes = () => {
    const configuredIds = leavePolicies.map(p => p.leave_type_id);
    return leaveTypes.filter(lt => !configuredIds.includes(lt.id));
  };

  if (isLoading) return <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="leave-entitlements" className="flex items-center gap-2"><Settings className="h-4 w-4" />Leave Entitlements</TabsTrigger>
          <TabsTrigger value="week-off" className="flex items-center gap-2"><Calendar className="h-4 w-4" />Week-Off Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="leave-entitlements" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div><CardTitle>Leave Entitlements</CardTitle><CardDescription>Configure yearly leave quotas and accrual settings</CardDescription></div>
                <Button onClick={() => { setEditingPolicy(null); setFormData({ leave_type_id: '', yearly_entitlement: 12, monthly_accrual: 0, accrual_type: 'yearly', carry_forward_allowed: false, max_carry_forward: 0 }); setIsDialogOpen(true); }} disabled={getUnconfiguredLeaveTypes().length === 0}><Plus className="h-4 w-4 mr-2" />Add Policy</Button>
              </div>
            </CardHeader>
            <CardContent>
              {leavePolicies.length === 0 ? <div className="text-center py-8 text-muted-foreground">No leave policies configured.</div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Leave Type</TableHead><TableHead>Yearly Entitlement</TableHead><TableHead>Accrual Type</TableHead><TableHead>Carry Forward</TableHead><TableHead>Max CF</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {leavePolicies.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.leave_types?.name || 'Unknown'}</TableCell>
                        <TableCell><Badge variant="secondary">{p.yearly_entitlement} days</Badge></TableCell>
                        <TableCell className="capitalize">{p.accrual_type}</TableCell>
                        <TableCell>{p.carry_forward_allowed ? <Badge className="bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                        <TableCell>{p.carry_forward_allowed ? `${p.max_carry_forward} days` : '-'}</TableCell>
                        <TableCell>{p.is_active ? <Badge className="bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}</TableCell>
                        <TableCell><Button variant="outline" size="sm" onClick={() => { setEditingPolicy(p); setFormData({ leave_type_id: p.leave_type_id, yearly_entitlement: p.yearly_entitlement, monthly_accrual: p.monthly_accrual || 0, accrual_type: p.accrual_type, carry_forward_allowed: p.carry_forward_allowed, max_carry_forward: p.max_carry_forward }); setIsDialogOpen(true); }}><Edit className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="week-off" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Week-Off Configuration</CardTitle><CardDescription>Define which days are weekly off and configure alternate patterns</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Day</TableHead><TableHead>Pattern</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {weekOffConfig.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{dayNames[c.day_of_week]}</TableCell>
                      <TableCell>
                        <Select value={c.alternate_pattern || 'none'} onValueChange={(v) => handleWeekOffChange(c.day_of_week, v)}>
                          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{alternatePatterns.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{c.is_off ? <Badge className="bg-warning/20 text-warning">Off</Badge> : <Badge className="bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]">Working</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingPolicy ? 'Edit Leave Policy' : 'Create Leave Policy'}</DialogTitle><DialogDescription>Configure leave entitlements and accrual settings</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Leave Type</Label><Select value={formData.leave_type_id} onValueChange={v => setFormData({...formData, leave_type_id: v})} disabled={!!editingPolicy}><SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger><SelectContent>{(editingPolicy ? leaveTypes : getUnconfiguredLeaveTypes()).map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Yearly Entitlement (days)</Label><Input type="number" value={formData.yearly_entitlement} onChange={e => setFormData({...formData, yearly_entitlement: parseInt(e.target.value) || 0})} min={0} max={365} /></div>
            <div><Label>Accrual Type</Label><Select value={formData.accrual_type} onValueChange={v => setFormData({...formData, accrual_type: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yearly">Yearly</SelectItem><SelectItem value="monthly">Monthly Accrual</SelectItem></SelectContent></Select></div>
            {formData.accrual_type === 'monthly' && <div><Label>Monthly Accrual (days/month)</Label><Input type="number" step="0.5" value={formData.monthly_accrual} onChange={e => setFormData({...formData, monthly_accrual: parseFloat(e.target.value) || 0})} /></div>}
            <div className="flex items-center space-x-2"><Switch checked={formData.carry_forward_allowed} onCheckedChange={checked => setFormData({...formData, carry_forward_allowed: checked})} /><Label>Allow Carry Forward</Label></div>
            {formData.carry_forward_allowed && <div><Label>Max Carry Forward (days)</Label><Input type="number" value={formData.max_carry_forward} onChange={e => setFormData({...formData, max_carry_forward: parseInt(e.target.value) || 0})} /></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button onClick={handleSavePolicy} disabled={isSaving}><Save className="h-4 w-4 mr-2" />{isSaving ? 'Saving...' : 'Save Policy'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AttendancePolicyConfig;
