import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { rollupNegativeScore, scoreBand, feedbackPenalty, improvementLabel, IMPROVEMENT_AREAS } from "@/lib/vendorScore";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Phone, Mail, MapPin, Edit, Trash2, Filter, User, Briefcase, StickyNote,
  FileText, Hash, IndianRupee, Users, Download, Package, Receipt, Wallet, TrendingUp,
  ClipboardList, FileCheck, Sparkles,
} from "lucide-react";
import { StarRating, getVendorRatingFlag } from "@/components/procurement/VendorRating";

import { LightningShell, LightningToggle, HighlightsPanel } from "@/components/procurement/lightning/LightningShell";
import { useUiMode, isLightning } from "@/hooks/useUiMode";
import AiRecordSummary from "@/components/ai/AiRecordSummary";

function VendorHeaderBar({ vendor, flag, rating }: { vendor: any; flag: { className: string; emoji: string; label: string }; rating: { avg: number; count: number } | null }) {
  const [uiMode] = useUiMode();
  const ratingNode = (
    <span className="flex items-center gap-1.5">
      <StarRating value={rating ? Math.round(rating.avg) : 0} readOnly size={13} />
      <span className="text-xs">
        {rating ? `${rating.avg.toFixed(1)} / 5 · ${rating.count} feedback` : "No feedback yet"}
      </span>
    </span>
  );
  if (isLightning(uiMode)) {
    return (
      <HighlightsPanel
        icon={<Briefcase className="h-5 w-5" />}
        eyebrow="Vendor"
        title={vendor.name}
        subtitle={[vendor.city, vendor.state].filter(Boolean).join(", ") || undefined}
        fields={[
          { label: "Status", value: <Badge variant="outline" className={`text-[10px] ${statusColor(vendor.status)}`}>{vendor.status}</Badge> },
          { label: "Avg Rating", value: ratingNode },
          { label: "Rating Flag", value: <span>{flag.emoji} {flag.label}</span> },
          { label: "Phone", value: vendor.phone?.[0] || "—" },
          { label: "Email", value: vendor.email?.[0] || "—" },
          { label: "GSTIN", value: vendor.gstin || "—" },
          { label: "PAN", value: vendor.pan || "—" },
        ]}
      />
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-bold">{vendor.name}</h1>
        <Badge variant="outline" className={`text-xs ${statusColor(vendor.status)}`}>{vendor.status}</Badge>
        <Badge variant="outline" className={`text-[10px] ${flag.className}`}>{flag.emoji} {flag.label}</Badge>
      </div>
      <div className="text-muted-foreground">{ratingNode}</div>
    </div>
  );
}


function toStringArray(val: any): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === "string") {
    try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean); } catch {}
    return val ? [val] : [];
  }
  return [];
}

function statusColor(status: string) {
  switch (status) {
    case "active": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "inactive": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    case "blacklisted": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "";
  }
}

const fmtInr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

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

