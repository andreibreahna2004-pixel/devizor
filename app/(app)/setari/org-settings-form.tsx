"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveOrganization } from "@/app/actions/records";
import { FieldError, FormError, FormSuccess } from "@/components/form-feedback";
import { COUNTIES } from "@/lib/counties";

interface OrgSettings {
  name: string;
  cui: string;
  vatPayer: boolean;
  regCom: string | null;
  address: string;
  city: string;
  countyCode: string;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  bank: string | null;
  defaultVatRate: number;
}

export function OrgSettingsForm({
  org,
  canManage,
}: {
  org: OrgSettings;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveOrganization(formData);
      if (!result.ok) {
        setError(result.error ?? null);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="card space-y-5 p-5">
      <fieldset disabled={!canManage} className="space-y-5">
        <div>
          <h2 className="font-semibold text-ink-900">Datele firmei</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Judetul e obligatoriu in e-Factura; pentru Bucuresti, localitatea
            trebuie sa fie sectorul.
          </p>
        </div>

        <FormError message={error ?? undefined} />
        {saved && <FormSuccess message="Setarile au fost salvate." />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Denumire</label>
            <input id="name" name="name" className="input" defaultValue={org.name} required />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <label className="label" htmlFor="cui">CUI</label>
            <input id="cui" name="cui" className="input" defaultValue={org.cui} required />
            <label className="mt-2 flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" name="vatPayer" defaultChecked={org.vatPayer} />
              Platitor de TVA
            </label>
            <FieldError message={fieldErrors.cui} />
          </div>
          <div>
            <label className="label" htmlFor="regCom">Nr. Reg. Com.</label>
            <input id="regCom" name="regCom" className="input" defaultValue={org.regCom ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="postalCode">Cod postal</label>
            <input id="postalCode" name="postalCode" className="input" defaultValue={org.postalCode ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="address">Adresa sediului</label>
            <input id="address" name="address" className="input" defaultValue={org.address} required />
            <FieldError message={fieldErrors.address} />
          </div>
          <div>
            <label className="label" htmlFor="countyCode">Judet</label>
            <select id="countyCode" name="countyCode" className="input" defaultValue={org.countyCode} required>
              {COUNTIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <FieldError message={fieldErrors.countyCode} />
          </div>
          <div>
            <label className="label" htmlFor="city">Localitate</label>
            <input id="city" name="city" className="input" defaultValue={org.city} required />
            <FieldError message={fieldErrors.city} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" defaultValue={org.email ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Telefon</label>
            <input id="phone" name="phone" className="input" defaultValue={org.phone ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="iban">IBAN</label>
            <input id="iban" name="iban" className="input" defaultValue={org.iban ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="bank">Banca</label>
            <input id="bank" name="bank" className="input" defaultValue={org.bank ?? ""} />
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-5">
          <h2 className="font-semibold text-ink-900">Valori implicite pentru devize</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Se copiaza pe fiecare deviz nou si raman inghetate pe el; modificarea
            lor de aici nu schimba devizele existente.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="defaultVatRate">TVA %</label>
              <input id="defaultVatRate" name="defaultVatRate" inputMode="decimal" className="input tabular" defaultValue={org.defaultVatRate} />
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex justify-end border-t border-[var(--border)] pt-4">
            <button
              type="submit"
              className="btn-primary w-full sm:w-auto"
              disabled={pending}
            >
              {pending ? "Se salveaza..." : "Salveaza setarile"}
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
