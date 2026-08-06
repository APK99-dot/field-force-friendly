import { PROC_STATUSES } from "@/lib/procurement";

export type FieldType = "text" | "picklist" | "date" | "number";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Where the picklist options come from (resolved at runtime by the caller). */
  optionsSource?: "status" | "source_type" | "site" | "vendor" | "owner";
  /** Editable inline from the list view. */
  editable?: boolean;
  /** Column of procurement_orders written on inline save (defaults to key). */
  column?: string;
  /** Long-form field — renders a textarea when edited inline. */
  multiline?: boolean;
}

export const PROC_FIELDS: FieldDef[] = [
  { key: "requisition_number", label: "Requisition #", type: "text" },
  { key: "requisition_name", label: "Requisition Name", type: "text", editable: true },
  { key: "po_number", label: "PO #", type: "text" },
  { key: "status", label: "Status", type: "picklist", optionsSource: "status", editable: true },
  { key: "source_type", label: "Source Type", type: "picklist", optionsSource: "source_type" },
  { key: "site_id", label: "Site", type: "picklist", optionsSource: "site", editable: true },
  { key: "transfer_from_site_id", label: "Transfer From Site", type: "picklist", optionsSource: "site", editable: true },
  { key: "vendor_ids", label: "Vendor", type: "picklist", optionsSource: "vendor" },
  { key: "created_by", label: "Owner", type: "picklist", optionsSource: "owner" },
  { key: "order_date", label: "Requisition Date", type: "date", editable: true },
  { key: "expected_delivery_date", label: "Expected Delivery Date", type: "date", editable: true },
  { key: "total_amount", label: "Total Amount", type: "number" },
  { key: "estimated_budget", label: "Estimated Budget", type: "number", editable: true },
  { key: "payment_terms", label: "Payment Terms", type: "text", editable: true },
  { key: "bill_to", label: "Bill To", type: "text", editable: true },
  { key: "ship_to", label: "Ship To", type: "text", editable: true },
  { key: "requisition_notes", label: "Notes", type: "text", editable: true, multiline: true },
  { key: "item_count", label: "Items", type: "number" },
];

export const DEFAULT_VIEW_COLUMNS = [
  "requisition_number",
  "requisition_name",
  "status",
  "site_id",
  "created_by",
  "order_date",
  "total_amount",
];

export function fieldDef(key: string): FieldDef | undefined {
  return PROC_FIELDS.find((f) => f.key === key);
}

export const SOURCE_TYPE_OPTIONS = [
  { value: "vendor", label: "Vendor Purchase" },
  { value: "internal_transfer", label: "Internal Transfer" },
];

export const STATUS_OPTIONS = PROC_STATUSES.map((s) => ({ value: s, label: s }));

export const OPERATORS: Record<FieldType, { value: string; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "equals", label: "equals" },
    { value: "starts_with", label: "starts with" },
    { value: "in_list", label: "is one of (comma separated)" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  picklist: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "not equals" },
    { value: "in", label: "is one of (multi-select)" },
    { value: "is_empty", label: "is empty" },
  ],
  date: [
    { value: "on", label: "on" },
    { value: "before", label: "before" },
    { value: "after", label: "after" },
    { value: "between", label: "between" },
    { value: "last_n_days", label: "in the last N days" },
    { value: "this_month", label: "this month" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "between", label: "between" },
  ],
};

export interface FilterCondition {
  field: string;
  operator: string;
  value: string;
  /** Second value for "between". */
  value2?: string;
  /** Multi-select values for "is one of". */
  values?: string[];
}

export interface ViewFilters {
  match: "all" | "any";
  conditions: FilterCondition[];
}

export interface ListView {
  id: string;
  name: string;
  owner_id: string;
  filters: ViewFilters;
  columns: string[];
  sort_field: string | null;
  sort_dir: "asc" | "desc";
  visibility: "private" | "everyone" | "selected";
  shared_user_ids: string[];
  is_default: boolean;
}

/** Resolve the comparable value of a field for a given order row. */
export function rawValue(order: any, key: string): unknown {
  if (key === "item_count") return order.procurement_items?.length ?? 0;
  if (key === "vendor_ids") {
    const ids: string[] = order.vendor_ids || (order.vendor_id ? [order.vendor_id] : []);
    return ids;
  }
  return order[key];
}

