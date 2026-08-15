import type {
  EstimateStatus,
  InvoiceStatus,
  ProgressStatus,
} from "@prisma/client";

const ESTIMATE_STYLES: Record<EstimateStatus, { label: string; className: string }> = {
  CIORNA: { label: "Ciorna", className: "bg-ink-100 text-ink-700" },
  TRIMIS: { label: "Trimis", className: "bg-blue-50 text-blue-800" },
  ACCEPTAT: { label: "Acceptat", className: "bg-emerald-50 text-emerald-800" },
  RESPINS: { label: "Respins", className: "bg-red-50 text-red-800" },
  ANULAT: { label: "Anulat", className: "bg-ink-100 text-ink-500 line-through" },
};

const INVOICE_STYLES: Record<InvoiceStatus, { label: string; className: string }> = {
  CIORNA: { label: "Ciorna", className: "bg-ink-100 text-ink-700" },
  EMISA: { label: "Emisa", className: "bg-blue-50 text-blue-800" },
  TRIMISA: { label: "Trimisa", className: "bg-indigo-50 text-indigo-800" },
  PLATITA: { label: "Platita", className: "bg-emerald-50 text-emerald-800" },
  STORNATA: { label: "Stornata", className: "bg-amber-50 text-amber-900" },
  ANULATA: { label: "Anulata", className: "bg-ink-100 text-ink-500 line-through" },
};

const PROGRESS_STYLES: Record<ProgressStatus, { label: string; className: string }> = {
  CIORNA: { label: "Ciorna", className: "bg-ink-100 text-ink-700" },
  APROBATA: { label: "Aprobata", className: "bg-blue-50 text-blue-800" },
  FACTURATA: { label: "Facturata", className: "bg-emerald-50 text-emerald-800" },
};

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  const style = ESTIMATE_STYLES[status];
  return <span className={`badge ${style.className}`}>{style.label}</span>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const style = INVOICE_STYLES[status];
  return <span className={`badge ${style.className}`}>{style.label}</span>;
}

export function ProgressStatusBadge({ status }: { status: ProgressStatus }) {
  const style = PROGRESS_STYLES[status];
  return <span className={`badge ${style.className}`}>{style.label}</span>;
}

/** Nivelul de incredere pe care AI-ul l-a atasat unei linii propuse. */
export function ConfidenceBadge({
  confidence,
}: {
  confidence: "MARE" | "MEDIE" | "MICA" | null;
}) {
  if (!confidence) return null;

  const styles = {
    MARE: { label: "incredere mare", className: "bg-emerald-50 text-emerald-800" },
    MEDIE: { label: "de verificat", className: "bg-amber-50 text-amber-900" },
    MICA: { label: "verifica atent", className: "bg-red-50 text-red-800" },
  } as const;

  const style = styles[confidence];
  return <span className={`badge ${style.className}`}>{style.label}</span>;
}
