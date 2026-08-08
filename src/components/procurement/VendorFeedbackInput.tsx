import { StarRating } from "@/components/procurement/VendorRating";
import { IMPROVEMENT_AREAS } from "@/lib/vendorScore";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Props {
  vendorName?: string | null;
  rating: number;
  onRatingChange: (v: number) => void;
  areas: string[];
  onAreasChange: (v: string[]) => void;
  disabled?: boolean;
}

/** Star feedback for a vendor + conditional "Improvement Required In" multi-select. */
export default function VendorFeedbackInput({
  vendorName,
  rating,
  onRatingChange,
  areas,
  onAreasChange,
  disabled,
}: Props) {
  const showAreas = rating > 0 && rating < 3;

  const toggle = (v: string) =>
    onAreasChange(areas.includes(v) ? areas.filter((a) => a !== v) : [...areas, v]);

  return (
    <div className="rounded-xl border border-border bg-background/70 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Vendor feedback{vendorName ? ` — ${vendorName}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <StarRating value={rating} onChange={disabled ? undefined : onRatingChange} readOnly={disabled} size={20} />
          {rating > 0 && <span className="text-xs text-muted-foreground">{rating}/5</span>}
        </div>
      </div>

      {showAreas && (
        <div className="space-y-1.5 pt-1 border-t border-border/60">
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Improvement Required In</p>
          <div className="flex flex-wrap gap-1.5">
            {IMPROVEMENT_AREAS.map((a) => {
              const active = areas.includes(a.value);
              return (
                <button
                  key={a.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(a.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full border text-[11px] flex items-center gap-1 transition",
                    active
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-background border-border hover:border-amber-400",
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                  {a.label}
                </button>
              );
            })}
          </div>
          {areas.length === 0 && (
            <p className="text-[10px] text-muted-foreground">Select at least one area for ratings below 3 stars.</p>
          )}
        </div>
      )}
    </div>
  );
}
