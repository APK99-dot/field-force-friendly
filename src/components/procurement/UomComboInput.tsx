import { useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * A UOM input that combines a searchable dropdown of master UOMs with free-text
 * entry. If the typed value doesn't match an option the caller can detect it
 * (it will just be whatever the user typed) and prompt to save it to the
 * master.
 */
export default function UomComboInput({
  options,
  value,
  onChange,
  placeholder = "UOM",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = (query || value).trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn("relative", className)}>
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="h-8 pr-7"
          />
          <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 z-50"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No matching UOM. Press Enter to use "<span className="font-medium text-foreground">{value}</span>".
          </div>
        ) : (
          <div
            className="max-h-[280px] overflow-y-auto overscroll-contain py-1"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {filtered.map((o) => (
              <div
                key={o}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(o); setQuery(""); setOpen(false); }}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Check className={cn("h-3.5 w-3.5", o.toLowerCase() === value.trim().toLowerCase() ? "opacity-100" : "opacity-0")} />
                <span>{o}</span>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
