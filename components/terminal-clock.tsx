"use client";

import { useEffect, useState } from "react";

export function TerminalClock() {
  const [clock, setClock] = useState("");

  useEffect(() => {
    function tick() {
      setClock(
        new Intl.DateTimeFormat("en-NG", {
          timeZone: "Africa/Lagos",
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZoneName: "short",
        })
          .format(new Date())
          .toUpperCase(),
      );
    }
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span id="terminal-clock" className="terminal-clock">
      {clock}
    </span>
  );
}
