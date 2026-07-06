import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";

export interface ComboProduct {
  id: string;
  product_name: string;
  category_id?: string | null;
  category_name?: string | null;
  product_description?: string | null;
  code?: string | null;
}

interface Props {
  products: ComboProduct[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  /** When set, only products in this category are shown. */
  categoryId?: string;
  /** Renders a "+ Add Product" action at the bottom of the list. */
  onAddNew?: () => void;
  addNewLabel?: string;
}

const ROW_HEIGHT = 48; // px per option row
const OVERSCAN = 6;
const VIEWPORT_HEIGHT = 288; // matches max-h-72

/** Highlights case-insensitive matches of `query` within `text`. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: { s: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      parts.push({ s: text.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ s: text.slice(i, idx), hit: false });
    parts.push({ s: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return (
    <>
      {parts.map((p, k) =>
        p.hit ? (
          <mark key={k} className="bg-primary/20 text-foreground rounded-sm px-0.5">
            {p.s}
          </mark>
        ) : (
          <span key={k}>{p.s}</span>
        ),
      )}
    </>
  );
}

export default function ProductCombobox({ products, value, onChange, placeholder = "Select material", className, categoryId, onAddNew, addNewLabel = "Add Product" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === value);

  const byCategory = useMemo(
    () => (categoryId ? products.filter((p) => p.category_id === categoryId) : products),
    [products, categoryId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((p) =>
      [p.product_name, p.category_name, p.product_description, p.code]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [byCategory, query]);

  useEffect(() => {
    setActive(0);
    if (listRef.current) listRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [query]);

  // Virtualization window
  const total = filtered.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(total, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  const visible = filtered.slice(startIndex, endIndex);

  const scrollActiveIntoView = (idx: number) => {
    const el = listRef.current;
    if (!el) return;
    const top = idx * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + VIEWPORT_HEIGHT) el.scrollTop = bottom - VIEWPORT_HEIGHT;
  };

  const commit = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => {
        const n = Math.min(total - 1, a + 1);
        scrollActiveIntoView(n);
        return n;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => {
        const n = Math.max(0, a - 1);
        scrollActiveIntoView(n);
        return n;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[active];
      if (item) commit(item.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Popover portals outside the Dialog, whose react-remove-scroll blocks native
  // wheel scrolling on the list. Drive the scroll manually so it works inside dialogs.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop += e.deltaY;
    setScrollTop(el.scrollTop);
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
          <span className="truncate">{selected ? selected.product_name : placeholder}</span>
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
              onKeyDown={onKeyDown}
              placeholder="Search name or category…"
              className="pl-9"
            />
          </div>
        </div>
        {total === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No products found.</div>
        ) : (
          <div
            ref={listRef}
            onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
            onWheel={onWheel}
            className="overflow-y-auto overscroll-contain"
            style={{ maxHeight: VIEWPORT_HEIGHT }}
          >
            <div style={{ height: total * ROW_HEIGHT, position: "relative" }}>
              {visible.map((p, k) => {
                const idx = startIndex + k;
                return (
                  <div
                    key={p.id}
                    role="option"
                    aria-selected={idx === active}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => commit(p.id)}
                    className={cn(
                      "absolute left-0 right-0 flex cursor-pointer items-center gap-2 px-3 text-sm",
                      idx === active && "bg-accent text-accent-foreground",
                    )}
                    style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", p.id === value ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        <Highlight text={p.product_name} query={query} />
                      </div>
                      {p.category_name && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          <Highlight text={p.category_name} query={query} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
