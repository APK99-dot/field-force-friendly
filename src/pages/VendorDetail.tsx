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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Phone, Mail, MapPin, Edit, Trash2, Filter, User, Briefcase, StickyNote,
  FileText, Hash, IndianRupee, Users, Download, Package, Receipt, Wallet, TrendingUp,
  ClipboardList, FileCheck,
} from "lucide-react";
import { StarRating, getVendorRatingFlag } from "@/components/procurement/VendorRating";
import { resolveInvoiceFileUrl } from "@/utils/invoiceAttachments";

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
        .select("*, po:procurement_orders(po_number)")
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
    const sum = (k: string) => list.reduce((a, f) => a + (f[k] || 0), 0);
    const delivery = sum("delivery_timeliness") / n;
    const quality = sum("material_quality") / n;
    const quantity = sum("quantity_accuracy") / n;
    const overall = sum("overall_experience") / n;
    const avg = (delivery + quality + quantity + overall) / 4;
    return { avg, count: n, delivery, quality, quantity, overall, history: list };
  }, [feedback]);

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
      const url = await resolveInvoiceFileUrl(path);
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
    <motion.div className="space-y-4 p-4 pb-24 max-w-5xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => navigate("/vendors")}>
        <ArrowLeft className="h-4 w-4" /> Back to Vendor Management
      </Button>

      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-bold">{vendor.name}</h1>
        <Badge variant="outline" className={`text-xs ${statusColor(vendor.status)}`}>{vendor.status}</Badge>
        <Badge variant="outline" className={`text-[10px] ${flag.className}`}>{flag.emoji} {flag.label}</Badge>
      </div>

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
            <Card key={p.id} className="cursor-pointer hover:shadow-sm" onClick={() => navigate(`/procurement?po=${p.id}`)}>
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
            <Card key={g.id} className="cursor-pointer hover:shadow-sm" onClick={() => g.po_id && navigate(`/procurement?po=${g.po_id}`)}>
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
            <Card key={inv.id} className="cursor-pointer hover:shadow-sm" onClick={() => inv.po_id && navigate(`/procurement?po=${inv.po_id}`)}>
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
            <Card key={p.id} className="cursor-pointer hover:shadow-sm" onClick={() => p.invoice?.po_id && navigate(`/procurement?po=${p.invoice.po_id}`)}>
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
            <Card key={a.id} className={a.po_id ? "cursor-pointer hover:shadow-sm" : ""} onClick={() => a.po_id && navigate(`/procurement?po=${a.po_id}`)}>
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
                ].map((c) => (
                  <div key={c.label} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                    <div className="flex items-center gap-1.5">
                      <StarRating value={Math.round(c.v)} readOnly size={14} />
                      <span className="text-xs w-7 text-right">{c.v.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-2">
                <p className="text-xs font-medium">Feedback History</p>
                {rating.history.map((f: any) => {
                  const fb = (f.delivery_timeliness + f.material_quality + f.quantity_accuracy + f.overall_experience) / 4;
                  return (
                    <div key={f.id} className="rounded-lg border p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{f.po?.po_number || "—"}</span>
                        <span className="text-muted-foreground">{fmtDate(f.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StarRating value={Math.round(fb)} readOnly size={12} />
                        <span>{fb.toFixed(1)}</span>
                      </div>
                      {f.comments && <p className="text-muted-foreground">{f.comments}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
  );
}
