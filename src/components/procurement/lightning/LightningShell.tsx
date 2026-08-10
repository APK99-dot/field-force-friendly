import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const stageLabelBaseClass = "proc-stage-label";

export function StageLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(stageLabelBaseClass, className)}>{children}</span>;
}

/**
 * Wraps a page in the Lightning design token layer. Procurement and Vendor 360
 * are Lightning-only now, so this applies unconditionally — the switch that
 * used to turn it off has been removed from those headers.
 */
export function LightningShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("lightning-ui", className)}>{children}</div>;
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
            <StageLabel className="sf-path-label">{s}</StageLabel>
          </li>
        );
      })}
    </ol>
  );
}
