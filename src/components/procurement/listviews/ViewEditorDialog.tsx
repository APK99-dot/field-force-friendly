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
import { Plus, Trash2, Filter, Columns3, Users, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
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

const labelFor = (key: string) => PROC_FIELDS.find((f) => f.key === key)?.label ?? key;

function FieldPicker({
  columns,
  onChange,
}: {
  columns: string[];
  onChange: (next: string[]) => void;
}) {
  const [availSel, setAvailSel] = useState<string[]>([]);
  const [visSel, setVisSel] = useState<string[]>([]);

  const available = PROC_FIELDS.filter((f) => !columns.includes(f.key));

  const toggle = (list: string[], key: string, set: (v: string[]) => void, multi: boolean) => {
    if (multi) set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
    else set(list.includes(key) && list.length === 1 ? [] : [key]);
  };

  const add = () => {
    if (!availSel.length) return;
    onChange([...columns, ...availSel.filter((k) => !columns.includes(k))]);
    setAvailSel([]);
  };

  const remove = () => {
    if (!visSel.length) return;
    onChange(columns.filter((k) => !visSel.includes(k)));
    setVisSel([]);
  };

  const move = (dir: -1 | 1) => {
    if (!visSel.length) return;
    const next = [...columns];
    const order = dir === -1 ? [...next.keys()] : [...next.keys()].reverse();
    for (const i of order) {
      if (!visSel.includes(next[i])) continue;
      const j = i + dir;
      if (j < 0 || j >= next.length || visSel.includes(next[j])) continue;
      [next[i], next[j]] = [next[j], next[i]];
    }
    onChange(next);
  };

  const listBtn = (selected: boolean) =>
    `w-full text-left px-3 py-2 text-sm rounded-md truncate transition-colors ${
      selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
    }`;

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 min-w-0 space-y-1">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available Fields</Label>
        <div className="h-64 overflow-y-auto rounded-lg border border-border bg-background p-1.5 shadow-inner">
          {available.map((f) => (
            <button
              key={f.key}
              type="button"
              className={listBtn(availSel.includes(f.key))}
              onClick={(e) => toggle(availSel, f.key, setAvailSel, e.ctrlKey || e.metaKey)}
              onDoubleClick={() => onChange([...columns, f.key])}
            >
              {f.label}
            </button>
          ))}
          {available.length === 0 && (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">All fields selected</p>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-center gap-2 pt-5">
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 bg-background hover:bg-accent" onClick={add} disabled={!availSel.length}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 bg-background hover:bg-accent" onClick={remove} disabled={!visSel.length}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visible Fields (in order)</Label>
        <div className="h-64 overflow-y-auto rounded-lg border border-border bg-background p-1.5 shadow-inner">
          {columns.map((key) => (
            <button
              key={key}
              type="button"
              className={listBtn(visSel.includes(key))}
              onClick={(e) => toggle(visSel, key, setVisSel, e.ctrlKey || e.metaKey)}
              onDoubleClick={() => onChange(columns.filter((k) => k !== key))}
            >
              {labelFor(key)}
            </button>
          ))}
          {columns.length === 0 && (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">No columns chosen</p>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-center gap-2 pt-5">
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 bg-background hover:bg-accent" onClick={() => move(-1)} disabled={!visSel.length}>
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 bg-background hover:bg-accent" onClick={() => move(1)} disabled={!visSel.length}>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
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
      <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] p-0 gap-0 flex flex-col rounded-xl overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <DialogTitle className="text-lg">{view ? "Edit List View" : "New List View"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-7 bg-card">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">View Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Open Requisitions" className="h-10 text-sm" />
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-base font-semibold text-foreground"><Filter className="h-4 w-4" />Filters</div>
                <div className="flex items-center gap-2">
                  <Select value={match} onValueChange={(v) => setMatch(v as "all" | "any")}>
                    <SelectTrigger className="h-9 w-[170px] text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Match ALL filters</SelectItem>
                      <SelectItem value="any">Match ANY filter</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-9 gap-1 bg-background" onClick={() => setConditions((p) => [...p, blankCondition()])}>
                    <Plus className="h-3.5 w-3.5" />Add
                  </Button>
                </div>
              </div>

              {conditions.length === 0 && (
                <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg bg-muted/20 p-4">No filters — this view shows all records.</p>
              )}

              <div className="space-y-2">
                {conditions.map((c, i) => {
                  const def = fieldDef(c.field);
                  const ops = OPERATORS[def?.type ?? "text"];
                  const picks = optionsFor(def?.optionsSource);
                  const needsValue = !["is_empty", "is_not_empty", "this_month"].includes(c.operator);
                  return (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.2fr_auto] gap-2 items-center border border-border rounded-lg bg-muted/20 p-3">
                      <Select
                        value={c.field}
                        onValueChange={(v) => {
                          const nd = fieldDef(v);
                          updateCond(i, { field: v, operator: OPERATORS[nd?.type ?? "text"][0].value, value: "", value2: "", values: [] });
                        }}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PROC_FIELDS.map((f) => (<SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>))}
                        </SelectContent>
                      </Select>

                      <Select value={c.operator} onValueChange={(v) => updateCond(i, { operator: v })}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ops.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-2">
                        {!needsValue ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : def?.type === "picklist" && picks.length ? (
                          <Select value={c.value} onValueChange={(v) => updateCond(i, { value: v })}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              {picks.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        ) : def?.type === "date" && c.operator !== "last_n_days" ? (
                          <>
                            <Input type="date" className="h-9 text-sm" value={c.value} onChange={(e) => updateCond(i, { value: e.target.value })} />
                            {c.operator === "between" && (
                              <Input type="date" className="h-9 text-sm" value={c.value2 ?? ""} onChange={(e) => updateCond(i, { value2: e.target.value })} />
                            )}
                          </>
                        ) : (
                          <>
                            <Input
                              type={def?.type === "number" || c.operator === "last_n_days" ? "number" : "text"}
                              className="h-9 text-sm"
                              value={c.value}
                              placeholder="Value"
                              onChange={(e) => updateCond(i, { value: e.target.value })}
                            />
                            {c.operator === "between" && (
                              <Input type="number" className="h-9 text-sm" value={c.value2 ?? ""} placeholder="and" onChange={(e) => updateCond(i, { value2: e.target.value })} />
                            )}
                          </>
                        )}
                      </div>

                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
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
              <div className="flex items-center gap-2 text-base font-semibold text-foreground"><Columns3 className="h-4 w-4" />Display Fields</div>
              <FieldPicker columns={columns} onChange={setColumns} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Sort by</Label>
                  <Select value={sortField} onValueChange={setSortField}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROC_FIELDS.map((f) => (<SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Direction</Label>
                  <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
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
              <div className="flex items-center gap-2 text-base font-semibold text-foreground"><Users className="h-4 w-4" />Sharing</div>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Only me</SelectItem>
                  <SelectItem value="everyone">All users</SelectItem>
                  <SelectItem value="selected">Selected team members</SelectItem>
                </SelectContent>
              </Select>
              {visibility === "selected" && (
                <div className="border rounded-md p-2 space-y-2">
                  <Input value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} placeholder="Search people..." className="h-9 text-sm" />
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {filteredPeople.map((p) => (
                      <label key={p.value} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
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

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!name.trim()}>{view ? "Save Changes" : "Create View"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
