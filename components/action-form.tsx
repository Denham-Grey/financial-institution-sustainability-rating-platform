"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";

export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  secondary,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  secondary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state ? (
        <p className={state.ok ? "form-note" : "form-note error-state"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
      <button
        className={`button ${secondary ? "button-secondary" : "button-primary"}`}
        type="submit"
        disabled={pending}
      >
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
