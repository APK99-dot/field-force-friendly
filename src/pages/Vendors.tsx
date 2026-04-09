import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Building2,
  Edit,
  Trash2,
  Filter,
  User,
  Briefcase,
  StickyNote,
  X,
} from "lucide-react";

const CATEGORIES = [
  "Civil",
  "Electrical",
  "Plumbing",
  "Painting",
  "Carpentry",
  "Fabrication",
  "Transport",
  "Labour Supply",
  "Material Supply",
  "Other",
];

const STATUSES = ["active", "inactive", "blacklisted"] as const;
type VendorStatus = (typeof STATUSES)[number];

interface Vendor {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  contact_person: string | null;
  email: string | null;
  address: string | null;
  category: string | null;
  services: string | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface VendorForm {
  name: string;
  phone: string;
  company: string;
  contact_person: string;
  email: string;
  address: string;
  category: string;
  services: string;
  notes: string;
  status: VendorStatus;
}

const emptyForm: VendorForm = {
  name: "",
  phone: "",
  company: "",
  contact_person: "",
  email: "",
  address: "",
  category: "",
  services: "",
  notes: "",
  status: "active",
};

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "inactive":
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "blacklisted":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "";
  }
}

export default function Vendors() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile, isAdmin } = useUserProfile();

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState<VendorForm>(emptyForm);

  // Fetch vendors
  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Vendor[];
    },
  });

  // Filter + search
  const filtered = useMemo(() => {
    let list = vendors;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.phone.includes(q) ||
          (v.company && v.company.toLowerCase().includes(q))
      );
    }
    if (filterCategory !== "all") {
      list = list.filter((v) => v.category === filterCategory);
    }
    if (filterStatus !== "all") {
      list = list.filter((v) => v.status === filterStatus);
    }
    return list;
  }, [vendors, search, filterCategory, filterStatus]);

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: async (payload: { form: VendorForm; id?: string }) => {
      const row: any = {
        name: payload.form.name.trim(),
        phone: payload.form.phone.trim(),
        company: payload.form.company.trim() || null,
        contact_person: payload.form.contact_person.trim() || null,
        email: payload.form.email.trim() || null,
        address: payload.form.address.trim() || null,
        category: payload.form.category || null,
        services: payload.form.services.trim() || null,
        notes: payload.form.notes.trim() || null,
        status: payload.form.status,
      };
      if (payload.id) {
        const { error } = await supabase.from("vendors").update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        row.created_by = profile?.id;
        const { error } = await supabase.from("vendors").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: vars.id ? "Vendor updated" : "Vendor added" });
      closeForm();
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (msg.includes("vendors_phone_unique") || msg.includes("duplicate key")) {
        toast({ title: "Duplicate phone", description: "A vendor with this phone number already exists.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: "Vendor deleted" });
      setDeleteVendor(null);
      if (detailVendor) setDetailVendor(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    },
  });

  const openAdd = useCallback(() => {
    setEditingVendor(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  }, []);

  const openEdit = useCallback((v: Vendor) => {
    setEditingVendor(v);
    setForm({
      name: v.name,
      phone: v.phone,
      company: v.company || "",
      contact_person: v.contact_person || "",
      email: v.email || "",
      address: v.address || "",
      category: v.category || "",
      services: v.services || "",
      notes: v.notes || "",
      status: (v.status as VendorStatus) || "active",
    });
    setIsFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingVendor(null);
    setForm(emptyForm);
  }, []);

  const handleSubmit = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Name and Phone are required", variant: "destructive" });
      return;
    }
    upsertMutation.mutate({ form, id: editingVendor?.id });
  };

  const updateField = (field: keyof VendorForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <motion.div
      className="space-y-4 p-4 pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Vendor Management</h1>
          <p className="text-xs text-muted-foreground">{vendors.length} vendors</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Vendor
          </Button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="blacklisted">Blacklisted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Vendor List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {vendors.length === 0 ? "No vendors yet. Add your first vendor." : "No vendors match your search/filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <Card
              key={v.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setDetailVendor(v)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{v.name}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(v.status)}`}>
                        {v.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {v.phone}
                    </p>
                    {v.company && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3" /> {v.company}
                      </p>
                    )}
                  </div>
                  {v.category && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">{v.category}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Vendor name" />
            </div>
            <div>
              <Label className="text-xs">Phone *</Label>
              <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="Phone number" type="tel" />
            </div>
            <div>
              <Label className="text-xs">Company</Label>
              <Input value={form.company} onChange={(e) => updateField("company", e.target.value)} placeholder="Company name" />
            </div>
            <div>
              <Label className="text-xs">Contact Person</Label>
              <Input value={form.contact_person} onChange={(e) => updateField("contact_person", e.target.value)} placeholder="Contact person" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="Email" type="email" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Textarea value={form.address} onChange={(e) => updateField("address", e.target.value)} placeholder="Address" rows={2} />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(val) => updateField("category", val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Services</Label>
              <Input value={form.services} onChange={(e) => updateField("services", e.target.value)} placeholder="Services offered" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Notes" rows={2} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(val) => updateField("status", val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="blacklisted">Blacklisted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Saving..." : editingVendor ? "Update" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Sheet */}
      <Sheet open={!!detailVendor} onOpenChange={(open) => !open && setDetailVendor(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailVendor && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {detailVendor.name}
                  <Badge variant="outline" className={`text-xs ${statusColor(detailVendor.status)}`}>
                    {detailVendor.status}
                  </Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <a href={`tel:${detailVendor.phone}`} className="flex-1">
                    <Button variant="outline" className="w-full gap-2 text-emerald-600">
                      <Phone className="h-4 w-4" /> Call
                    </Button>
                  </a>
                  {detailVendor.email && (
                    <a href={`mailto:${detailVendor.email}`} className="flex-1">
                      <Button variant="outline" className="w-full gap-2 text-blue-600">
                        <Mail className="h-4 w-4" /> Email
                      </Button>
                    </a>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-3">
                  <DetailRow icon={Phone} label="Phone" value={detailVendor.phone} />
                  {detailVendor.company && <DetailRow icon={Building2} label="Company" value={detailVendor.company} />}
                  {detailVendor.contact_person && <DetailRow icon={User} label="Contact Person" value={detailVendor.contact_person} />}
                  {detailVendor.email && <DetailRow icon={Mail} label="Email" value={detailVendor.email} />}
                  {detailVendor.address && <DetailRow icon={MapPin} label="Address" value={detailVendor.address} />}
                  {detailVendor.category && <DetailRow icon={Filter} label="Category" value={detailVendor.category} />}
                  {detailVendor.services && <DetailRow icon={Briefcase} label="Services" value={detailVendor.services} />}
                  {detailVendor.notes && <DetailRow icon={StickyNote} label="Notes" value={detailVendor.notes} />}
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => {
                        openEdit(detailVendor);
                        setDetailVendor(null);
                      }}
                    >
                      <Edit className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => setDeleteVendor(detailVendor)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteVendor} onOpenChange={(open) => !open && setDeleteVendor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteVendor?.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteVendor && deleteMutation.mutate(deleteVendor.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
