import { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";
import { useUiMode, isLightning } from "@/hooks/useUiMode";
import { cn } from "@/lib/utils";

/**
 * Wraps a page in the Lightning design token layer when the toggle is on.
 * All child styling stays the same when off — this is a purely additive shell.
 */
export function LightningShell({ children, className }: { children: ReactNode; className?: string }) {
  const [mode] = useUiMode();
  return (
    <div className={cn(isLightning(mode) && "lightning-ui", className)}>
      {children}
    </div>
  );
}

/** Small pill switch used in page headers. */
export function LightningToggle({ className }: { className?: string }) {
  const [mode, , toggle] = useUiMode();
  const on = isLightning(mode);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs",
        on ? "border-[#0176D3]/40 bg-[#0176D3]/5 text-[#0176D3]" : "border-border bg-background text-muted-foreground",
        className,
      )}
    >
      <Zap className={cn("h-3.5 w-3.5", on ? "fill-current" : "")} />
      <Label htmlFor="lightning-toggle" className="cursor-pointer text-xs font-medium">
        Lightning
      </Label>
      <Switch id="lightning-toggle" checked={on} onCheckedChange={toggle} className="scale-75" />
    </div>
  );
}

/**
 * Salesforce-style Highlights Panel: object icon + title/subtitle at left,
 * inline key fields, actions on the right. Only rendered when the caller
 * chooses to (typically inside a `LightningShell`).
 */
export function HighlightsPanel({
  icon,
  eyebrow,
  title,
  subtitle,
  fields,
  actions,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  fields?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
}) {
  return (
    <div className="sf-highlights">
      <div className="flex items-start gap-3 flex-wrap">
        {icon && (
          <div className="sf-object-icon shrink-0">{icon}</div>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="sf-eyebrow">{eyebrow}</div>}
          <div className="sf-title truncate">{title}</div>
          {subtitle && <div className="sf-subtitle truncate">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap ml-auto">{actions}</div>}
      </div>
      {fields && fields.length > 0 && (
        <div className="sf-field-row">
          {fields.map((f, i) => (
            <div key={i} className="sf-field">
              <div className="sf-field-label">{f.label}</div>
              <div className="sf-field-value">{f.value ?? "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Salesforce Path component. Renders the stage chevrons and highlights the
 * current step. Purely presentational — advance/revert logic stays where it is.
 */
export function PathBar({
  steps,
  currentIndex,
}: {
  steps: string[];
  currentIndex: number;
}) {
  return (
    <ol className="sf-path" aria-label="Stage path">
      {steps.map((s, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
        return (
          <li key={s} className={`sf-path-step sf-path-${state}`}>
            <span className="sf-path-label">{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
