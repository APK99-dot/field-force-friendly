import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ProductivityTracking from "@/components/ProductivityTracking";

interface ExpenseMasterConfig {
  id: string;
  ta_type: string;
  fixed_ta_amount: number;
  da_type: string;
  fixed_da_amount: number;
}

export default function AdminExpenseManagement() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<ExpenseMasterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('expense_master_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) setConfig(data as ExpenseMasterConfig);
    } catch (error) {
      console.error('Error fetching expense config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('expense_master_config')
        .update({
          ta_type: config.ta_type,
          fixed_ta_amount: config.fixed_ta_amount,
          da_type: config.da_type,
          fixed_da_amount: config.fixed_da_amount,
        })
        .eq('id', config.id);
      if (error) throw error;
      toast.success("Expense master configuration saved successfully");
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-2 sm:p-4">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-4">
          <Button onClick={() => navigate('/admin-controls')} variant="ghost" size="sm" className="p-1.5 sm:p-2">
            <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">Expense Master</h1>
            <p className="text-sm sm:text-base text-muted-foreground hidden sm:block">Configure expense settings and track team productivity</p>
          </div>
        </div>

        {/* Expense Master Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* TA Type */}
              <div className="space-y-2">
                <Label htmlFor="ta_type">TA Type</Label>
                <Select
                  value={config?.ta_type || 'fixed'}
                  onValueChange={(value) => setConfig(prev => prev ? { ...prev, ta_type: value } : null)}
                >
                  <SelectTrigger id="ta_type"><SelectValue placeholder="Select TA Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed TA</SelectItem>
                    <SelectItem value="from_beat">TA Amount from Beat</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {config?.ta_type === 'fixed' ? 'Fixed daily TA amount will be used' : 'TA amount from My Beat will be used'}
                </p>
              </div>

              {/* Fixed TA Amount */}
              {config?.ta_type === 'fixed' && (
                <div className="space-y-2">
                  <Label htmlFor="fixed_ta">Fixed TA Amount (₹)</Label>
                  <Input id="fixed_ta" type="number" min="0"
                    value={config?.fixed_ta_amount || 0}
                    onChange={(e) => setConfig(prev => prev ? { ...prev, fixed_ta_amount: Number(e.target.value) } : null)}
                    placeholder="Enter fixed TA amount" />
                  <p className="text-xs text-muted-foreground">Daily travel allowance in Rs.</p>
                </div>
              )}

              {/* DA Amount */}
              <div className="space-y-2">
                <Label htmlFor="da_amount">DA Amount (₹)</Label>
                <Input id="da_amount" type="number" min="0"
                  value={config?.fixed_da_amount || 0}
                  onChange={(e) => setConfig(prev => prev ? { ...prev, fixed_da_amount: Number(e.target.value) } : null)}
                  placeholder="Enter DA amount" />
                <p className="text-xs text-muted-foreground">Daily allowance amount in Rs.</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Configuration
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Productivity Tracking */}
        <ProductivityTracking />
      </div>
    </div>
  );
}
