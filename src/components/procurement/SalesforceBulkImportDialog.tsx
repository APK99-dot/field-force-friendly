import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, DownloadCloud, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported?: () => void;
}

interface RecordResult {
  salesforce_id: string;
  name?: string | null;
  status: "created" | "updated" | "failed";
  error?: string;
  po_status?: string;
  order_id?: string;
}

/**
 * Admin utility to bulk-import a date range of Salesforce Requisitions
 * (Requistion__c) along with their line items, vendors, quotes, invoices,
 * payments, and file attachments. Runs the single-record importer for
 * every requisition found, so records are matched on salesforce_id
 * (idempotent — safe to re-run).
 */
export default function SalesforceBulkImportDialog({ open, onOpenChange, onImported }: Props) {
  const [from, setFrom] = useState("2026-06-01");
  const [to, setTo] = useState("2026-06-30");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ total: number; created: number; updated: number; failed: number } | null>(null);
  const [records, setRecords] = useState<RecordResult[]>([]);

  const runImport = async () => {
    if (!from || !to) { toast.error("Pick both dates"); return; }
    setBusy(true);
    setSummary(null);
    setRecords([]);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-import-salesforce-procurement", {
        body: { from, to },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      setSummary({ total: d.total, created: d.created, updated: d.updated, failed: d.failed });
      setRecords(d.records || []);
      toast.success(`Import finished: ${d.created} new, ${d.updated} updated, ${d.failed} failed`);
      onImported?.();
    } catch (e: any) {
      toast.error(e?.message || "Bulk import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DownloadCloud className="h-4 w-4" />Bulk import from Salesforce</DialogTitle>
          <DialogDescription>
            Import every Salesforce Requisition (Requistion__c) whose "Requisition Raised Date"
            falls in the chosen range, along with line items, vendors, quotes, invoices,
            payments, and file attachments. Re-running is safe — existing records are updated
            (matched on Salesforce Id), original Salesforce timestamps are preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
            <Button className="flex-1" onClick={runImport} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing... (this can take several minutes)</> : "Start Import"}
            </Button>
          </div>
          {summary && (
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-md border p-2"><div className="font-semibold text-lg">{summary.total}</div>Total</div>
              <div className="rounded-md border p-2 bg-green-50 dark:bg-green-900/20"><div className="font-semibold text-lg">{summary.created}</div>Created</div>
              <div className="rounded-md border p-2 bg-blue-50 dark:bg-blue-900/20"><div className="font-semibold text-lg">{summary.updated}</div>Updated</div>
              <div className="rounded-md border p-2 bg-red-50 dark:bg-red-900/20"><div className="font-semibold text-lg">{summary.failed}</div>Failed</div>
            </div>
          )}
          {records.length > 0 && (
            <div className="rounded-md border max-h-72 overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Requisition</th>
                    <th className="text-left p-2">Salesforce Id</th>
                    <th className="text-left p-2">Result</th>
                    <th className="text-left p-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.salesforce_id} className="border-t">
                      <td className="p-2 truncate max-w-[200px]" title={r.name || ""}>{r.name || "—"}</td>
                      <td className="p-2 font-mono text-[10px]">{r.salesforce_id}</td>
                      <td className="p-2">
                        {r.status === "failed" ? (
                          <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-3 w-3" />Failed</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3 w-3" />{r.status}</span>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.error || r.po_status || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
