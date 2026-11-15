"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@neon/auth/next";
import { saveProfileState } from "@/lib/actions";
import { showToast } from "@/components/toast";
import type { PlatformUser } from "@/lib/session";

const authClient = createAuthClient();

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  reviewer: "Reviewer",
  analyst: "Analyst",
  partner: "Partner",
};

const modes = ["dark", "light"] as const;
const colours = ["amber", "emerald", "cobalt", "crimson"] as const;

function applyAppearance(mode: string, colour: string, persist = true) {
  const safeMode = modes.includes(mode as (typeof modes)[number]) ? mode : "dark";
  const safeColour = colours.includes(colour as (typeof colours)[number]) ? colour : "amber";
  document.documentElement.dataset.theme = safeMode;
  document.documentElement.dataset.colorTheme = safeColour;
  if (persist) {
    localStorage.setItem("ngfi_theme", safeMode);
    localStorage.setItem("ngfi_colour_theme", safeColour);
  }
  window.dispatchEvent(new CustomEvent("ngfi-theme-change", { detail: { mode: safeMode, colour: safeColour } }));
}

export function ProfileSettings({ user }: { user: PlatformUser }) {
  const router = useRouter();
  const [mode, setMode] = useState<string>(user.theme_mode || "dark");
  const [colour, setColour] = useState<string>(user.color_theme || "amber");
  const [photo, setPhoto] = useState<string>(user.photo_data_url || "");
  const [pending, setPending] = useState(false);
  const [passcodePending, setPasscodePending] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedMode = localStorage.getItem("ngfi_theme") || user.theme_mode || "dark";
    const storedColour = localStorage.getItem("ngfi_colour_theme") || user.color_theme || "amber";
    setMode(storedMode);
    setColour(storedColour);
    applyAppearance(storedMode, storedColour, false);
  }, [user.theme_mode, user.color_theme]);

  const initials = `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase() || "U";

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("photoDataUrl", photo);
    formData.set("themeMode", mode);
    formData.set("colorTheme", colour);
    setPending(true);
    const result = await saveProfileState(null, formData);
    setPending(false);
    if (!result) return;
    showToast(result.message, result.ok ? "success" : "error");
    if (result.ok) router.refresh();
  }

  async function changePasscode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (formData.get("newPasscode") !== formData.get("confirmPasscode")) {
      showToast("The new passcodes do not match.", "error");
      return;
    }
    setPasscodePending(true);
    const current = String(formData.get("currentPasscode") || "");
    const next = String(formData.get("newPasscode") || "");
    const { error } = await authClient.changePassword({
      currentPassword: /^\d{4}$/.test(current) ? `${current}0000` : current,
      newPassword: /^\d{4}$/.test(next) ? `${next}0000` : next,
      revokeOtherSessions: true,
    });
    setPasscodePending(false);
    if (error) {
      showToast(error.message || "The passcode could not be changed.", "error");
      return;
    }
    form.reset();
    showToast("Your passcode was changed and other sessions were ended.");
  }

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > 350 * 1024) {
      showToast("Profile photo must be 350 KB or smaller.", "error");
      if (photoInput.current) photoInput.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.onerror = () => showToast("The profile photo could not be read.", "error");
    reader.readAsDataURL(file);
  }

  return (
    <div className="profile-settings-grid">
      <article className="card profile-identity-card">
        <p className="eyebrow">User profile</p>
        <h2>Professional identity</h2>
        <form id="profile-settings-form" className="stack-form" onSubmit={saveProfile}>
          <div className="profile-photo-row">
            <span id="profile-settings-avatar" className="profile-settings-avatar">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" />
              ) : (
                initials
              )}
            </span>
            <label className="button button-secondary file-button">
              Choose photo
              <input
                id="profile-photo-input"
                ref={photoInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => choosePhoto(event.target.files?.[0])}
              />
            </label>
            <button
              id="remove-profile-photo"
              className="button button-secondary"
              type="button"
              onClick={() => {
                setPhoto("");
                if (photoInput.current) photoInput.current.value = "";
              }}
            >
              Remove
            </button>
            <small>PNG, JPG, or WebP up to 350 KB.</small>
          </div>
          <div className="form-grid two-columns">
            <label className="field">
              <span>First name</span>
              <input name="firstName" defaultValue={user.first_name} required />
            </label>
            <label className="field">
              <span>Last name</span>
              <input name="lastName" defaultValue={user.last_name} required />
            </label>
          </div>
          <div className="form-grid two-columns">
            <label className="field">
              <span>Job title</span>
              <input name="jobTitle" defaultValue={user.job_title} required />
            </label>
            <label className="field">
              <span>Role</span>
              <input name="roleLabel" defaultValue={roleLabels[user.profile_role] || "Analyst"} readOnly />
            </label>
          </div>
          <div className="form-grid two-columns">
            <label className="field">
              <span>Department</span>
              <input name="department" defaultValue={user.department} placeholder="e.g. Sustainability Ratings" />
            </label>
            <label className="field">
              <span>Phone</span>
              <input name="phone" type="tel" defaultValue={user.phone} placeholder="+234 …" />
            </label>
          </div>
          <div className="form-grid two-columns">
            <label className="field">
              <span>Time zone</span>
              <select name="timezone" defaultValue={user.timezone || "Africa/Lagos"}>
                <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                <option value="UTC">UTC</option>
                <option value="Europe/London">Europe/London</option>
                <option value="America/New_York">America/New York</option>
              </select>
            </label>
            <label className="field">
              <span>Gender</span>
              <select name="gender" defaultValue={user.gender || "Prefer not to say"}>
                <option>Prefer not to say</option>
                <option>Female</option>
                <option>Male</option>
                <option>Non-binary</option>
              </select>
            </label>
          </div>
          <fieldset className="settings-fieldset">
            <legend>Workspace preferences</legend>
            <label className="toggle-row">
              <span>
                <strong>Email notification preference</strong>
                <small>Records your preference for future delivery. Automated email delivery is not yet configured.</small>
              </span>
              <input name="emailNotifications" type="checkbox" defaultChecked={user.email_notifications} />
            </label>
            <label className="toggle-row">
              <span>
                <strong>Compact data mode</strong>
                <small>Use denser table rows across analytical screens</small>
              </span>
              <input name="compactMode" type="checkbox" defaultChecked={user.compact_mode} />
            </label>
          </fieldset>
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save profile settings"}
          </button>
        </form>
      </article>

      <div className="profile-settings-column">
        <article className="card display-settings-card">
          <p className="eyebrow">Terminal display</p>
          <h2>Appearance</h2>
          <div className="mode-selector" role="group" aria-label="Display mode">
            <button
              type="button"
              data-mode-choice="dark"
              className={mode === "dark" ? "selected" : undefined}
              aria-pressed={mode === "dark"}
              onClick={() => {
                setMode("dark");
                applyAppearance("dark", colour);
              }}
            >
              Dark mode
            </button>
            <button
              type="button"
              data-mode-choice="light"
              className={mode === "light" ? "selected" : undefined}
              aria-pressed={mode === "light"}
              onClick={() => {
                setMode("light");
                applyAppearance("light", colour);
              }}
            >
              Light mode
            </button>
          </div>
          <p className="settings-label">Colour theme</p>
          <div className="theme-grid" role="group" aria-label="Colour theme">
            {colours.map((choice) => (
              <button
                key={choice}
                type="button"
                data-colour-choice={choice}
                className={colour === choice ? "selected" : undefined}
                aria-pressed={colour === choice}
                onClick={() => {
                  setColour(choice);
                  applyAppearance(mode, choice);
                }}
              >
                <i />
                <span>{choice[0].toUpperCase() + choice.slice(1)}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="card security-settings-card">
          <p className="eyebrow">Account security</p>
          <h2>Change my passcode</h2>
          <p className="page-subtitle">Changing your passcode ends your other active sessions.</p>
          <form id="passcode-form" className="stack-form" onSubmit={changePasscode}>
            <label className="field">
              <span>Current passcode</span>
              <input
                name="currentPasscode"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                required
              />
            </label>
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
            <button className="button button-primary" type="submit" disabled={passcodePending}>
              {passcodePending ? "Updating…" : "Update passcode"}
            </button>
          </form>
        </article>
      </div>
    </div>
  );
}
