"use client";

import { useRouter } from "next/navigation";
import { createAuthClient } from "@neon/auth/next";
import { useState } from "react";

const authClient = createAuthClient();

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
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
  );
}
