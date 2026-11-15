"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@neon/auth/next";

const authClient = createAuthClient();

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const trimmed = username.trim();
    const email = trimmed.includes("@") ? trimmed : `${trimmed}@denhamandgrey.com`;
    const password = /^\d{4}$/.test(passcode) ? `${passcode}0000` : passcode;
    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      setError(
        signInError.status === 401
          ? "That username and passcode combination is not recognised."
          : signInError.message || "Sign-in failed. Try again.",
      );
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="auth-layout" id="auth-view">
      <section className="auth-story" aria-labelledby="auth-brand-title">
        <div className="brand-mark brand-mark-large" aria-hidden="true">
          FISR
        </div>
        <p className="eyebrow">Denham &amp; Grey</p>
        <h1 id="auth-brand-title">Financial Institution Sustainability Rating Platform</h1>
        <p className="auth-intro">
          A structured, evidence-led view of sustainability performance across Nigeria’s financial sector.
        </p>
        <div className="auth-highlights" aria-label="Platform capabilities">
          <article>
            <strong>9</strong>
            <span>NSBP principles</span>
          </article>
          <article>
            <strong>47</strong>
            <span>rating signals</span>
          </article>
          <article>
            <strong>100</strong>
            <span>weighted points</span>
          </article>
        </div>
        <p className="auth-disclaimer">
          Analytical decision-support tool. It is not an official regulatory, credit, or investment
          rating.
        </p>
      </section>

      <section className="auth-panel-wrap">
        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="status-dot" aria-hidden="true" />
            <span>Secure workspace</span>
          </div>
          <form id="signin-form" className="auth-form active" onSubmit={onSubmit}>
            <div>
              <p className="eyebrow">Welcome back</p>
              <h2>Sign in to the rating workspace</h2>
            </div>
            <label className="field">
              <span>Username</span>
              <span className="input-suffix-wrap">
                <input
                  id="signin-username"
                  name="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                <span>@denhamandgrey.com</span>
              </span>
            </label>
            <label className="field">
              <span>Four-digit passcode</span>
              <input
                id="signin-passcode"
                name="passcode"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                required
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
              />
            </label>
            {error ? (
              <p className="form-note" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button button-primary button-full" type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
            <p className="form-note">
              Accounts are issued by a workspace administrator. Contact your administrator if you need
              access.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
