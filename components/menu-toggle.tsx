"use client";

import { useEffect, useRef } from "react";

export function MenuToggle() {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      const shell = document.querySelector(".app-shell");
      if (!shell?.classList.contains("nav-open")) return;
      const target = event.target as Element | null;
      if (target?.closest(".sidebar") || target?.closest("#menu-toggle")) return;
      shell.classList.remove("nav-open");
      ref.current?.setAttribute("aria-expanded", "false");
      ref.current?.setAttribute("aria-label", "Open navigation");
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <button
      ref={ref}
      id="menu-toggle"
      className="icon-button menu-toggle"
      type="button"
      aria-label="Open navigation"
      aria-controls="primary-navigation"
      aria-expanded="false"
      onClick={() => {
        const shell = document.querySelector(".app-shell");
        const open = !shell?.classList.contains("nav-open");
        shell?.classList.toggle("nav-open", open);
        ref.current?.setAttribute("aria-expanded", String(open));
        ref.current?.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      }}
    >
      ☰
    </button>
  );
}
