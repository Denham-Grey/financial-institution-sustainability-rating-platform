"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@neon/auth/next";
import { useEffect, useRef, useState } from "react";

const authClient = createAuthClient();

export function ProfileMenu({
  initials,
  name,
  role,
  email,
}: {
  initials: string;
  name: string;
  role: string;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        id="profile-button"
        className="profile-button"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="profile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span id="profile-avatar" className="avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="profile-summary">
          <strong id="profile-name">{name}</strong>
          <small id="profile-role">{role}</small>
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div ref={menuRef} id="profile-menu" className="profile-menu" role="menu" hidden={!open}>
        <div>
          <strong id="profile-menu-name">{name}</strong>
          <span id="profile-menu-email">{email}</span>
        </div>
        <Link id="open-profile-settings" className="button button-secondary button-full" href="/profile">
          Profile settings
        </Link>
        <button
          id="signout-button"
          className="button button-danger button-full"
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await authClient.signOut();
            router.replace("/sign-in");
            router.refresh();
          }}
        >
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </>
  );
}
