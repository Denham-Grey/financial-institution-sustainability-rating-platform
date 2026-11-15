"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createInstitutionState,
  createPlatformUserState,
  deleteInstitutionState,
  resetUserPasscodeState,
  retireUserState,
  setUserActiveState,
  setUserLockState,
  updateInstitutionState,
  updateManagedUserState,
} from "@/lib/actions";
import { showToast } from "@/components/toast";
import { formatDate } from "@/lib/format";

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  profile_role: string;
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
  created_at: string;
};

export type AdminInstitutionRow = {
  id: number;
  name: string;
  type: string;
  reporting_period: string;
  deletable: boolean;
};

export type AuditEntry = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_name: string;
  actor_role: string;
  created_at: string;
};

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  reviewer: "Reviewer",
  analyst: "Analyst",
  partner: "Partner",
};

export function AdminConsole({
  users,
  institutions,
  audit,
  categories,
  currentUserId,
}: {
  users: AdminUser[];
  institutions: AdminInstitutionRow[];
  audit: AuditEntry[];
  categories: { code: string; official_name: string }[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [managedUser, setManagedUser] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [lockTarget, setLockTarget] = useState<{ user: AdminUser; locked: boolean } | null>(null);
  const [editInstitution, setEditInstitution] = useState<AdminInstitutionRow | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const profileDialog = useRef<HTMLDialogElement>(null);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const lockDialog = useRef<HTMLDialogElement>(null);
  const institutionDialog = useRef<HTMLDialogElement>(null);
  const mfaDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = profileDialog.current;
    if (!dialog) return;
    if (managedUser && !dialog.open) dialog.showModal();
    if (!managedUser && dialog.open) dialog.close();
  }, [managedUser]);

  useEffect(() => {
    const dialog = resetDialog.current;
    if (!dialog) return;
    if (resetUser && !dialog.open) dialog.showModal();
    if (!resetUser && dialog.open) dialog.close();
  }, [resetUser]);

  useEffect(() => {
    const dialog = lockDialog.current;
    if (!dialog) return;
    if (lockTarget && !dialog.open) dialog.showModal();
    if (!lockTarget && dialog.open) dialog.close();
  }, [lockTarget]);

  useEffect(() => {
    const dialog = institutionDialog.current;
    if (!dialog) return;
    if (editInstitution && !dialog.open) dialog.showModal();
    if (!editInstitution && dialog.open) dialog.close();
  }, [editInstitution]);

  useEffect(() => {
    const dialog = mfaDialog.current;
    if (!dialog) return;
    if (mfaOpen && !dialog.open) dialog.showModal();
    if (!mfaOpen && dialog.open) dialog.close();
  }, [mfaOpen]);

  async function submitForm(
    action: typeof createPlatformUserState,
    form: HTMLFormElement,
    onSuccess?: () => void,
  ) {
    setPending(true);
    const result = await action(null, new FormData(form));
    setPending(false);
    if (!result) return;
    showToast(result.message, result.ok ? "success" : "error");
    if (result.ok) {
      onSuccess?.();
      router.refresh();
    }
  }

  function catalogueOptions(selected?: string, allowOther = true) {
    const labels = [...new Set(categories.map((category) => category.official_name).filter(Boolean))];
    if (allowOther && selected && !labels.includes(selected)) labels.push(selected);
    return labels;
  }

  return (
    <>
      <div className="admin-grid user-admin-grid">
        <article className="card">
          <p className="eyebrow">Access control</p>
          <h2>Create a user account</h2>
          <form
            id="user-form"
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitForm(createPlatformUserState, event.currentTarget, () => event.currentTarget.reset());
            }}
          >
            <div className="form-grid two-columns">
              <label className="field">
                <span>First name</span>
                <input name="firstName" autoComplete="off" required />
              </label>
              <label className="field">
                <span>Last name</span>
                <input name="lastName" autoComplete="off" required />
              </label>
            </div>
            <label className="field">
              <span>Username</span>
              <span className="input-suffix-wrap">
                <input name="username" autoComplete="off" pattern="[A-Za-z0-9._-]{2,64}" required />
                <span>@denhamandgrey.com</span>
              </span>
            </label>
            <div className="form-grid two-columns">
              <label className="field">
                <span>Job title</span>
                <input name="jobTitle" autoComplete="off" required />
              </label>
              <label className="field">
                <span>Profile</span>
                <select name="role" defaultValue="analyst">
                  <option value="analyst">Analyst</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="partner">Partner</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Gender</span>
              <select name="gender">
                <option>Prefer not to say</option>
                <option>Female</option>
                <option>Male</option>
                <option>Non-binary</option>
              </select>
            </label>
            <div className="form-grid two-columns">
              <label className="field">
                <span>Initial passcode</span>
                <input
                  name="passcode"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{4}"
                  minLength={4}
                  maxLength={4}
                  required
                />
              </label>
              <label className="field">
                <span>Confirm passcode</span>
                <input
                  name="confirmPasscode"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{4}"
                  minLength={4}
                  maxLength={4}
                  required
                />
              </label>
            </div>
            <p className="form-note">Passcodes must contain exactly four digits. Share them through a secure channel.</p>
            <button className="button button-primary" type="submit" disabled={pending}>
              Create user
            </button>
          </form>
        </article>

        <article className="card admin-directory-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Authorised users</p>
              <h2>User directory</h2>
              <p className="page-subtitle">
                Reassign profiles, maintain user details, reset passcodes, suspend access, or apply a manual
                account lock.
              </p>
            </div>
            <span id="user-count" className="count-badge">
              {users.length}
            </span>
          </div>
          <div id="user-directory" className="institution-directory user-directory">
            {users.length ? (
              users.map((row) => {
                const isSelf = row.id === currentUserId;
                const status = row.retired ? "Retired" : !row.active ? "Suspended" : row.manually_locked ? "Locked" : "Active";
                return (
                  <div
                    className={`directory-row user-directory-row ${row.active && !row.retired ? "" : "directory-row-muted"}`}
                    key={row.id}
                  >
                    <div>
                      <strong>
                        {row.first_name} {row.last_name}
                        {isSelf ? " (you)" : ""}
                      </strong>
                      <span>{row.email}</span>
                      <span className={`account-status status-${status.toLowerCase()}`}>{status}</span>
                    </div>
                    <span className={`role-badge role-${row.profile_role}`}>
                      {roleLabels[row.profile_role] || "Analyst"}
                    </span>
                    <div>
                      <strong>{row.job_title || "No job title"}</strong>
                      <span>{row.department || "No department"}</span>
                      <span>Added {formatDate(row.created_at)}</span>
                    </div>
                    <div className="directory-actions user-actions">
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => setManagedUser(row)}
                        disabled={row.retired}
                        title={row.retired ? "Retired profiles are retained only for governance history" : undefined}
                      >
                        Manage profile
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => setResetUser(row)}
                        disabled={isSelf || row.retired}
                        title={
                          row.retired
                            ? "Retired accounts cannot receive a passcode"
                            : isSelf
                              ? "Use Change my passcode below"
                              : undefined
                        }
                      >
                        Reset passcode
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={isSelf || row.retired}
                        onClick={() => {
                          if (!window.confirm(`${row.active ? "Suspend" : "Activate"} ${row.first_name} ${row.last_name}?${row.active ? " Their active sessions will end." : ""}`)) return;
                          const formData = new FormData();
                          formData.set("userId", String(row.id));
                          formData.set("active", String(!row.active));
                          setPending(true);
                          void setUserActiveState(null, formData).then((result) => {
                            setPending(false);
                            if (!result) return;
                            showToast(result.message, result.ok ? "success" : "error");
                            if (result.ok) router.refresh();
                          });
                        }}
                      >
                        {row.active ? "Suspend" : "Activate"}
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={isSelf || row.retired}
                        onClick={() => setLockTarget({ user: row, locked: !row.manually_locked })}
                      >
                        {row.manually_locked ? "Unlock" : "Lock"}
                      </button>
                      <button
                        className="button button-danger"
                        type="button"
                        disabled={isSelf || row.retired}
                        onClick={() => {
                          const confirmation = window.prompt(
                            `Type “${row.username}” to remove account access. If the user is referenced by immutable history, the profile will be retired rather than erased.`,
                          );
                          if (confirmation === null) return;
                          const formData = new FormData();
                          formData.set("userId", String(row.id));
                          formData.set("confirmUsername", confirmation);
                          setPending(true);
                          void retireUserState(null, formData).then((result) => {
                            setPending(false);
                            if (!result) return;
                            showToast(result.message, result.ok ? "success" : "error");
                            if (result.ok) router.refresh();
                          });
                        }}
                      >
                        Retire / remove
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-directory">No user accounts found.</div>
            )}
          </div>
        </article>
      </div>

      <article className="card mfa-card">
        <div>
          <p className="eyebrow">Stronger administrator security</p>
          <h2>Authenticator verification</h2>
          <p id="mfa-status" className="page-subtitle">
            Add a rotating six-digit code after your passcode.
          </p>
        </div>
        <button
          id="mfa-action-button"
          className="button button-secondary"
          type="button"
          onClick={() => setMfaOpen(true)}
        >
          Enable authenticator
        </button>
      </article>

      <article className="card backup-card">
        <div>
          <p className="eyebrow">Data resilience</p>
          <h2>Verified recovery bundles</h2>
          <p id="backup-settings" className="page-subtitle">
            Automatic bundles protect the database and evidence attachments together.
          </p>
        </div>
        <div className="backup-controls">
          <button
            id="create-backup-button"
            className="button button-primary"
            type="button"
            onClick={() =>
              showToast(
                "Database recovery is managed by Neon point-in-time restore; evidence files are held in Neon Object Storage.",
                "error",
              )
            }
          >
            Create backup now
          </button>
          <div id="backup-list" className="backup-list" />
        </div>
      </article>

      <div className="admin-grid">
        <article className="card">
          <p className="eyebrow">Institution directory</p>
          <h2>Approve a custom institution</h2>
          <p className="page-subtitle">
            Use this only when the institution is not available in the licensed directory. Administrator approval
            is recorded on creation.
          </p>
          <form
            id="institution-form"
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitForm(createInstitutionState, event.currentTarget, () => event.currentTarget.reset());
            }}
          >
            <label className="field">
              <span>Institution name</span>
              <input name="name" required />
            </label>
            <label className="field">
              <span>Institution category</span>
              <select id="institution-category-select" name="type" required defaultValue="">
                <option value="">Select an institution category</option>
                {catalogueOptions().map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Reporting period</span>
              <input name="reportingPeriod" defaultValue="Baseline" />
            </label>
            <label className="field">
              <span>Administrator approval comment</span>
              <textarea
                name="comment"
                rows={4}
                maxLength={2000}
                placeholder="Explain why this custom institution should enter the rating workspace."
                required
              />
            </label>
            <p className="form-note">
              The institution is enrolled as approved immediately, and this comment is retained in its enrolment
              audit trail.
            </p>
            <button className="button button-primary" type="submit" disabled={pending}>
              Approve &amp; add institution
            </button>
          </form>
        </article>

        <article className="card admin-directory-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Current coverage</p>
              <h2>Institutions</h2>
            </div>
            <span id="institution-count" className="count-badge">
              {institutions.length}
            </span>
          </div>
          <div id="institution-directory" className="institution-directory">
            {institutions.length ? (
              institutions.map((institution) => (
                <div className="directory-row" key={institution.id}>
                  <div>
                    <strong>{institution.name}</strong>
                    <span>{institution.reporting_period}</span>
                  </div>
                  <span>{institution.type}</span>
                  <div className="directory-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setEditInstitution(institution)}
                    >
                      Edit
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      disabled={!institution.deletable}
                      title={institution.deletable ? undefined : "Historical records cannot be deleted"}
                      onClick={() => {
                        const confirmation = window.prompt(
                          `Type “${institution.name}” to remove this unassessed institution. Records with assessment, evidence, workflow, or certificate history cannot be deleted.`,
                        );
                        if (confirmation === null) return;
                        const formData = new FormData();
                        formData.set("id", String(institution.id));
                        formData.set("confirmName", confirmation);
                        setPending(true);
                        void deleteInstitutionState(null, formData).then((result) => {
                          setPending(false);
                          if (!result) return;
                          showToast(result.message, result.ok ? "success" : "error");
                          if (result.ok) router.refresh();
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-directory">No institutions are enrolled in the rating portfolio.</div>
            )}
          </div>
        </article>
      </div>

      <article className="card audit-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Governance</p>
            <h2>Recent activity</h2>
          </div>
          <button id="refresh-audit-button" className="button button-secondary" type="button" onClick={() => router.refresh()}>
            Refresh
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody id="audit-table-body">
              {audit.length ? (
                audit.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{row.actor_name}</td>
                    <td>{row.action}</td>
                    <td>{row.entity_type}</td>
                    <td>{row.entity_id}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-row">
                    No activity has been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <dialog
        id="user-profile-dialog"
        className="signal-dialog compact-dialog"
        aria-labelledby="user-profile-dialog-title"
        ref={profileDialog}
        onCancel={(event) => {
          event.preventDefault();
          setManagedUser(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setManagedUser(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Account administration</p>
            <h2 id="user-profile-dialog-title">Manage user profile</h2>
          </div>
          <button
            id="close-user-profile-dialog"
            className="icon-button"
            type="button"
            aria-label="Close user profile editor"
            onClick={() => setManagedUser(null)}
          >
            ×
          </button>
        </div>
        {managedUser ? (
          <form
            key={managedUser.id}
            id="user-profile-form"
            className="stack-form dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitForm(updateManagedUserState, event.currentTarget, () => setManagedUser(null));
            }}
          >
            <input name="userId" type="hidden" defaultValue={managedUser.id} />
            <div className="form-grid two-columns">
              <label className="field">
                <span>First name</span>
                <input name="firstName" maxLength={100} defaultValue={managedUser.first_name} required />
              </label>
              <label className="field">
                <span>Last name</span>
                <input name="lastName" maxLength={100} defaultValue={managedUser.last_name} required />
              </label>
            </div>
            <label className="field">
              <span>Job title</span>
              <input name="jobTitle" maxLength={150} defaultValue={managedUser.job_title} required />
            </label>
            <div className="form-grid two-columns">
              <label className="field">
                <span>Profile</span>
                <select name="role" defaultValue={managedUser.profile_role} required>
                  <option value="analyst">Analyst</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="partner">Partner</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <label className="field">
                <span>Department</span>
                <input name="department" maxLength={150} defaultValue={managedUser.department} />
              </label>
            </div>
            <div className="form-grid two-columns">
              <label className="field">
                <span>Phone</span>
                <input name="phone" type="tel" maxLength={50} defaultValue={managedUser.phone} />
              </label>
              <label className="field">
                <span>Gender</span>
                <select name="gender" defaultValue={managedUser.gender || "Prefer not to say"}>
                  <option>Prefer not to say</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Non-binary</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Time zone</span>
              <select name="timezone" defaultValue={managedUser.timezone || "Africa/Lagos"}>
                <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                <option value="UTC">UTC</option>
                <option value="Europe/London">Europe/London</option>
                <option value="America/New_York">America/New York</option>
              </select>
            </label>
            <p className="form-note">Profile reassignment takes effect immediately and ends the user’s active sessions.</p>
            <div className="dialog-actions">
              <button id="cancel-user-profile" className="button button-secondary" type="button" onClick={() => setManagedUser(null)}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={pending}>
                Save user profile
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

      <dialog
        id="reset-passcode-dialog"
        className="signal-dialog compact-dialog"
        aria-labelledby="reset-passcode-title"
        ref={resetDialog}
        onCancel={(event) => {
          event.preventDefault();
          setResetUser(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setResetUser(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Account administration</p>
            <h2 id="reset-passcode-title">Reset user passcode</h2>
          </div>
          <button
            id="close-reset-passcode-dialog"
            className="icon-button"
            type="button"
            aria-label="Close passcode reset"
            onClick={() => setResetUser(null)}
          >
            ×
          </button>
        </div>
        {resetUser ? (
          <form
            key={resetUser.id}
            id="reset-passcode-form"
            className="stack-form dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitForm(resetUserPasscodeState, event.currentTarget, () => setResetUser(null));
            }}
          >
            <input name="userId" type="hidden" defaultValue={resetUser.id} />
            <p id="reset-passcode-user" className="page-subtitle">
              {resetUser.first_name} {resetUser.last_name} · {resetUser.email}
            </p>
            <label className="field">
              <span>New four-digit passcode</span>
              <input
                name="newPasscode"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                required
              />
            </label>
            <label className="field">
              <span>Confirm new passcode</span>
              <input
                name="confirmPasscode"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                required
              />
            </label>
            <div className="dialog-actions">
              <button id="cancel-reset-passcode" className="button button-secondary" type="button" onClick={() => setResetUser(null)}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={pending}>
                Reset passcode
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

      <dialog
        id="account-lock-dialog"
        className="signal-dialog compact-dialog"
        aria-labelledby="account-lock-dialog-title"
        ref={lockDialog}
        onCancel={(event) => {
          event.preventDefault();
          setLockTarget(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setLockTarget(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Manual access control</p>
            <h2 id="account-lock-dialog-title">{lockTarget?.locked ? "Lock user account" : "Unlock user account"}</h2>
          </div>
          <button
            id="close-account-lock-dialog"
            className="icon-button"
            type="button"
            aria-label="Close account lock control"
            onClick={() => setLockTarget(null)}
          >
            ×
          </button>
        </div>
        {lockTarget ? (
          <form
            key={`${lockTarget.user.id}-${lockTarget.locked}`}
            id="account-lock-form"
            className="stack-form dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitForm(setUserLockState, event.currentTarget, () => setLockTarget(null));
            }}
          >
            <input name="userId" type="hidden" defaultValue={lockTarget.user.id} />
            <input name="locked" type="hidden" defaultValue={String(lockTarget.locked)} />
            <p id="account-lock-context" className="page-subtitle">
              {lockTarget.locked
                ? `${lockTarget.user.first_name} ${lockTarget.user.last_name}'s active sessions will end immediately.`
                : `${lockTarget.user.first_name} ${lockTarget.user.last_name} will be able to sign in again if the account is active.`}
            </p>
            <label className="field">
              <span id="account-lock-reason-label">{lockTarget.locked ? "Lock reason" : "Unlock reason"}</span>
              <textarea name="reason" rows={4} maxLength={500} required />
            </label>
            <p id="account-lock-help" className="form-note">
              The reason and Administrator identity are retained in the access-control audit trail.
            </p>
            <div className="dialog-actions">
              <button id="cancel-account-lock" className="button button-secondary" type="button" onClick={() => setLockTarget(null)}>
                Cancel
              </button>
              <button
                id="submit-account-lock"
                className={`button ${lockTarget.locked ? "button-danger" : "button-primary"}`}
                type="submit"
                disabled={pending}
              >
                {lockTarget.locked ? "Lock account" : "Unlock account"}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

      <dialog
        id="institution-edit-dialog"
        className="signal-dialog compact-dialog"
        aria-labelledby="institution-edit-title"
        ref={institutionDialog}
        onCancel={(event) => {
          event.preventDefault();
          setEditInstitution(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setEditInstitution(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Institution directory</p>
            <h2 id="institution-edit-title">Edit institution</h2>
          </div>
          <button
            id="close-institution-edit-dialog"
            className="icon-button"
            type="button"
            aria-label="Close institution editor"
            onClick={() => setEditInstitution(null)}
          >
            ×
          </button>
        </div>
        {editInstitution ? (
          <form
            key={editInstitution.id}
            id="institution-edit-form"
            className="stack-form dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitForm(updateInstitutionState, event.currentTarget, () => setEditInstitution(null));
            }}
          >
            <input name="id" type="hidden" defaultValue={editInstitution.id} />
            <label className="field">
              <span>Institution name</span>
              <input name="name" defaultValue={editInstitution.name} required />
            </label>
            <label className="field">
              <span>Institution category</span>
              <select id="institution-edit-category-select" name="type" defaultValue={editInstitution.type} required>
                <option value="">Select an institution category</option>
                {catalogueOptions(editInstitution.type).map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Reporting period</span>
              <input name="reportingPeriod" defaultValue={editInstitution.reporting_period} required />
            </label>
            <div className="dialog-actions">
              <button id="cancel-institution-edit" className="button button-secondary" type="button" onClick={() => setEditInstitution(null)}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={pending}>
                Save institution
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

      <dialog
        id="mfa-credential-dialog"
        className="signal-dialog compact-dialog"
        aria-labelledby="mfa-credential-title"
        ref={mfaDialog}
        onCancel={(event) => {
          event.preventDefault();
          setMfaOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setMfaOpen(false);
        }}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">Administrator security</p>
            <h2 id="mfa-credential-title">Authenticator verification</h2>
          </div>
          <button
            id="close-mfa-credential-dialog"
            className="icon-button"
            type="button"
            aria-label="Close authenticator dialog"
            onClick={() => setMfaOpen(false)}
          >
            ×
          </button>
        </div>
        <form
          id="mfa-credential-form"
          className="stack-form dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            showToast(
              "Authenticator verification is managed by Neon Auth and is not enabled for this workspace.",
              "error",
            );
          }}
        >
          <p id="mfa-credential-instructions" className="page-subtitle">
            Add a rotating six-digit code after your passcode. This workspace has not enabled the Neon Auth
            authenticator plugin, so enrolment cannot be completed here.
          </p>
          <label id="mfa-current-passcode-field" className="field">
            <span>Current four-digit passcode</span>
            <input
              name="currentPasscode"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]{4}"
              minLength={4}
              maxLength={4}
            />
          </label>
          <label className="field">
            <span>Current six-digit authenticator code</span>
            <input
              name="mfaCode"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
            />
          </label>
          <p className="form-note">Authenticator enrolment requires server-side MFA support in Neon Auth.</p>
          <div className="dialog-actions">
            <button
              id="cancel-mfa-credential"
              className="button button-secondary"
              type="button"
              onClick={() => setMfaOpen(false)}
            >
              Cancel
            </button>
            <button id="submit-mfa-credential" className="button button-primary" type="submit">
              Continue
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
