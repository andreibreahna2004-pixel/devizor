"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, registerAction } from "@/app/actions/auth";
import { FieldError, FormError } from "@/components/form-feedback";
import { COUNTIES } from "@/lib/counties";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Se pregateste contul..." : "Creeaza contul"}
    </button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    registerAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormError message={state.error} />

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Contul tau
        </legend>

        <div>
          <label className="label" htmlFor="name">
            Nume si prenume
          </label>
          <input id="name" name="name" className="input" autoComplete="name" required />
          <FieldError message={state.fieldErrors?.name} />
        </div>

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            autoComplete="email"
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
            className="input"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="mt-1.5 text-xs text-ink-500">Minim 8 caractere.</p>
          <FieldError message={state.fieldErrors?.password} />
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-[var(--border)] pt-5">
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Datele firmei
        </legend>
        <p className="text-xs text-ink-500">
          Apar pe devize si facturi. Le poti modifica oricand din Setari.
        </p>

        <div>
          <label className="label" htmlFor="orgName">
            Denumire firma
          </label>
          <input
            id="orgName"
            name="orgName"
            className="input"
            placeholder="Construct Expert SRL"
            required
          />
          <FieldError message={state.fieldErrors?.orgName} />
        </div>

        <div>
          <label className="label" htmlFor="cui">
            CUI
          </label>
          <input
            id="cui"
            name="cui"
            className="input"
            placeholder="12345678"
            required
          />
          <p className="mt-1.5 text-xs text-ink-500">
            Doar cifrele. Prefixul RO se adauga automat daca esti platitor de TVA.
          </p>
          <FieldError message={state.fieldErrors?.cui} />
        </div>

        <div>
          <label className="label" htmlFor="address">
            Adresa sediului
          </label>
          <input
            id="address"
            name="address"
            className="input"
            placeholder="Str. Constructorilor nr. 12"
            required
          />
          <FieldError message={state.fieldErrors?.address} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="countyCode">
              Judet
            </label>
            <select id="countyCode" name="countyCode" className="input" required defaultValue="">
              <option value="" disabled>
                Alege judetul
              </option>
              {COUNTIES.map((county) => (
                <option key={county.code} value={county.code}>
                  {county.name}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.countyCode} />
          </div>

          <div>
            <label className="label" htmlFor="city">
              Localitate
            </label>
            <input
              id="city"
              name="city"
              className="input"
              placeholder="Cluj-Napoca"
              required
            />
            <FieldError message={state.fieldErrors?.city} />
          </div>
        </div>
      </fieldset>

      <SubmitButton />

      <p className="text-xs leading-relaxed text-ink-500">
        Nu ai nimic de configurat inainte de primul deviz. Preturile le scrii pe
        fiecare linie, cat vrei tu sa fie.
      </p>
    </form>
  );
}
