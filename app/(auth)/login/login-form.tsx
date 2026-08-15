"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, loginAction } from "@/app/actions/auth";
import { FieldError, FormError } from "@/components/form-feedback";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Se verifica..." : "Intra in cont"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    loginAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.error} />

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="input"
          placeholder="nume@firma.ro"
          required
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Parola
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="input"
          required
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <SubmitButton />
    </form>
  );
}
