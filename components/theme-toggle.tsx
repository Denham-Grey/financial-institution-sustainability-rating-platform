"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mode, setMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("ngfi_theme");
    const next = stored === "light" ? "light" : "dark";
    const storedColour = localStorage.getItem("ngfi_colour_theme");
    setMode(next);
    document.documentElement.dataset.theme = next;
    if (storedColour) document.documentElement.dataset.colorTheme = storedColour;

    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ mode?: string }>).detail;
      if (detail?.mode === "light" || detail?.mode === "dark") setMode(detail.mode);
    }
    window.addEventListener("ngfi-theme-change", onChange);
    return () => window.removeEventListener("ngfi-theme-change", onChange);
  }, []);

  function toggle() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ngfi_theme", next);
  }

  return (
    <button
      id="theme-toggle"
      className="quiet-button"
      type="button"
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      onClick={toggle}
    >
      {mode === "dark" ? "☼" : "◐"} <span>Display mode</span>
    </button>
  );
}
