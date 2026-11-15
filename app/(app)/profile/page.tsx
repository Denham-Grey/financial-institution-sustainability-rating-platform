import { getSessionUser } from "@/lib/session";
import { ProfileSettings } from "@/components/profile-settings";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) return null;

  return (
    <section id="route-profile" className="route active" data-route-panel="profile">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Personal workspace</p>
          <h1>Profile settings</h1>
          <p className="page-subtitle">
            Maintain your professional profile, security, notifications, and display preferences.
          </p>
        </div>
      </div>
      <ProfileSettings user={user} />
    </section>
  );
}
