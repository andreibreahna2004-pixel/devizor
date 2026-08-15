"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProject, saveProject } from "@/app/actions/records";
import { FieldError, FormError } from "@/components/form-feedback";
import { COUNTIES } from "@/lib/counties";
import { formatLei } from "@/lib/money";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  countyCode: string | null;
  clientId: string | null;
  clientName: string | null;
  estimateCount: number;
  invoiceCount: number;
  estimatedValue: number;
}

export function ProjectList({
  projects,
  clients,
}: {
  projects: ProjectRow[];
  clients: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<ProjectRow | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          onClick={() => setEditing("new")}
        >
          Proiect nou
        </button>
      </div>

      {editing && (
        <ProjectForm
          project={editing === "new" ? null : editing}
          clients={clients}
          onClose={() => setEditing(null)}
        />
      )}

      {projects.length === 0 ? (
        <div className="card p-8 text-center sm:p-12">
          <p className="text-sm text-ink-500">Niciun proiect inregistrat.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <div key={project.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-ink-900">{project.name}</h2>
                  {project.clientName && (
                    <p className="mt-0.5 text-sm text-ink-500">{project.clientName}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="link shrink-0 text-sm"
                  onClick={() => setEditing(project)}
                >
                  Editeaza
                </button>
              </div>

              {(project.address || project.city) && (
                <p className="mt-2 text-sm text-ink-600">
                  {[project.address, project.city].filter(Boolean).join(", ")}
                </p>
              )}

              {project.description && (
                <p className="mt-1.5 text-sm text-ink-500">{project.description}</p>
              )}

              <dl className="mt-4 flex gap-6 border-t border-[var(--border)] pt-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-500">Devize</dt>
                  <dd className="tabular font-medium text-ink-900">
                    {project.estimateCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Facturi</dt>
                  <dd className="tabular font-medium text-ink-900">
                    {project.invoiceCount}
                  </dd>
                </div>
                <div className="ml-auto text-right">
                  <dt className="text-xs text-ink-500">Valoare devize</dt>
                  <dd className="tabular font-medium text-ink-900">
                    {formatLei(project.estimatedValue)} lei
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectForm({
  project,
  clients,
  onClose,
}: {
  project: ProjectRow | null;
  clients: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveProject(formData);
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
    if (!project) return;
    startTransition(async () => {
      const result = await deleteProject(project.id);
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
      <input type="hidden" name="id" value={project?.id ?? ""} />

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink-900">
          {project ? `Editeaza ${project.name}` : "Proiect nou"}
        </h2>
        <button type="button" onClick={onClose} className="btn-ghost">
          Inchide
        </button>
      </div>

      <FormError message={error ?? undefined} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Denumire
          </label>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={project?.name ?? ""}
            placeholder="Casa P+1 Floresti"
            required
          />
          <FieldError message={fieldErrors.name} />
        </div>

        <div>
          <label className="label" htmlFor="clientId">
            Beneficiar
          </label>
          <select
            id="clientId"
            name="clientId"
            className="input"
            defaultValue={project?.clientId ?? ""}
          >
            <option value="">—</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            Descriere
          </label>
          <input
            id="description"
            name="description"
            className="input"
            defaultValue={project?.description ?? ""}
            placeholder="Locuinta unifamiliala, amprenta 120 mp"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">
            Adresa santierului
          </label>
          <input
            id="address"
            name="address"
            className="input"
            defaultValue={project?.address ?? ""}
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
            defaultValue={project?.countyCode ?? ""}
          >
            <option value="">—</option>
            {COUNTIES.map((county) => (
              <option key={county.code} value={county.code}>
                {county.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="city">
            Localitate
          </label>
          <input
            id="city"
            name="city"
            className="input"
            defaultValue={project?.city ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          {project &&
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
