import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";

export interface ComboCategory {
  id: string;
  category_name: string;
  sub_category_name?: string | null;
}

interface Props {
  categories: ComboCategory[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  onAddNew?: () => void;
  addNewLabel?: string;
}

const label = (c: ComboCategory) =>
  `${c.category_name}${c.sub_category_name ? " — " + c.sub_category_name : ""}`;

export default function CategoryCombobox({
  categories,
  value,
  onChange,
  placeholder = "Select category",
  className,
  onAddNew,
  addNewLabel = "Add Category",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = categories.find((c) => c.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => label(c).toLowerCase().includes(q));
  }, [categories, query]);

  const commit = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? label(selected) : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search category…"
              className="pl-9"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No categories found.</div>
        ) : (
          <div className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {filtered.map((c) => (
              <div
                key={c.id}
                role="option"
                aria-selected={c.id === value}
                onClick={() => commit(c.id)}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Check className={cn("h-4 w-4 shrink-0", c.id === value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{label(c)}</span>
              </div>
            ))}
          </div>
        )}
        {onAddNew && (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full justify-start gap-2 text-sm text-primary"
              onClick={() => {
                setOpen(false);
                setQuery("");
                onAddNew();
              }}
            >
              <Plus className="h-4 w-4" />
              {addNewLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
