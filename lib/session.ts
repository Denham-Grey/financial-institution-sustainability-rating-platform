import { auth } from "@/lib/auth/server";
import { one, query } from "@/lib/db";

export type PlatformUser = {
  id: number;
  auth_user_id: string | null;
  username: string;
  email: string;
  role: "admin" | "analyst" | "viewer";
  profile_role: "admin" | "analyst" | "reviewer" | "partner";
  first_name: string;
  last_name: string;
  job_title: string;
  department: string;
  phone: string;
  gender: string;
  timezone: string;
  active: boolean;
  manually_locked: boolean;
  retired: boolean;
  theme_mode: string;
  color_theme: string;
  compact_mode: boolean;
  email_notifications: boolean;
  photo_data_url: string;
};

const SELECT_USER = `SELECT id, auth_user_id, username, email, role, profile_role, first_name, last_name,
  job_title, department, phone, gender, timezone, active, manually_locked, retired, theme_mode, color_theme,
  compact_mode, email_notifications, photo_data_url
  FROM users`;

export async function getSessionUser(): Promise<PlatformUser | null> {
  const { data } = await auth.getSession();
  const sessionUser = data?.user;
  const email = sessionUser?.email?.toLowerCase().trim();
  if (!email) return null;

  let user = await one<PlatformUser>(`${SELECT_USER} WHERE lower(email) = $1`, [email]);

  if (!user && email === (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").toLowerCase().trim()) {
    const name = sessionUser?.name?.trim() || "Platform Administrator";
    const [first, ...rest] = name.split(/\s+/);
    const rows = await query<PlatformUser>(
      `INSERT INTO users (username, email, role, profile_role, first_name, last_name, job_title, department, auth_user_id)
       VALUES ($1, $2, 'admin', 'admin', $3, $4, 'Platform Administrator', 'Administration', $5)
       ON CONFLICT ((lower(email))) DO UPDATE SET auth_user_id = excluded.auth_user_id
       RETURNING id, auth_user_id, username, email, role, profile_role, first_name, last_name,
         job_title, department, phone, gender, timezone, active, manually_locked, retired, theme_mode,
         color_theme, compact_mode, email_notifications, photo_data_url`,
      [email.split("@")[0], email, first, rest.join(" "), sessionUser?.id ?? null],
    );
    user = rows[0] ?? null;
  }

  if (user && !user.auth_user_id && sessionUser?.id) {
    await query("UPDATE users SET auth_user_id = $1, updated_at = now() WHERE id = $2", [sessionUser.id, user.id]);
  }

  if (user?.auth_user_id) {
    const authRole = (sessionUser as { role?: string } | undefined)?.role;
    await syncAuthRole(user.auth_user_id, user.profile_role, authRole);
  }

  if (!user || user.retired || !user.active || user.manually_locked) return null;
  return user;
}

export async function syncAuthRole(
  authUserId: string,
  profileRole: string,
  currentAuthRole?: string,
): Promise<void> {
  const desired = profileRole === "admin" ? "admin" : "user";
  if (currentAuthRole === desired) return;
  await query(`UPDATE neon_auth."user" SET role = $1 WHERE id = $2`, [desired, authUserId]);
}

export function canEdit(user: PlatformUser | null): boolean {
  return user?.profile_role === "admin" || user?.profile_role === "analyst";
}

export function canReview(user: PlatformUser | null): boolean {
  return user?.profile_role === "admin" || user?.profile_role === "reviewer";
}

export function isAdmin(user: PlatformUser | null): boolean {
  return user?.profile_role === "admin";
}