/** Values for multi-select / comma separated operators. */
function listValues(c: FilterCondition): string[] {
  if (c.values && c.values.length) return c.values.map((v) => String(v).trim()).filter(Boolean);
  return String(c.value ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function matchOne(order: any, c: FilterCondition): boolean {
  const def = fieldDef(c.field);
  if (!def) return true;
  const val = rawValue(order, c.field);

  if (c.operator === "is_empty") {
    if (Array.isArray(val)) return val.length === 0;
    return val === null || val === undefined || String(val).trim() === "";
  }
  if (c.operator === "is_not_empty") {
    if (Array.isArray(val)) return val.length > 0;
    return !(val === null || val === undefined || String(val).trim() === "");
  }

  if (def.type === "number") {
    const n = Number(val ?? 0);
    const a = Number(c.value);
    const b = Number(c.value2);
    switch (c.operator) {
      case "eq": return n === a;
      case "neq": return n !== a;
      case "gt": return n > a;
      case "lt": return n < a;
      case "between": return n >= Math.min(a, b) && n <= Math.max(a, b);
      default: return true;
    }
  }

  if (def.type === "date") {
    if (!val) return false;
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return false;
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const target = c.value ? day(new Date(c.value)) : NaN;
    switch (c.operator) {
      case "on": return day(d) === target;
      case "before": return day(d) < target;
      case "after": return day(d) > target;
      case "between": {
        const t2 = c.value2 ? day(new Date(c.value2)) : NaN;
        if (isNaN(target) || isNaN(t2)) return true;
        return day(d) >= Math.min(target, t2) && day(d) <= Math.max(target, t2);
      }
      case "last_n_days": {
        const n = Number(c.value || 0);
        if (!n) return true;
        const from = Date.now() - n * 86400000;
        return d.getTime() >= from && d.getTime() <= Date.now() + 86400000;
      }
      case "this_month": {
        const now = new Date();
        return d >= startOfMonth(now) && d < startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1));
      }
      default: return true;
    }
  }

  // picklist (may be an array for vendors) / text
  if (Array.isArray(val)) {
    const arr = val.map((x) => String(x));
    switch (c.operator) {
      case "equals": return arr.includes(c.value);
      case "not_equals": return !arr.includes(c.value);
      case "in": return listValues(c).some((v) => arr.includes(v));
      case "in_list": return listValues(c).some((v) => arr.includes(v));
      case "contains": return arr.join(" ").toLowerCase().includes(c.value.toLowerCase());
      default: return true;
    }
  }

  const s = String(val ?? "").toLowerCase();
  const q = String(c.value ?? "").toLowerCase();
  switch (c.operator) {
    case "contains": return s.includes(q);
    case "not_contains": return !s.includes(q);
    case "equals": return String(val ?? "") === c.value;
    case "not_equals": return String(val ?? "") !== c.value;
    case "starts_with": return s.startsWith(q);
    case "in": return listValues(c).includes(String(val ?? ""));
    case "in_list": return listValues(c).map((v) => v.toLowerCase()).includes(s);
    default: return true;
  }
}

export function applyFilters(orders: any[], filters?: ViewFilters | null): any[] {
  const conds = (filters?.conditions || []).filter((c) => c.field && c.operator);
  if (conds.length === 0) return orders;
  const match = filters?.match === "any" ? "any" : "all";
  return orders.filter((o) =>
    match === "all" ? conds.every((c) => matchOne(o, c)) : conds.some((c) => matchOne(o, c))
  );
}

export function sortOrders(orders: any[], field?: string | null, dir: "asc" | "desc" = "desc"): any[] {
  if (!field) return orders;
  const def = fieldDef(field);
  const out = [...orders];
  out.sort((a, b) => {
    const av = rawValue(a, field);
    const bv = rawValue(b, field);
    let cmp: number;
    if (def?.type === "number") cmp = Number(av ?? 0) - Number(bv ?? 0);
    else if (def?.type === "date") cmp = new Date(String(av || 0)).getTime() - new Date(String(bv || 0)).getTime();
    else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
    return dir === "asc" ? cmp : -cmp;
  });
  return out;
}
