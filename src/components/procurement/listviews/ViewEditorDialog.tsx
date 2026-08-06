import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Filter, Columns3, Users } from "lucide-react";
import {
  PROC_FIELDS, OPERATORS, STATUS_OPTIONS, SOURCE_TYPE_OPTIONS, DEFAULT_VIEW_COLUMNS,
  fieldDef, type FilterCondition, type ListView,
} from "@/lib/procurementFields";

export interface PickOption { value: string; label: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  view: ListView | null;
  onSave: (v: Partial<ListView> & { name: string }) => void;
  siteOptions: PickOption[];
  vendorOptions: PickOption[];
  ownerOptions: PickOption[];
  people: PickOption[];
}

function blankCondition(): FilterCondition {
  return { field: "status", operator: "equals", value: "" };
}

export default function ViewEditorDialog({
  open, onOpenChange, view, onSave, siteOptions, vendorOptions, ownerOptions, people,
}: Props) {
  const [name, setName] = useState("");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [columns, setColumns] = useState<string[]>(DEFAULT_VIEW_COLUMNS);
  const [sortField, setSortField] = useState<string>("order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibility, setVisibility] = useState<"private" | "everyone" | "selected">("private");
  const [sharedIds, setSharedIds] = useState<string[]>([]);
  const [peopleSearch, setPeopleSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(view?.name ?? "");
    setMatch(view?.filters?.match ?? "all");
    setConditions(view?.filters?.conditions?.length ? view.filters.conditions : []);
    setColumns(view?.columns?.length ? view.columns : DEFAULT_VIEW_COLUMNS);
    setSortField(view?.sort_field ?? "order_date");
    setSortDir(view?.sort_dir ?? "desc");
    setVisibility(view?.visibility ?? "private");
    setSharedIds(view?.shared_user_ids ?? []);
    setPeopleSearch("");
  }, [open, view]);

  const optionsFor = (source?: string): PickOption[] => {
    switch (source) {
      case "status": return STATUS_OPTIONS;
      case "source_type": return SOURCE_TYPE_OPTIONS;
      case "site": return siteOptions;
      case "vendor": return vendorOptions;
      case "owner": return ownerOptions;
      default: return [];
    }
  };

  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.label.toLowerCase().includes(q));
  }, [people, peopleSearch]);

  const updateCond = (i: number, patch: Partial<FilterCondition>) =>
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const toggleColumn = (key: string) =>
    setColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      id: view?.id,
      name: name.trim(),
      filters: { match, conditions: conditions.filter((c) => c.field && c.operator) },
      columns: columns.length ? columns : DEFAULT_VIEW_COLUMNS,
      sort_field: sortField || null,
      sort_dir: sortDir,
      visibility,
      shared_user_ids: sharedIds,
      is_default: view?.is_default ?? false,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[92vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <DialogTitle className="text-base">{view ? "Edit List View" : "New List View"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5 space-y-6">
            <div className="space-y-1.5">
              <Label className="text-xs">View Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Open Requisitions" className="h-9" />
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4" />Filters</div>
                <div className="flex items-center gap-2">
                  <Select value={match} onValueChange={(v) => setMatch(v as "all" | "any")}>
                    <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Match ALL filters</SelectItem>
                      <SelectItem value="any">Match ANY filter</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setConditions((p) => [...p, blankCondition()])}>
                    <Plus className="h-3.5 w-3.5" />Add
                  </Button>
                </div>
              </div>

              {conditions.length === 0 && (
                <p className="text-xs text-muted-foreground border rounded-md p-3">No filters — this view shows all records.</p>
              )}

              <div className="space-y-2">
                {conditions.map((c, i) => {
                  const def = fieldDef(c.field);
                  const ops = OPERATORS[def?.type ?? "text"];
                  const picks = optionsFor(def?.optionsSource);
                  const needsValue = !["is_empty", "is_not_empty", "this_month"].includes(c.operator);
                  return (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.2fr_auto] gap-2 items-center border rounded-md p-2">
                      <Select
                        value={c.field}
                        onValueChange={(v) => {
                          const nd = fieldDef(v);
                          updateCond(i, { field: v, operator: OPERATORS[nd?.type ?? "text"][0].value, value: "", value2: "", values: [] });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PROC_FIELDS.map((f) => (<SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>))}
                        </SelectContent>
                      </Select>

                      <Select value={c.operator} onValueChange={(v) => updateCond(i, { operator: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ops.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-2">
                        {!needsValue ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : def?.type === "picklist" && picks.length ? (
                          <Select value={c.value} onValueChange={(v) => updateCond(i, { value: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              {picks.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        ) : def?.type === "date" && c.operator !== "last_n_days" ? (
                          <>
                            <Input type="date" className="h-8 text-xs" value={c.value} onChange={(e) => updateCond(i, { value: e.target.value })} />
                            {c.operator === "between" && (
                              <Input type="date" className="h-8 text-xs" value={c.value2 ?? ""} onChange={(e) => updateCond(i, { value2: e.target.value })} />
                            )}
                          </>
                        ) : (
                          <>
                            <Input
                              type={def?.type === "number" || c.operator === "last_n_days" ? "number" : "text"}
                              className="h-8 text-xs"
                              value={c.value}
                              placeholder="Value"
                              onChange={(e) => updateCond(i, { value: e.target.value })}
                            />
                            {c.operator === "between" && (
                              <Input type="number" className="h-8 text-xs" value={c.value2 ?? ""} placeholder="and" onChange={(e) => updateCond(i, { value2: e.target.value })} />
                            )}
                          </>
                        )}
                      </div>

                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setConditions((p) => p.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Columns */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold"><Columns3 className="h-4 w-4" />Display Fields</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border rounded-md p-3">
                {PROC_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={columns.includes(f.key)} onCheckedChange={() => toggleColumn(f.key)} />
                    <span className="truncate">{f.label}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Sort by</Label>
                  <Select value={sortField} onValueChange={setSortField}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROC_FIELDS.map((f) => (<SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Direction</Label>
                  <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Descending</SelectItem>
                      <SelectItem value="asc">Ascending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Sharing */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" />Sharing</div>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Only me</SelectItem>
                  <SelectItem value="everyone">All users</SelectItem>
                  <SelectItem value="selected">Selected team members</SelectItem>
                </SelectContent>
              </Select>
              {visibility === "selected" && (
                <div className="border rounded-md p-2 space-y-2">
                  <Input value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} placeholder="Search people..." className="h-8 text-xs" />
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {filteredPeople.map((p) => (
                      <label key={p.value} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                        <Checkbox
                          checked={sharedIds.includes(p.value)}
                          onCheckedChange={() =>
                            setSharedIds((prev) => prev.includes(p.value) ? prev.filter((x) => x !== p.value) : [...prev, p.value])
                          }
                        />
                        <span className="truncate">{p.label}</span>
                      </label>
                    ))}
                    {filteredPeople.length === 0 && <p className="text-xs text-muted-foreground">No matches.</p>}
                  </div>
                  {sharedIds.length > 0 && <Badge variant="secondary" className="text-[10px]">{sharedIds.length} selected</Badge>}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!name.trim()}>{view ? "Save Changes" : "Create View"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
