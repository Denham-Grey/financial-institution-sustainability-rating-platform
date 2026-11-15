export function formatNumber(value: unknown, digits = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "—";
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const raw = String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(dateOnly ? `${raw}T12:00:00Z` : raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(
    "en-NG",
    dateOnly
      ? { dateStyle: "medium", timeZone: "UTC" }
      : { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" },
  ).format(date);
}

export function formatBytes(value: unknown) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}

export function ratingClass(rating: string | null | undefined) {
  const map: Record<string, string> = {
    "Sustainability Leader": "leader",
    Advanced: "advanced",
    Transitioning: "transitioning",
    Emerging: "emerging",
    Lagging: "lagging",
    "Not Applicable": "na",
  };
  return map[rating ?? ""] ?? "na";
}

export function certificateDisplayState(certificate: {
  lifecycle_status?: string;
  valid_until?: string;
}) {
  const status = String(certificate.lifecycle_status || "active").toLowerCase();
  if (status === "revoked") return { key: "revoked", label: "Revoked", className: "pill-lagging" };
  if (status === "superseded") return { key: "superseded", label: "Superseded", className: "pill-na" };
  if (status === "expired") return { key: "expired", label: "Expired", className: "pill-transitioning" };
  const validUntil = String(certificate.valid_until || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil < new Date().toISOString().slice(0, 10)) {
    return { key: "expired", label: "Expired", className: "pill-transitioning" };
  }
  return { key: "active", label: "Active", className: "pill-leader" };
}
