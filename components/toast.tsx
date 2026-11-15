"use client";

import { useEffect } from "react";

type ToastKind = "success" | "error";
let push: ((message: string, kind: ToastKind) => void) | null = null;

export function showToast(message: string, kind: ToastKind = "success") {
  push?.(message, kind);
}

export function ToastRegion() {
  useEffect(() => {
    const region = document.getElementById("toast-region");
    if (!region) return;
    push = (message, kind) => {
      const item = document.createElement("div");
      item.className = `toast ${kind}`;
      item.textContent = message;
      item.addEventListener("click", () => item.remove());
      region.append(item);
      window.setTimeout(() => item.remove(), 4200);
    };
    return () => {
      push = null;
    };
  }, []);

  return <div id="toast-region" className="toast-region" aria-live="polite" aria-atomic="true" />;
}
