import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Check, X, ExternalLink } from "lucide-react";
import { statusColor } from "@/lib/procurement";
import {
  fieldDef, STATUS_OPTIONS, SOURCE_TYPE_OPTIONS, rawValue, type FieldDef,
} from "@/lib/procurementFields";
import type { PickOption } from "./ViewEditorDialog";

interface Props {
  rows: any[];
  columns: string[];
  siteOptions: PickOption[];
  vendorOptions: PickOption[];
  ownerOptions: PickOption[];
  onOpen: (row: any) => void;
  onSaved: () => void;
}

const fmtAmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

const fmtDMY = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
};

export default function ListViewTable({
  rows, columns, siteOptions, vendorOptions, ownerOptions, onOpen, onSaved,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const optionsFor = (def?: FieldDef): PickOption[] => {
    switch (def?.optionsSource) {
      case "status": return STATUS_OPTIONS;
      case "source_type": return SOURCE_TYPE_OPTIONS;
      case "site": return siteOptions;
      case "vendor": return vendorOptions;
      case "owner": return ownerOptions;
      default: return [];
    }
  };

  const label = (opts: PickOption[], v: unknown) =>
    opts.find((o) => o.value === String(v ?? ""))?.label ?? "—";

  const render = (row: any, key: string) => {
    const def = fieldDef(key);
    const val = rawValue(row, key);
    if (key === "status") {
      return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(String(val))}`}>{String(val ?? "—")}</Badge>;
    }
    if (key === "vendor_ids") {
      const ids = (val as string[]) || [];
      if (!ids.length) return "—";
      return ids.map((id) => label(vendorOptions, id)).join(", ");
    }
    if (def?.optionsSource && def.optionsSource !== "status") {
      if (!val) return "—";
      return label(optionsFor(def), val);
    }
    if (def?.type === "date") return fmtDMY(val as string);
    if (def?.type === "number") {
      if (key === "item_count") return String(val ?? 0);
      return fmtAmt(Number(val ?? 0));
    }
    const s = String(val ?? "").trim();
    return s || "—";
  };

  const startEdit = (row: any) => {
    const d: Record<string, any> = {};
    columns.forEach((key) => {
      const def = fieldDef(key);
      if (def?.editable) d[key] = row[key] ?? "";
    });
    setDraft(d);
    setEditingId(row.id);
  };

  const save = async (row: any) => {
    const patch: Record<string, any> = {};
    Object.entries(draft).forEach(([k, v]) => {
      const def = fieldDef(k);
      const col = def?.column ?? k;
      if (def?.type === "number") patch[col] = v === "" || v === null ? null : Number(v);
      else patch[col] = v === "" ? null : v;
    });
    setSaving(true);
    const { error } = await supabase.from("procurement_orders").update(patch).eq("id", row.id);
    setSaving(false);
    if (error) { toast.error(error.message || "Failed to update record"); return; }
    toast.success("Record updated");
    setEditingId(null);
    onSaved();
  };

  const editor = (key: string) => {
    const def = fieldDef(key);
    const value = draft[key] ?? "";
    const opts = optionsFor(def);
    if (def?.type === "picklist" && opts.length) {
      return (
        <Select value={String(value || "")} onValueChange={(v) => setDraft((p) => ({ ...p, [key]: v }))}>
          <SelectTrigger className="h-8 text-xs min-w-[130px]"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {opts.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
          </SelectContent>
        </Select>
      );
    }
    if (def?.multiline) {
      return <Textarea rows={2} className="text-xs min-w-[180px]" value={String(value)} onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))} />;
    }
    return (
      <Input
        className="h-8 text-xs min-w-[120px]"
        type={def?.type === "date" ? "date" : def?.type === "number" ? "number" : "text"}
        value={def?.type === "date" ? String(value || "").slice(0, 10) : String(value)}
        onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
      />
    );
  };

  return (
    <div className="border rounded-md overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((key) => (
              <th key={key} className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                {fieldDef(key)?.label ?? key}
              </th>
            ))}
            <th className="px-3 py-2 w-24 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = editingId === row.id;
            return (
              <tr key={row.id} className="border-t hover:bg-muted/30">
                {columns.map((key) => {
                  const def = fieldDef(key);
                  return (
                    <td key={key} className="px-3 py-2 align-middle whitespace-nowrap max-w-[280px] truncate">
                      {isEditing && def?.editable ? editor(key) : render(row, key)}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {isEditing ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" disabled={saving} onClick={() => save(row)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit inline" onClick={() => startEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Open record" onClick={() => onOpen(row)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
