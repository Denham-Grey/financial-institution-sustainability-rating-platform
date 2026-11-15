const CLASS_BY_RATING: Record<string, string> = {
  "Sustainability Leader": "pill-leader",
  Advanced: "pill-advanced",
  Transitioning: "pill-transitioning",
  Emerging: "pill-emerging",
  Lagging: "pill-lagging",
  "Not Applicable": "pill-na",
};

export function RatingPill({ rating, label }: { rating: string; label?: string }) {
  const className = CLASS_BY_RATING[rating] ?? "pill-na";
  return <span className={`pill ${className}`}>{label ?? rating}</span>;
}
