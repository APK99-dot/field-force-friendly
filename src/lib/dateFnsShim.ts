/**
 * date-fns shim.
 *
 * Vite aliases the bare "date-fns" specifier to this module so that every
 * `format(...)` call in the app automatically respects the user's date /
 * time / time-zone preferences (App Settings). Machine-readable patterns
 * (e.g. "yyyy-MM-dd" used for keys and API values) are left untouched.
 */
// @ts-ignore -- resolved through the "date-fns-original" alias
import { format as baseFormat } from "date-fns-original";
import { getDatePrefs } from "@/lib/datePrefs";

// @ts-ignore -- re-export everything else unchanged
export * from "date-fns-original";

/** Display date patterns that get swapped for the user's preferred pattern. */
const DATE_PATTERNS = [
  "MMMM do, yyyy",
  "MMMM dd, yyyy",
  "MMMM d, yyyy",
  "MMM dd, yyyy",
  "MMM d, yyyy",
  "dd MMM, yyyy",
  "d MMM, yyyy",
  "dd MMM yyyy",
  "d MMM yyyy",
  "dd MMM yy",
  "d MMM yy",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "dd/MM/yy",
  "PPPP",
  "PPP",
  "PP",
].sort((a, b) => b.length - a.length);

/** Display time patterns that get swapped for the 12h / 24h preference. */
const TIME_PATTERNS = ["hh:mm a", "h:mm a", "HH:mm", "hh:mm aa"].sort(
  (a, b) => b.length - a.length,
);

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMachinePattern(p: string) {
  // ISO-ish / key patterns and anything with escaped literals stay as-is.
  return p.includes("-") || p.includes("'") || p.includes("XXX") || p.includes("ss");
}

function remap(pattern: string): string {
  if (typeof pattern !== "string" || !pattern) return pattern;
  if (isMachinePattern(pattern)) return pattern;
  const prefs = getDatePrefs();
  let out = pattern;
  for (const p of DATE_PATTERNS) {
    if (out.includes(p)) {
      out = out.replace(new RegExp(escapeRe(p), "g"), prefs.datePattern);
      break;
    }
  }
  for (const p of TIME_PATTERNS) {
    if (out.includes(p)) {
      out = out.replace(new RegExp(escapeRe(p), "g"), prefs.timePattern);
      break;
    }
  }
  return out;
}

function toZoned(date: Date | number | string): Date | number | string {
  const prefs = getDatePrefs();
  if (!prefs.timeZone) return date;
  try {
    const d = date instanceof Date ? date : new Date(date as never);
    if (Number.isNaN(d.getTime())) return date;
    return new Date(d.toLocaleString("en-US", { timeZone: prefs.timeZone }));
  } catch {
    return date;
  }
}

export function format(
  date: Date | number | string,
  pattern: string,
  options?: Parameters<typeof baseFormat>[2],
): string {
  return baseFormat(toZoned(date) as never, remap(pattern), options);
}

export const formatDate = format;
