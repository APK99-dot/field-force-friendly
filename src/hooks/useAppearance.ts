import { useCallback, useEffect, useState } from "react";

export interface FontOption {
  label: string;
  stack: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { label: "Inter", stack: "'Inter', system-ui, sans-serif" },
  { label: "Roboto", stack: "'Roboto', system-ui, sans-serif" },
  { label: "Open Sans", stack: "'Open Sans', system-ui, sans-serif" },
  { label: "Lato", stack: "'Lato', system-ui, sans-serif" },
  { label: "Montserrat", stack: "'Montserrat', system-ui, sans-serif" },
  { label: "Poppins", stack: "'Poppins', system-ui, sans-serif" },
  { label: "Nunito Sans", stack: "'Nunito Sans', system-ui, sans-serif" },
  { label: "Source Sans 3", stack: "'Source Sans 3', system-ui, sans-serif" },
  { label: "Work Sans", stack: "'Work Sans', system-ui, sans-serif" },
  { label: "IBM Plex Sans", stack: "'IBM Plex Sans', system-ui, sans-serif" },
  { label: "Merriweather", stack: "'Merriweather', Georgia, serif" },
  { label: "System Default", stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
];

export const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 17, 18, 20, 22];

export const DEFAULT_FONT = FONT_OPTIONS[0].stack;
export const DEFAULT_FONT_SIZE = 16;

const FONT_KEY = "appearance_font_family";
const SIZE_KEY = "appearance_font_size";

export function applyAppearance(fontStack: string, fontSize: number) {
  const root = document.documentElement;
  root.style.setProperty("--app-font-family", fontStack);
  root.style.setProperty("--app-font-size", `${fontSize}px`);
}

/** Applies saved appearance settings as early as possible (called from App). */
export function initAppearance() {
  try {
    const font = localStorage.getItem(FONT_KEY) || DEFAULT_FONT;
    const size = Number(localStorage.getItem(SIZE_KEY)) || DEFAULT_FONT_SIZE;
    applyAppearance(font, size);
  } catch {
    /* ignore */
  }
}

export function useAppearance() {
  const [fontFamily, setFontFamilyState] = useState<string>(() => {
    try {
      return localStorage.getItem(FONT_KEY) || DEFAULT_FONT;
    } catch {
      return DEFAULT_FONT;
    }
  });
  const [fontSize, setFontSizeState] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(SIZE_KEY)) || DEFAULT_FONT_SIZE;
    } catch {
      return DEFAULT_FONT_SIZE;
    }
  });

  useEffect(() => {
    applyAppearance(fontFamily, fontSize);
  }, [fontFamily, fontSize]);

  const setFontFamily = useCallback((stack: string) => {
    try {
      localStorage.setItem(FONT_KEY, stack);
    } catch {
      /* ignore */
    }
    setFontFamilyState(stack);
  }, []);

  const setFontSize = useCallback((size: number) => {
    try {
      localStorage.setItem(SIZE_KEY, String(size));
    } catch {
      /* ignore */
    }
    setFontSizeState(size);
  }, []);

  const reset = useCallback(() => {
    setFontFamily(DEFAULT_FONT);
    setFontSize(DEFAULT_FONT_SIZE);
  }, [setFontFamily, setFontSize]);

  return { fontFamily, fontSize, setFontFamily, setFontSize, reset };
}
