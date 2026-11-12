"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const EVENT = "sps-theme-change";

/**
 * Runs before first paint (see app/layout.tsx) so dark mode never flashes
 * light. Keep the storage key and rules in step with applyTheme below.
 */
export const themeScript = `(function(){var t=null;try{t=localStorage.getItem('${STORAGE_KEY}')}catch(e){}t=['light','dark','system'].indexOf(t)!==-1?t:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'})()`;

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked; the theme still applies for this visit.
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (readTheme() === "system") applyTheme("system");
    callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
    media.removeEventListener("change", onSystemChange);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "system");
}
