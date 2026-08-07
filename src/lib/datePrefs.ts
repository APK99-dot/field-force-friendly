/**
 * Global date / time display preferences.
 * Stored per-device in localStorage and consumed by the date-fns shim
 * (see src/lib/dateFnsShim.ts) so every formatted date in the app follows them.
 */

export interface DateFormatOption {
  label: string;
  pattern: string;
}

export const DATE_FORMAT_OPTIONS: DateFormatOption[] = [
  { label: "DD MMM, YYYY  (07 Aug, 2026)", pattern: "dd MMM, yyyy" },
  { label: "DD MMM YYYY  (07 Aug 2026)", pattern: "dd MMM yyyy" },
  { label: "MMM DD, YYYY  (Aug 07, 2026)", pattern: "MMM dd, yyyy" },
  { label: "MMMM DD, YYYY  (August 07, 2026)", pattern: "MMMM dd, yyyy" },
  { label: "DD/MM/YYYY  (07/08/2026)", pattern: "dd/MM/yyyy" },
  { label: "MM/DD/YYYY  (08/07/2026)", pattern: "MM/dd/yyyy" },
  { label: "YYYY-MM-DD  (2026-08-07)", pattern: "yyyy-MM-dd" },
];

export const TIME_FORMAT_OPTIONS = [
  { label: "12 hour  (2:45 PM)", value: "12" as const, pattern: "h:mm a" },
  { label: "24 hour  (14:45)", value: "24" as const, pattern: "HH:mm" },
];

export const DEFAULT_DATE_PATTERN = "dd MMM, yyyy";
export const DEFAULT_TIME_MODE: "12" | "24" = "12";

const DATE_KEY = "appearance_date_format";
const TIME_KEY = "appearance_time_format";
const TZ_KEY = "appearance_time_zone";

export const PREFS_EVENT = "app-date-prefs-changed";

export interface DatePrefs {
  datePattern: string;
  timeMode: "12" | "24";
  timePattern: string;
  timeZone: string; // "" = device time zone
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let cache: DatePrefs | null = null;

export function getDatePrefs(): DatePrefs {
  if (cache) return cache;
  const datePattern = read(DATE_KEY) || DEFAULT_DATE_PATTERN;
  const timeMode = (read(TIME_KEY) as "12" | "24") || DEFAULT_TIME_MODE;
  cache = {
    datePattern,
    timeMode,
    timePattern: timeMode === "24" ? "HH:mm" : "h:mm a",
    timeZone: read(TZ_KEY) || "",
  };
  return cache;
}

export function setDatePrefs(next: Partial<Pick<DatePrefs, "datePattern" | "timeMode" | "timeZone">>) {
  try {
    if (next.datePattern !== undefined) localStorage.setItem(DATE_KEY, next.datePattern);
    if (next.timeMode !== undefined) localStorage.setItem(TIME_KEY, next.timeMode);
    if (next.timeZone !== undefined) localStorage.setItem(TZ_KEY, next.timeZone);
  } catch {
    /* ignore */
  }
  cache = null;
  try {
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    /* ignore */
  }
}

export function resetDatePrefs() {
  setDatePrefs({ datePattern: DEFAULT_DATE_PATTERN, timeMode: DEFAULT_TIME_MODE, timeZone: "" });
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function timeZoneOptions(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf;
  if (typeof supported === "function") {
    try {
      return supported("timeZone");
    } catch {
      /* ignore */
    }
  }
  return [
    "UTC",
    "Asia/Kolkata",
    "Asia/Dubai",
    "Asia/Singapore",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Australia/Sydney",
  ];
}
