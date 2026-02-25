import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function CompanyProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const companyQuery = useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_profile").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<any>(null);

  // Initialize form when data loads
  if (companyQuery.data && !form) {
    setForm(companyQuery.data);
  }

  const saveMutation = useMutation({
    mutationFn: async (formData: any) => {
      if (formData.id) {
        const { error } = await supabase.from("company_profile").update(formData).eq("id", formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_profile").insert(formData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
      toast.success("Company profile saved!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save");
    },
  });

  const handleSave = () => {
    if (form) saveMutation.mutate(form);
  };

  const updateField = (field: string, value: string) => {
    setForm((prev: any) => ({ ...(prev || {}), [field]: value }));
  };

  return (
    <motion.div className="p-4 space-y-6 max-w-4xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-controls")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Company Profile</h1>
          <p className="text-sm text-muted-foreground">Manage company information</p>
        </div>
      </div>

      {companyQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Company Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={form?.company_name || ""} onChange={(e) => updateField("company_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={form?.email || ""} onChange={(e) => updateField("email", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form?.phone || ""} onChange={(e) => updateField("phone", e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Address</Label>
                <Input value={form?.address || ""} onChange={(e) => updateField("address", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Bank Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input value={form?.bank_name || ""} onChange={(e) => updateField("bank_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input value={form?.bank_account || ""} onChange={(e) => updateField("bank_account", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>IFSC Code</Label>
                <Input value={form?.bank_ifsc || ""} onChange={(e) => updateField("bank_ifsc", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Tax Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GST Number</Label>
                <Input value={form?.gst_number || ""} onChange={(e) => updateField("gst_number", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>PAN Number</Label>
                <Input value={form?.pan_number || ""} onChange={(e) => updateField("pan_number", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Company Profile
          </Button>
        </>
      )}
    </motion.div>
  );
}
