import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, DownloadCloud } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported?: () => void;
}

/**
 * Admin utility to import a single Salesforce Requisition (Requistion__c)
 * along with its line items, assigned vendors, and vendor quotes into the
 * local procurement schema. Records are matched on salesforce_id, so
 * running the import again for the same ID updates the existing record
 * instead of creating a duplicate.
 */
export default function SalesforceImportDialog({ open, onOpenChange, onImported }: Props) {
  const [sfId, setSfId] = useState("a01fu00000jFWGzAAO");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runImport = async () => {
    const id = sfId.trim();
    if (!id) { toast.error("Enter a Salesforce Requisition ID"); return; }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-salesforce-procurement", {
        body: { salesforce_id: id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data);
      toast.success("Salesforce requisition imported");
      onImported?.();
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DownloadCloud className="h-4 w-4" />Import from Salesforce</DialogTitle>
          <DialogDescription>
            Enter a Salesforce Requisition (Requistion__c) Id. The importer pulls line
            items, assigned vendors, and vendor quotes. Re-running for the same Id
            updates the existing record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Salesforce Requisition Id</Label>
            <Input value={sfId} onChange={(e) => setSfId(e.target.value)} placeholder="a01fu00000..." disabled={busy} />
          </div>
          {result && (
            <div className="rounded-md border bg-muted/40 p-2 text-[11px] max-h-56 overflow-auto">
              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
            <Button className="flex-1" onClick={runImport} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</> : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
