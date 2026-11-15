import { redirect } from "next/navigation";
import { getAdminInstitutions, getAudit, getDirectoryCategories, getPlatformUsers } from "@/lib/data";
import { getSessionUser, isAdmin } from "@/lib/session";
import { AdminConsole } from "@/components/admin-console";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isAdmin(user)) redirect("/");
  const [users, institutions, audit, categories] = await Promise.all([
    getPlatformUsers(),
    getAdminInstitutions(),
    getAudit(40),
    getDirectoryCategories(),
  ]);

  return (
    <section id="route-admin" className="route active" data-route-panel="admin">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace controls</p>
          <h1>Administration</h1>
          <p className="page-subtitle">
            Create role-based profiles, control account access, manage institutions, and review the audit trail.
          </p>
        </div>
      </div>
      <AdminConsole
        users={users}
        institutions={institutions}
        audit={audit}
        categories={categories}
        currentUserId={user.id}
      />
    </section>
  );
}
