import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getInstitutions } from "@/lib/data";
import { PrimaryNav } from "@/components/primary-nav";
import { InstitutionPicker } from "@/components/institution-picker";
import { ProfileMenu } from "@/components/profile-menu";
import { MenuToggle } from "@/components/menu-toggle";
import { ModelStatus, TerminalHealthLabel } from "@/components/service-health";
import { TerminalClock } from "@/components/terminal-clock";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToastRegion } from "@/components/toast";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  reviewer: "Reviewer",
  analyst: "Analyst",
  partner: "Partner",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const institutions = await getInstitutions();
  const initials = `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`.toUpperCase() || "U";
  const role = ROLE_LABELS[user.profile_role] ?? "Analyst";
  const partner = user.profile_role === "partner";

  return (
    <div className="app-shell">
      <ToastRegion />
      <header className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            FISR
          </div>
          <div>
            <strong aria-label="Financial Institution Sustainability Rating Platform">
              <span className="platform-name-full">
                Financial Institution
                <br />
                Sustainability Rating Platform
              </span>
              <span className="platform-name-short" aria-hidden="true">
                FISR Platform
              </span>
            </strong>
            <span>Nigeria</span>
          </div>
        </div>
        <PrimaryNav role={user.profile_role} />
        <div className="sidebar-footer">
          <ModelStatus />
          <ThemeToggle />
        </div>
      </header>

      <div className="workspace">
        <div className="terminal-tape" aria-label="Platform status">
          <span>
            <b>FISR</b> SUSTAINABILITY RATINGS
          </span>
          <TerminalHealthLabel />
          <span className="internal-only" hidden={partner}>
            METHOD 2026.1
          </span>
          <TerminalClock />
        </div>
        <header className="topbar">
          <MenuToggle />
          <InstitutionPicker institutions={institutions} />
          <div className="topbar-actions">
            {!partner ? (
              <>
                <Link
                  className="button button-secondary export-button"
                  href="/api/rankings.csv"
                  prefetch={false}
                  download
                >
                  Export rankings
                </Link>
                <a id="export-pdf-button" className="button button-secondary export-button" href="#" aria-disabled="true">
                  PDF report
                </a>
                <a id="export-xlsx-button" className="button button-secondary export-button" href="#" aria-disabled="true">
                  Excel report
                </a>
                <details id="mobile-export-menu" className="mobile-export-menu">
                  <summary className="button button-secondary">Export</summary>
                  <div>
                    <a href="/api/rankings.csv" download>
                      Rankings CSV
                    </a>
                    <a id="mobile-export-pdf" href="#" aria-disabled="true">
                      PDF report
                    </a>
                    <a id="mobile-export-xlsx" href="#" aria-disabled="true">
                      Excel report
                    </a>
                  </div>
                </details>
              </>
            ) : null}
            <ProfileMenu
              initials={initials}
              name={`${user.first_name} ${user.last_name}`.trim() || user.username}
              role={role}
              email={user.email}
            />
          </div>
        </header>

        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
