"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteClient, saveClient } from "@/app/actions/records";
import { FieldError, FormError } from "@/components/form-feedback";
import { COUNTIES } from "@/lib/counties";

export interface ClientRow {
  id: string;
  type: "PERSOANA_FIZICA" | "PERSOANA_JURIDICA";
  name: string;
  cui: string | null;
  vatPayer: boolean;
  regCom: string | null;
  cnp: string | null;
  address: string | null;
  city: string | null;
  countyCode: string | null;
  countyName: string;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  documentCount: number;
  invoiceCount: number;
}

export function ClientList({ clients }: { clients: ClientRow[] }) {
  const [editing, setEditing] = useState<ClientRow | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          onClick={() => setEditing("new")}
        >
          Client nou
        </button>
      </div>

      {editing && (
        <ClientForm
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {clients.length === 0 ? (
        <div className="card p-8 text-center sm:p-12">
          <p className="text-sm text-ink-500">Niciun client inregistrat.</p>
        </div>
      ) : (
        <>
          {/* Pe telefon randul devine card, iar "Editeaza" un buton pe toata
              latimea: la 375px, o legatura de trei cuvinte in coltul din dreapta
              e sub tinta de deget. */}
          <ul className="space-y-2.5 md:hidden">
            {clients.map((client) => (
              <li key={client.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-ink-900">{client.name}</p>
                  {!client.countyCode && (
                    <span
                      className="badge bg-amber-100 text-amber-900"
                      title="Fara judet, facturile nu pot fi exportate in e-Factura"
                    >
                      judet lipsa
                    </span>
                  )}
                </div>

                <dl className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
                  <div className="camp">
                    <dt>CUI / CNP</dt>
                    <dd>
                      {client.cui
                        ? `${client.vatPayer ? "RO" : ""}${client.cui}`
                        : (client.cnp ?? "—")}
                    </dd>
                  </div>
                  <div className="camp">
                    <dt>Localitate</dt>
                    <dd className="truncate">
                      {[client.city, client.countyName].filter(Boolean).join(", ") ||
                        "—"}
                    </dd>
                  </div>
                  <div className="camp">
                    <dt>Contact</dt>
                    <dd className="truncate">
                      {client.email ?? client.phone ?? "—"}
                    </dd>
                  </div>
                  <div className="camp">
                    <dt>Documente</dt>
                    <dd>{client.documentCount}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="btn-secondary mt-3 w-full"
                  onClick={() => setEditing(client)}
                >
                  Editeaza
                </button>
              </li>
            ))}
          </ul>

          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-[var(--border)] bg-ink-50">
                  <tr>
                    <th className="th">Denumire</th>
                    <th className="th w-32">CUI / CNP</th>
                    <th className="th">Localitate</th>
                    <th className="th">Contact</th>
                    <th className="th w-24 text-right">Documente</th>
                    <th className="th w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-ink-50">
                      <td className="td">
                        <span className="font-medium text-ink-900">{client.name}</span>
                        {!client.countyCode && (
                          <span
                            className="badge ml-2 bg-amber-100 text-amber-900"
                            title="Fara judet, facturile nu pot fi exportate in e-Factura"
                          >
                            judet lipsa
                          </span>
                        )}
                      </td>
                      <td className="td text-ink-600">
                        {client.cui
                          ? `${client.vatPayer ? "RO" : ""}${client.cui}`
                          : (client.cnp ?? "—")}
                      </td>
                      <td className="td text-ink-600">
                        {[client.city, client.countyName].filter(Boolean).join(", ") ||
                          "—"}
                      </td>
                      <td className="td text-ink-600">
                        {client.email ?? client.phone ?? "—"}
                      </td>
                      <td className="td tabular text-right text-ink-600">
                        {client.documentCount}
                      </td>
                      <td className="td text-right">
                        <button
                          type="button"
                          className="link text-sm"
                          onClick={() => setEditing(client)}
                        >
                          Editeaza
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ClientForm({
  client,
  onClose,
}: {
  client: ClientRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [type, setType] = useState(client?.type ?? "PERSOANA_JURIDICA");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveClient(formData);
      if (!result.ok) {
        setError(result.error ?? null);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!client) return;
    startTransition(async () => {
      const result = await deleteClient(client.id);
      if (!result.ok) {
        setError(result.error ?? "Stergerea a esuat");
        setConfirmingDelete(false);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <form action={submit} className="card space-y-4 p-5">
      <input type="hidden" name="id" value={client?.id ?? ""} />

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">
          {client ? `Editeaza ${client.name}` : "Client nou"}
        </h2>
        <button type="button" onClick={onClose} className="btn-ghost">
          Inchide
        </button>
      </div>

      <FormError message={error ?? undefined} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="type">
            Tip
          </label>
          <select
            id="type"
            name="type"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as ClientRow["type"])}
          >
            <option value="PERSOANA_JURIDICA">Persoana juridica</option>
            <option value="PERSOANA_FIZICA">Persoana fizica</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="name">
            Denumire
          </label>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={client?.name ?? ""}
            required
          />
          <FieldError message={fieldErrors.name} />
        </div>

        {type === "PERSOANA_JURIDICA" ? (
          <>
            <div>
              <label className="label" htmlFor="cui">
                CUI
              </label>
              <input
                id="cui"
                name="cui"
                className="input"
                defaultValue={client?.cui ?? ""}
                placeholder="12345678"
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  name="vatPayer"
                  defaultChecked={client?.vatPayer ?? false}
                />
                Platitor de TVA
              </label>
            </div>
            <div>
              <label className="label" htmlFor="regCom">
                Nr. Reg. Com.
              </label>
              <input
                id="regCom"
                name="regCom"
                className="input"
                defaultValue={client?.regCom ?? ""}
                placeholder="J12/1234/2020"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="cnp">
              CNP
            </label>
            <input
              id="cnp"
              name="cnp"
              className="input"
              defaultValue={client?.cnp ?? ""}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">
            Adresa
          </label>
          <input
            id="address"
            name="address"
            className="input"
            defaultValue={client?.address ?? ""}
          />
        </div>

        <div>
          <label className="label" htmlFor="countyCode">
            Judet
          </label>
          <select
            id="countyCode"
            name="countyCode"
            className="input"
            defaultValue={client?.countyCode ?? ""}
          >
            <option value="">—</option>
            {COUNTIES.map((county) => (
              <option key={county.code} value={county.code}>
                {county.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-500">Obligatoriu pentru e-Factura.</p>
          <FieldError message={fieldErrors.countyCode} />
        </div>

        <div>
          <label className="label" htmlFor="city">
            Localitate
          </label>
          <input
            id="city"
            name="city"
            className="input"
            defaultValue={client?.city ?? ""}
            placeholder="Cluj-Napoca sau Sector 3"
          />
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
            defaultValue={client?.email ?? ""}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div>
          <label className="label" htmlFor="phone">
            Telefon
          </label>
          <input
            id="phone"
            name="phone"
            className="input"
            defaultValue={client?.phone ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          {client &&
            (confirmingDelete ? (
              <span className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Renunta
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={remove}
                  disabled={pending}
                >
                  Confirm stergerea
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn-danger"
                onClick={() => setConfirmingDelete(true)}
                disabled={client.invoiceCount > 0}
                title={
                  client.invoiceCount > 0
                    ? "Clientul are facturi emise si nu poate fi sters"
                    : undefined
                }
              >
                Sterge
              </button>
            ))}
        </div>

        <button
          type="submit"
          className="btn-primary w-full sm:w-auto"
          disabled={pending}
        >
          {pending ? "Se salveaza..." : "Salveaza"}
        </button>
      </div>
    </form>
  );
}
