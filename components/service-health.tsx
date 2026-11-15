"use client";

import { useEffect, useState } from "react";

type Health = { online: boolean | null; detail: string };

export function useServiceHealth() {
  const [health, setHealth] = useState<Health>({ online: null, detail: "Connecting to workspace" });

  useEffect(() => {
    let active = true;
    async function check() {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = response.headers.get("content-type")?.includes("application/json")
          ? await response.json()
          : null;
        if (!active) return;
        setHealth(
          response.ok && payload?.status === "ok"
            ? { online: true, detail: "Database and API responding" }
            : { online: false, detail: `Health request returned ${response.status}` },
        );
      } catch {
        if (active) setHealth({ online: false, detail: "Could not reach the local rating service" });
      } finally {
        window.clearTimeout(timer);
      }
    }
    check();
    const interval = window.setInterval(check, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return health;
}

export function ModelStatus() {
  const { online, detail } = useServiceHealth();
  const dot = online === null ? "checking" : online ? "online" : "offline";
  return (
    <div className="model-status">
      <span className={`status-dot ${dot}`} data-health-dot aria-hidden="true" />
      <div>
        <strong id="model-health-label">
          {online === null ? "Checking service" : online ? "Model service online" : "Service unavailable"}
        </strong>
        <span id="model-health-detail">
          {detail || (online === null ? "Connecting to workspace" : online ? "Database and API responding" : "Last health check failed")}
        </span>
      </div>
    </div>
  );
}

export function TerminalHealthLabel() {
  const { online } = useServiceHealth();
  const dot = online === null ? "checking" : online ? "online" : "offline";
  return (
    <span>
      <i className={`status-dot ${dot}`} data-health-dot aria-hidden="true" />{" "}
      <span id="terminal-health-label">
        {online === null ? "CHECKING SERVICE" : online ? "MODEL ONLINE" : "SERVICE OFFLINE"}
      </span>
    </span>
  );
}
