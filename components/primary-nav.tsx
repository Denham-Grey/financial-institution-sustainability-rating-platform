"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/", "Dashboard", "route-dashboard", "all"],
  ["/assessment", "Assessment", "route-assessment", "internal"],
  ["/evidence", "Evidence", "route-evidence", "internal"],
  ["/certificates", "Certificates", "route-certificates", "all"],
  ["/directory", "Financial Institutions Directory", "route-directory", "all"],
  ["/framework", "Framework", "route-framework", "internal"],
  ["/profile", "Profile", "route-profile", "all"],
] as const;

export function PrimaryNav({ role }: { role: string }) {
  const pathname = usePathname();
  const partner = role === "partner";
  const visible = links.filter(([, , , audience]) => !partner || audience === "all");
  return (
    <nav id="primary-navigation" className="main-nav" aria-label="Primary navigation">
      {visible.map(([href, label, panel], index) => (
        <Link
          key={href}
          href={href}
          className={`nav-item${pathname === href ? " active" : ""}`}
          aria-controls={panel}
          aria-current={pathname === href ? "page" : undefined}
        >
          <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          {label}
        </Link>
      ))}
      <Link
        id="admin-nav"
        href="/admin"
        className={`nav-item${pathname === "/admin" ? " active" : ""}`}
        aria-controls="route-admin"
        aria-current={pathname === "/admin" ? "page" : undefined}
        hidden={role !== "admin"}
      >
        <span aria-hidden="true">08</span>
        Admin
      </Link>
    </nav>
  );
}
