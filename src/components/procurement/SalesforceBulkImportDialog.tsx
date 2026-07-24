import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
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

interface BatchResponse {
  success?: boolean;
  error?: string;
  run_id: string;
  total: number;
  cursor: number;
  next_cursor: number;
  done: boolean;
  created: number;
  updated: number;
  failed: number;
  cumulative?: { created: number; updated: number; failed: number };
  records?: RecordResult[];
}

async function getFunctionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const text = await error.context.text();
    return text || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Bulk import failed";
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
  const [summary, setSummary] = useState<{ total: number; created: number; updated: number; failed: number; processed?: number } | null>(null);
  const [records, setRecords] = useState<RecordResult[]>([]);

  const runImport = async () => {
    if (!from || !to) { toast.error("Pick both dates"); return; }
    setBusy(true);
    setSummary(null);
    setRecords([]);
    try {
      let runId: string | null = null;
      let cursor = 0;
      let total = 0;
      let cumulative = { created: 0, updated: 0, failed: 0 };
      const allRecords: RecordResult[] = [];

      while (true) {
        const { data, error } = await supabase.functions.invoke("bulk-import-salesforce-procurement", {
          body: { from, to, run_id: runId, cursor, batch_size: 1 },
        });
        if (error) throw new Error(await getFunctionErrorMessage(error));
        const d = data as BatchResponse;
        if (d?.error) throw new Error(d.error);

        runId = d.run_id;
        cursor = d.next_cursor;
        total = d.total;
        cumulative = d.cumulative || {
          created: cumulative.created + (d.created || 0),
          updated: cumulative.updated + (d.updated || 0),
          failed: cumulative.failed + (d.failed || 0),
        };
        allRecords.push(...(d.records || []));
        setRecords([...allRecords]);
        setSummary({ total, processed: cursor, ...cumulative });

        if (d.done) break;
      }

      toast.success(`Import finished: ${cumulative.created} new, ${cumulative.updated} updated, ${cumulative.failed} failed`);
      onImported?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk import failed");
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
              <div className="rounded-md border p-2"><div className="font-semibold text-lg">{summary.processed ?? summary.total}/{summary.total}</div>Processed</div>
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