function KpiCard({ label, value, icon: Icon, tone = "" }: { label: string; value: string; icon: any; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`text-sm font-semibold truncate ${tone}`}>{value}</p>
          </div>
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="text-center text-xs text-muted-foreground py-8">{label}</p>;
}

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserProfile();
  const [tab, setTab] = useState("overview");
  const [showAiSummary, setShowAiSummary] = useState(false);


  const { data: vendor, isLoading } = useQuery({
    queryKey: ["vendor", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        phone: toStringArray((data as any).phone),
        contact_person: toStringArray((data as any).contact_person),
        email: toStringArray((data as any).email),
      } as any;
    },
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ["vendor-feedback", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_vendor_feedback")
        .select("*, po:procurement_orders(po_number, requisition_number), grn:procurement_grns(grn_number)")
        .eq("vendor_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // POs where vendor is single or in vendor_ids
  const { data: orders = [] } = useQuery({
    queryKey: ["vendor-orders", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_orders")
        .select("id, po_number, requisition_number, order_date, status, total_amount, vendor_id, vendor_ids, expected_delivery_date, created_by, site:project_sites(name), source_type")
        .or(`vendor_id.eq.${id},vendor_ids.cs.{${id}}`)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const orderIds = useMemo(() => (orders as any[]).map((o) => o.id), [orders]);

  const { data: quotes = [] } = useQuery({
    queryKey: ["vendor-quotes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_vendor_quotes")
        .select("id, po_id, version, is_latest, status, submitted_at, created_at, po:procurement_orders(po_number, requisition_number), items:procurement_vendor_quote_items(rate_after_discount)")
        .eq("vendor_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((q: any) => ({
        ...q,
        amount: (q.items || []).reduce((s: number, i: any) => s + Number(i.rate_after_discount || 0), 0),
      }));
    },
  });

  const { data: grns = [] } = useQuery({
    queryKey: ["vendor-grns", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_grns")
        .select("id, po_id, grn_number, receipt_date, status, remarks, po:procurement_orders(id, po_number, requisition_number)")
        .eq("vendor_id", id)
        .order("receipt_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["vendor-invoices", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_invoices")
        .select("id, po_id, invoice_number, invoice_date, invoice_amount, po:procurement_orders(id, po_number, requisition_number), payments:procurement_invoice_payments(amount), attachments:procurement_invoice_attachments(file_name, file_path)")
        .eq("vendor_id", id)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return (data || []).map((inv: any) => {
        const paid = (inv.payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
        const balance = Number(inv.invoice_amount || 0) - paid;
        const paymentStatus = balance <= 0.01 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
        return { ...inv, paid, balance, paymentStatus };
      });
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["vendor-payments", id, invoices.map((i: any) => i.id).join(",")],
    enabled: !!id && invoices.length > 0,
    queryFn: async () => {
      const invIds = (invoices as any[]).map((i) => i.id);
      if (invIds.length === 0) return [];
      const { data, error } = await supabase
        .from("procurement_invoice_payments")
        .select("id, invoice_id, amount, payment_date, reference_number, bank_name, notes, created_at")
        .in("invoice_id", invIds)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      const invMap = new Map((invoices as any[]).map((i) => [i.id, i]));
      return (data || []).map((p: any) => ({ ...p, invoice: invMap.get(p.invoice_id) }));
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["vendor-attachments", id, orderIds.join(",")],
    enabled: !!id && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procurement_attachments")
        .select("id, po_id, file_name, file_path, scope, created_at, po:procurement_orders(id, po_number, requisition_number)")
        .eq("vendor_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const rating = useMemo(() => {
    const list = feedback as any[];
    if (list.length === 0) return null;
    const n = list.length;
    // Sub-ratings are optional (activity feedback captures only an overall star),
    // so average each dimension over the records that actually carry it.
    const avgOf = (k: string) => {
      const vals = list.map((f) => f[k]).filter((v) => v != null).map(Number);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const delivery = avgOf("delivery_timeliness");
    const quality = avgOf("material_quality");
    const quantity = avgOf("quantity_accuracy");
    const overall = avgOf("overall_experience");
    const dims = [delivery, quality, quantity, overall].filter((v): v is number => v != null);
    const avg = dims.length ? dims.reduce((a, b) => a + b, 0) / dims.length : 0;
    return { avg, count: n, delivery, quality, quantity, overall, history: list };
  }, [feedback]);

  const negative = useMemo(() => rollupNegativeScore(feedback as any[]), [feedback]);

  // Component breakdown of the negative score (average star penalty + average area penalty)
  const scoreBreakdown = useMemo(() => {
    const list = (feedback as any[]).filter((f) => f.overall_experience != null);
    if (list.length === 0) return null;
    const starPts = list.reduce((s, f) => s + (5 - Math.min(5, Math.max(1, Number(f.overall_experience)))) * 10, 0);
    const areaFlags = list.reduce((s, f) => s + Math.min(4, (f.improvement_areas || []).length), 0);
    const areaPts = areaFlags * 5;
    const avgStars = list.reduce((s, f) => s + Number(f.overall_experience), 0) / list.length;
    return {
      count: list.length,
      avgStars,
      starPts,
      areaPts,
      areaFlags,
      totalPts: starPts + areaPts,
      maxPts: list.length * 60,
    };
  }, [feedback]);

  // Feedback tab filters + sorting
  const [fbFrom, setFbFrom] = useState("");
  const [fbTo, setFbTo] = useState("");
  const [fbRef, setFbRef] = useState("all");
  const [fbAreas, setFbAreas] = useState<string[]>([]);
  const [fbSort, setFbSort] = useState("date_desc");

  const fbRefOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    (feedback as any[]).forEach((f) => {
      const label = [f.po?.po_number || f.po?.requisition_number, f.grn?.grn_number].filter(Boolean).join(" · ");
      const key = f.po_id || f.grn_id;
      if (key && label && !seen.has(key)) { seen.add(key); opts.push({ value: key, label }); }
    });
    return opts;
  }, [feedback]);

  const filteredFeedback = useMemo(() => {
    let list = [...(feedback as any[])];
    if (fbFrom) list = list.filter((f) => new Date(f.created_at) >= new Date(`${fbFrom}T00:00:00`));
    if (fbTo) list = list.filter((f) => new Date(f.created_at) <= new Date(`${fbTo}T23:59:59`));
    if (fbRef !== "all") list = list.filter((f) => f.po_id === fbRef || f.grn_id === fbRef);
    if (fbAreas.length) list = list.filter((f) => (f.improvement_areas || []).some((a: string) => fbAreas.includes(a)));
    const starsOf = (f: any) => Number(f.overall_experience || 0);
    const penOf = (f: any) => (f.overall_experience != null ? feedbackPenalty(Number(f.overall_experience), f.improvement_areas || []) : 0);
    list.sort((a, b) => {
      switch (fbSort) {
        case "date_asc": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "rating_desc": return starsOf(b) - starsOf(a);
        case "rating_asc": return starsOf(a) - starsOf(b);
        case "penalty_desc": return penOf(b) - penOf(a);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return list;
  }, [feedback, fbFrom, fbTo, fbRef, fbAreas, fbSort]);




  const perf = useMemo(() => {
    const pos = (orders as any[]).filter((o) => o.po_number);
    const totalPoValue = pos.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const totalInvoiced = (invoices as any[]).reduce((s, i) => s + Number(i.invoice_amount || 0), 0);
    const totalPaid = (invoices as any[]).reduce((s, i) => s + Number(i.paid || 0), 0);
    const pending = totalInvoiced - totalPaid;

    // On-time delivery: GRN receipt_date vs PO expected_delivery_date
    const poMap = new Map(pos.map((o) => [o.id, o]));
    let onTime = 0;
    let evaluated = 0;
    const deliveryDays: number[] = [];
    (grns as any[]).forEach((g) => {
      const po = poMap.get((g as any).po?.id) || pos.find((p) => p.po_number === (g as any).po?.po_number);
      const poFull = pos.find((p) => p.po_number === (g as any).po?.po_number);
      if (poFull) {
        const orderDate = new Date(poFull.order_date);
        const recDate = new Date(g.receipt_date);
        deliveryDays.push(Math.max(0, Math.round((recDate.getTime() - orderDate.getTime()) / 86400000)));
        if (poFull.expected_delivery_date) {
          evaluated++;
          if (recDate <= new Date(poFull.expected_delivery_date)) onTime++;
        }
      }
    });
    const avgDelivery = deliveryDays.length ? Math.round(deliveryDays.reduce((a, b) => a + b, 0) / deliveryDays.length) : null;
    const onTimePct = evaluated ? Math.round((onTime / evaluated) * 100) : null;

    return {
      totalPoValue, totalInvoiced, totalPaid, pending,
      orderCount: pos.length,
      grnCount: (grns as any[]).length,
      invoiceCount: (invoices as any[]).length,
      avgDelivery, onTimePct,
    };
  }, [orders, invoices, grns]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      toast({ title: "Vendor deleted" });
      navigate("/vendors");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    },
  });

  async function downloadAttachment(path: string, name: string) {
    try {
      // procurement_attachments rows live in the procurement-attachments bucket,
      // not the invoice-attachments bucket.
      const { data } = await supabase.storage.from("procurement-attachments").createSignedUrl(path, 3600);
      const url = data?.signedUrl || "";
      if (!url) throw new Error("Unable to resolve file URL");
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.download = name || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="p-4 space-y-4">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/vendors")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Vendor not found.</CardContent></Card>
      </div>
    );
  }

  const flag = getVendorRatingFlag(rating ? rating.avg : null);

  // Split orders into requisitions vs POs
  const requisitions = (orders as any[]);
  const pos = (orders as any[]).filter((o) => !!o.po_number);

  return (
    <LightningShell>
    <motion.div className="space-y-4 p-4 pb-24 max-w-5xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate("/vendors")}>
          <ArrowLeft className="h-4 w-4" /> Back to Vendor Management
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setShowAiSummary(true)}>
            <Sparkles className="h-4 w-4" /> AI Summary
          </Button>
          <LightningToggle />
        </div>
      </div>

      <AiRecordSummary
        open={showAiSummary}
        onOpenChange={setShowAiSummary}
        type="vendor"
        recordId={vendor.id}
        title={vendor.name}
      />

      <VendorHeaderBar vendor={vendor} flag={flag} rating={rating ? { avg: rating.avg, count: rating.count } : null} />

      <div className="flex gap-2">
        {vendor.phone[0] && (
          <a href={`tel:${vendor.phone[0]}`} className="flex-1">
            <Button variant="outline" className="w-full gap-2 text-emerald-600">
              <Phone className="h-4 w-4" /> Call
            </Button>
          </a>
        )}
        {vendor.email[0] && (
          <a href={`mailto:${vendor.email[0]}`} className="flex-1">
            <Button variant="outline" className="w-full gap-2 text-blue-600">
              <Mail className="h-4 w-4" /> Email
            </Button>
          </a>
        )}
      </div>


      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="requisitions" className="text-xs">Requisitions ({requisitions.length})</TabsTrigger>
          <TabsTrigger value="quotations" className="text-xs">Quotations ({quotes.length})</TabsTrigger>
          <TabsTrigger value="pos" className="text-xs">POs ({pos.length})</TabsTrigger>
          <TabsTrigger value="grns" className="text-xs">GRNs ({grns.length})</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documents ({attachments.length})</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs">Performance</TabsTrigger>
          <TabsTrigger value="feedback" className="text-xs">Feedback ({(feedback as any[]).length})</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-3 mt-4">
          {vendor.phone.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Phone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Phone</p>
                {vendor.phone.map((p: string, i: number) => (
                  <a key={i} href={`tel:${p}`} className="text-sm block text-primary hover:underline">{p}</a>
                ))}
              </div>
            </div>
          )}
          {vendor.contact_person.filter(Boolean).length > 0 && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Contact Person</p>
                {vendor.contact_person.filter(Boolean).map((c: string, i: number) => (
                  <p key={i} className="text-sm">{c}</p>
                ))}
              </div>
            </div>
          )}
          {vendor.email.filter(Boolean).length > 0 && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Email</p>
                {vendor.email.filter(Boolean).map((e: string, i: number) => (
                  <a key={i} href={`mailto:${e}`} className="text-sm block text-primary hover:underline">{e}</a>
                ))}
              </div>
            </div>
          )}
          {vendor.address && <DetailRow icon={MapPin} label="Address" value={vendor.address} />}
          {vendor.category && <DetailRow icon={Filter} label="Category" value={vendor.category} />}
          {vendor.gst_number && <DetailRow icon={FileText} label="GST Number" value={vendor.gst_number} />}
          {vendor.pan_number && <DetailRow icon={Hash} label="PAN Number" value={vendor.pan_number} />}
          {vendor.annual_revenue != null && <DetailRow icon={IndianRupee} label="Annual Revenue" value={Number(vendor.annual_revenue).toLocaleString("en-IN")} />}
          {vendor.employee_count != null && <DetailRow icon={Users} label="Employees" value={String(vendor.employee_count)} />}
          {vendor.services && <DetailRow icon={Briefcase} label="Services" value={vendor.services} />}
          {vendor.notes && <DetailRow icon={StickyNote} label="Notes" value={vendor.notes} />}
        </TabsContent>

        {/* Requisitions */}
        <TabsContent value="requisitions" className="mt-4 space-y-2">
          {requisitions.length === 0 ? <EmptyRow label="No requisitions with this vendor." /> : requisitions.map((r: any) => (
            <Card key={r.id} className="cursor-pointer hover:shadow-sm" onClick={() => navigate(`/procurement?po=${r.id}`)}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.requisition_number || "—"} <span className="text-muted-foreground">· {r.po_number || "No PO yet"}</span></p>
                  <p className="text-[11px] text-muted-foreground">{r.site?.name || "—"} · {fmtDate(r.order_date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                  <span className="text-sm font-semibold">{fmtInr(r.total_amount)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Quotations */}
        <TabsContent value="quotations" className="mt-4 space-y-2">
          {quotes.length === 0 ? <EmptyRow label="No quotations from this vendor." /> : quotes.map((q: any) => (
            <Card key={q.id} className="cursor-pointer hover:shadow-sm" onClick={() => q.po_id && navigate(`/procurement?po=${q.po_id}&vendor=${id}&section=quote`)}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    {q.po?.requisition_number || q.po?.po_number || "—"}
                    <Badge variant="secondary" className="text-[10px]">V{q.version}</Badge>
                    {q.is_latest && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">Latest</Badge>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Submitted: {fmtDate(q.submitted_at || q.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{q.status}</Badge>
                  <span className="text-sm font-semibold">{fmtInr(q.amount)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* POs */}
        <TabsContent value="pos" className="mt-4 space-y-2">
          {pos.length === 0 ? <EmptyRow label="No POs issued to this vendor." /> : pos.map((p: any) => (
            <Card key={p.id} className="cursor-pointer hover:shadow-sm" onClick={() => navigate(`/procurement?po=${p.id}&vendor=${id}`)}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.po_number} <span className="text-muted-foreground">· {p.requisition_number || "—"}</span></p>
                  <p className="text-[11px] text-muted-foreground">Issued: {fmtDate(p.order_date)} · Expected: {fmtDate(p.expected_delivery_date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                  <span className="text-sm font-semibold">{fmtInr(p.total_amount)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* GRNs */}
        <TabsContent value="grns" className="mt-4 space-y-2">
          {grns.length === 0 ? <EmptyRow label="No goods receipts recorded." /> : (grns as any[]).map((g) => (
            <Card key={g.id} className="cursor-pointer hover:shadow-sm" onClick={() => g.po_id && navigate(`/procurement?po=${g.po_id}&vendor=${id}&section=grns`)}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{g.grn_number || "—"} <span className="text-muted-foreground">· {g.po?.po_number || "—"}</span></p>
                  <p className="text-[11px] text-muted-foreground">Received: {fmtDate(g.receipt_date)}{g.remarks ? ` · ${g.remarks}` : ""}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{g.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices" className="mt-4 space-y-2">
          {invoices.length === 0 ? <EmptyRow label="No invoices from this vendor." /> : (invoices as any[]).map((inv) => (
            <Card key={inv.id} className="cursor-pointer hover:shadow-sm" onClick={() => inv.po_id && navigate(`/procurement?po=${inv.po_id}&vendor=${id}&section=invoices&invoice=${inv.id}`)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{inv.invoice_number || "—"} <span className="text-muted-foreground">· {inv.po?.po_number || inv.po?.requisition_number || "—"}</span></p>
                    <p className="text-[11px] text-muted-foreground">Date: {fmtDate(inv.invoice_date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${inv.paymentStatus === "Paid" ? "bg-emerald-100 text-emerald-700" : inv.paymentStatus === "Partial" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                      {inv.paymentStatus}
                    </Badge>
                    <span className="text-sm font-semibold">{fmtInr(inv.invoice_amount)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Paid: {fmtInr(inv.paid)}</span>
                  <span>Outstanding: <span className={inv.balance > 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>{fmtInr(inv.balance)}</span></span>
                </div>
                {(inv.attachments || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {inv.attachments.map((a: any, i: number) => (
                      <Button key={i} variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={(e) => { e.stopPropagation(); downloadAttachment(a.file_path, a.file_name); }}>
                        <Download className="h-3 w-3" /> {a.file_name}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments" className="mt-4 space-y-2">
          {payments.length === 0 ? <EmptyRow label="No payments recorded." /> : (payments as any[]).map((p) => (
            <Card key={p.id} className="cursor-pointer hover:shadow-sm" onClick={() => p.invoice?.po_id && navigate(`/procurement?po=${p.invoice.po_id}&vendor=${id}&section=financials`)}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{fmtInr(p.amount)} <span className="text-muted-foreground text-xs">· {p.invoice?.invoice_number || "—"}</span></p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(p.payment_date || p.created_at)}
                    {p.reference_number ? ` · Ref ${p.reference_number}` : ""}
                    {p.bank_name ? ` · ${p.bank_name}` : ""}
                  </p>
                  {p.notes && <p className="text-[11px] text-muted-foreground italic">{p.notes}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="mt-4 space-y-2">
          {attachments.length === 0 ? <EmptyRow label="No documents on record." /> : (attachments as any[]).map((a) => (
            <Card key={a.id} className={a.po_id ? "cursor-pointer hover:shadow-sm" : ""} onClick={() => a.po_id && navigate(`/procurement?po=${a.po_id}&vendor=${id}`)}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.file_name}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {a.scope} · {a.po?.po_number || a.po?.requisition_number || "—"} · {fmtDate(a.created_at)}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={(e) => { e.stopPropagation(); downloadAttachment(a.file_path, a.file_name); }}>
                  <Download className="h-3 w-3" /> Download
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KpiCard label="Total PO Value" value={fmtInr(perf.totalPoValue)} icon={IndianRupee} />
            <KpiCard label="Total Invoiced" value={fmtInr(perf.totalInvoiced)} icon={Receipt} />
            <KpiCard label="Total Paid" value={fmtInr(perf.totalPaid)} icon={Wallet} tone="text-emerald-600" />
            <KpiCard label="Pending" value={fmtInr(perf.pending)} icon={IndianRupee} tone={perf.pending > 0 ? "text-rose-600" : ""} />
            <KpiCard label="Orders" value={String(perf.orderCount)} icon={Package} />
            <KpiCard label="GRNs" value={String(perf.grnCount)} icon={FileCheck} />
            <KpiCard label="Invoices" value={String(perf.invoiceCount)} icon={ClipboardList} />
            <KpiCard label="Avg Delivery" value={perf.avgDelivery != null ? `${perf.avgDelivery} days` : "—"} icon={TrendingUp} />
            <KpiCard label="On-time %" value={perf.onTimePct != null ? `${perf.onTimePct}%` : "—"} icon={TrendingUp} tone={perf.onTimePct != null && perf.onTimePct >= 80 ? "text-emerald-600" : perf.onTimePct != null && perf.onTimePct < 50 ? "text-rose-600" : ""} />
            <KpiCard label="Vendor Rating" value={rating ? `${rating.avg.toFixed(1)} / 5` : "Not rated"} icon={TrendingUp} />
          </div>

          {rating && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Feedback Breakdown</p>
                <div className="flex items-center gap-2">
                  <StarRating value={Math.round(rating.avg)} readOnly size={16} />
                  <span className="text-xs text-muted-foreground">({rating.count} review{rating.count > 1 ? "s" : ""})</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: "Delivery Timeliness", v: rating.delivery },
                  { label: "Material Quality", v: rating.quality },
                  { label: "Quantity Accuracy", v: rating.quantity },
                  { label: "Overall Experience", v: rating.overall },
                ].filter((c) => c.v != null).map((c) => (
                  <div key={c.label} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                    <div className="flex items-center gap-1.5">
                      <StarRating value={Math.round(c.v as number)} readOnly size={14} />
                      <span className="text-xs w-7 text-right">{(c.v as number).toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Feedback */}
        <TabsContent value="feedback" className="mt-4 space-y-4">
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">Negative Score</p>
                  <p className="text-xs text-muted-foreground">Rolled up across {negative.count} feedback record{negative.count === 1 ? "" : "s"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold tabular-nums">{negative.score ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">/ 100</span>
                  <Badge className={cn("text-[10px]", scoreBand(negative.score).className)}>{scoreBand(negative.score).label}</Badge>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    (negative.score ?? 0) <= 20 ? "bg-emerald-500" : (negative.score ?? 0) <= 40 ? "bg-yellow-500" : (negative.score ?? 0) <= 70 ? "bg-orange-500" : "bg-red-500",
                  )}
                  style={{ width: `${negative.score ?? 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{scoreBand(negative.score).description}</p>

              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
                <p className="font-semibold">How the score works</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>Each Goods Receipt feedback earns a star penalty: <strong>(5 − stars) × 10</strong> — 0 points for 5★, 40 points for 1★.</li>
                  <li>Every “Improvement Required In” area flagged adds <strong>5 points</strong> (max 20 for all four areas).</li>
                  <li>Maximum penalty per feedback is <strong>60</strong>, normalised to a 0–100 scale.</li>
                  <li>The vendor score is the <strong>average</strong> of all normalised penalties. Lower is better.</li>
                  <li>Bands: 0–20 Low Risk · 21–40 Moderate · 41–70 High Risk · 71+ Critical.</li>
                </ul>
              </div>

              {scoreBreakdown && (
                <div className="rounded-lg border p-3 text-xs space-y-2">
                  <p className="font-semibold">Score breakdown for this vendor</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground">Contributing feedback</p>
                      <p className="text-sm font-semibold tabular-nums">{scoreBreakdown.count}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground">Average stars</p>
                      <p className="text-sm font-semibold tabular-nums">{scoreBreakdown.avgStars.toFixed(2)} / 5</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground">Star penalty points</p>
                      <p className="text-sm font-semibold tabular-nums">{scoreBreakdown.starPts}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2">
                      <p className="text-[10px] text-muted-foreground">Area penalty points</p>
                      <p className="text-sm font-semibold tabular-nums">{scoreBreakdown.areaPts}<span className="text-[10px] text-muted-foreground font-normal"> ({scoreBreakdown.areaFlags} flags × 5)</span></p>
                    </div>
                  </div>
                  <div className="rounded-md bg-background border p-2 font-mono text-[11px] leading-relaxed overflow-x-auto">
                    Score = (Star {scoreBreakdown.starPts} + Areas {scoreBreakdown.areaPts}) ÷ ({scoreBreakdown.count} × 60) × 100
                    {" = "}
                    <strong>{negative.score ?? 0}</strong> / 100
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Total penalty {scoreBreakdown.totalPts} of a possible {scoreBreakdown.maxPts} points across {scoreBreakdown.count} feedback record{scoreBreakdown.count === 1 ? "" : "s"}.
                  </p>
                </div>
              )}

              {Object.keys(negative.areaCounts).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold">Most flagged improvement areas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(negative.areaCounts)
                      .sort((a, b) => Number(b[1]) - Number(a[1]))
                      .map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[10px]">{improvementLabel(k)} · {String(v)}</Badge>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Filters & sorting */}
          <Card>
            <CardContent className="py-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" /> Filter feedback</p>
                {(fbFrom || fbTo || fbRef !== "all" || fbAreas.length > 0 || fbSort !== "date_desc") && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFbFrom(""); setFbTo(""); setFbRef("all"); setFbAreas([]); setFbSort("date_desc"); }}>
                    Clear
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">From</label>
                  <Input type="date" value={fbFrom} onChange={(e) => setFbFrom(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">To</label>
                  <Input type="date" value={fbTo} onChange={(e) => setFbTo(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">GRN / PO</label>
                  <Select value={fbRef} onValueChange={setFbRef}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All records</SelectItem>
                      {fbRefOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Sort by</label>
                  <Select value={fbSort} onValueChange={setFbSort}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date_desc">Newest first</SelectItem>
                      <SelectItem value="date_asc">Oldest first</SelectItem>
                      <SelectItem value="rating_desc">Rating: high to low</SelectItem>
                      <SelectItem value="rating_asc">Rating: low to high</SelectItem>
                      <SelectItem value="penalty_desc">Highest penalty first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Improvement categories</label>
                <div className="flex flex-wrap gap-1.5">
                  {IMPROVEMENT_AREAS.map((a) => {
                    const active = fbAreas.includes(a.value);
                    return (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => setFbAreas((p) => (active ? p.filter((x) => x !== a.value) : [...p, a.value]))}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
                        )}
                      >
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Feedback History ({filteredFeedback.length}
              {filteredFeedback.length !== (feedback as any[]).length ? ` of ${(feedback as any[]).length}` : ""})
            </p>
            {(feedback as any[]).length === 0 && (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No feedback captured yet.</CardContent></Card>
            )}
            {(feedback as any[]).length > 0 && filteredFeedback.length === 0 && (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No feedback matches these filters.</CardContent></Card>
            )}
            {filteredFeedback.map((f: any) => {

              const dims = [f.delivery_timeliness, f.material_quality, f.quantity_accuracy, f.overall_experience].filter((v) => v != null).map(Number);
              const fb = dims.length ? dims.reduce((a, b) => a + b, 0) / dims.length : 0;
              const pen = f.overall_experience != null ? feedbackPenalty(Number(f.overall_experience), f.improvement_areas || []) : null;
              return (
                <Card key={f.id}>
                  <CardContent className="py-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium">
                        {f.po?.po_number || f.po?.requisition_number || "—"}
                        {f.grn?.grn_number && <span className="text-muted-foreground font-normal"> · {f.grn.grn_number}</span>}
                      </span>
                      <span className="text-muted-foreground">{fmtDate(f.created_at)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StarRating value={Math.round(fb)} readOnly size={14} />
                      <span>{fb.toFixed(1)}</span>
                      {pen != null && <Badge variant="outline" className="text-[10px]">Penalty {pen}</Badge>}
                    </div>
                    {(f.improvement_areas || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(f.improvement_areas as string[]).map((a) => (
                          <Badge key={a} className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{improvementLabel(a)}</Badge>
                        ))}
                      </div>
                    )}
                    {f.comments && <p className="text-muted-foreground">{f.comments}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

      </Tabs>

      {isAdmin && (
        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => navigate(`/vendors?edit=${vendor.id}`)}>
            <Edit className="h-3.5 w-3.5" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="flex-1 gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete <strong>{vendor.name}</strong>? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteMutation.mutate()}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </motion.div>
    </LightningShell>
  );
}
