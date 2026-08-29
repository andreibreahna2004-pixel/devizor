import { MaterialsTabs } from "./materials-tabs";

/**
 * Antetul comun al celor doua pagini de materiale: preturile de referinta si
 * calculatorul de consumuri.
 */
export default function MaterialsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Materiale</h1>
        <MaterialsTabs />
      </div>
      {children}
    </div>
  );
}
