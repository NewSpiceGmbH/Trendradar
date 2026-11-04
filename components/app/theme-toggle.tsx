"use client";

import { useSyncExternalStore } from "react";

const read = () => (typeof document === "undefined" ? "dark" : document.documentElement.dataset.theme === "light" ? "light" : "dark");
const subscribe = (cb: () => void) => {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
};

/** Hell/Dunkel umschalten; Dunkel ist die Markenansicht. Merkt sich die Wahl im Browser. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "dark");
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        if (next === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
        try {
          localStorage.setItem("theme", next);
        } catch {}
      }}
      className="rounded-[var(--radius-pill)] border border-line px-3 py-1.5 text-sm text-ink hover:border-muted"
      aria-label={next === "light" ? "Helle Ansicht" : "Dunkle Ansicht"}
    >
      {next === "light" ? "Hell" : "Dunkel"}
    </button>
  );
}

