/**
 * Extrage lista de norme dintr-un indicator tiparit ca "LISTA INDICATOR" si o
 * scrie in `data/norme-<indicator>.json`.
 *
 * Merge pe indicatoarele care au acelasi asezare in pagina — C (lucrari de
 * constructii) si RpC (reparatii):
 *   node scripts/import-norme.mjs <cale-pdf> <indicator>
 *
 * Pagina PDF-ului e un tabel rotit 90 de grade: fiecare norma ocupa o banda
 * verticala de `x`, iar rolul unui text e dat de `y`:
 *   y ~  28    codul normei (CA01A1, RPCE20B1)
 *   y ~  89    denumirea
 *   y ~ 793    unitatea de masura
 *   y ~ 40-65  resursele (material / manopera / utilaj)
 *   y ~ 740-770 consumurile
 *
 * Se pastreaza doar codul, denumirea si unitatea: preturile si consumurile nu
 * au ce cauta in aplicatie, unde pretul il scrie omul pe linia de deviz.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { writeFileSync } from "node:fs";

/**
 * Cele doua indicatoare au aceeasi asezare in pagina, dar pe alte inaltimi, iar
 * exportul de RpC nu are deloc randul de unitati de masura.
 */
const INDICATORS = {
  // CA01A1, CZ0302B1 — doua litere, doua cifre, apoi variantele.
  c: {
    fisier: "norme-c.json",
    cod: /^[A-Z]{2}\d{2}[A-Z0-9]{1,4}$/,
    codY: [0, 40],
    numeY: [70, 700],
    umY: 780,
  },
  // RPCE20B1 — prefixul RPC, litera de capitol, apoi cifre si varianta.
  rpc: {
    fisier: "norme-rpc.json",
    cod: /^RPC[A-Z]\d{2}[A-Z0-9]{1,3}$/,
    codY: [45, 65],
    numeY: [95, 130],
    umY: null,
  },
};

const source = process.argv[2];
const which = (process.argv[3] ?? "c").toLowerCase();
const spec = INDICATORS[which];

if (!source || !spec) {
  console.error(
    `Foloseste: node scripts/import-norme.mjs <cale-pdf> <${Object.keys(INDICATORS).join("|")}>`,
  );
  process.exit(1);
}

const CODE_PATTERN = spec.cod;
const OUTPUT = new URL(`../data/${spec.fisier}`, import.meta.url);

const doc = await getDocument({ url: source, useSystemFonts: true }).promise;

const byCode = new Map();
let skipped = 0;

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const items = (await page.getTextContent()).items
    .filter((i) => i.str.trim())
    .map((i) => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));

  const starts = items
    .filter(
      (i) => i.y >= spec.codY[0] && i.y <= spec.codY[1] && CODE_PATTERN.test(i.s),
    )
    .sort((a, b) => a.x - b.x);

  for (const [index, start] of starts.entries()) {
    const next = starts[index + 1];
    const band = items.filter(
      (i) => i.x >= start.x - 1 && (next ? i.x < next.x - 1 : true),
    );

    const denumire = clean(
      band
        .filter((i) => i.y > spec.numeY[0] && i.y < spec.numeY[1])
        .sort((a, b) => a.x - b.x || b.y - a.y)
        .map((i) => i.s)
        .join(" "),
    );

    // Exportul de RpC nu are randul de unitati; acolo o pune omul pe linie.
    const rawUnit =
      spec.umY === null
        ? undefined
        : band.find((i) => i.y > spec.umY && Math.abs(i.x - start.x) < 2)?.s;
    const um = normalizeUnit(rawUnit);

    // Cateva randuri din sursa sunt stricate (erori de export din Excel).
    // Fara denumire, norma nu e de niciun folos.
    if (!denumire || denumire.startsWith("#")) {
      skipped += 1;
      continue;
    }

    if (!byCode.has(start.s)) byCode.set(start.s, { cod: start.s, denumire, um });
  }
}

const norme = [...byCode.values()].sort((a, b) => a.cod.localeCompare(b.cod));

writeFileSync(OUTPUT, `${JSON.stringify(norme, null, 1)}\n`, "utf8");

const chapters = new Map();
for (const norm of norme) {
  const prefix = norm.cod.slice(0, 2);
  chapters.set(prefix, (chapters.get(prefix) ?? 0) + 1);
}

console.log(`pagini citite: ${doc.numPages}`);
console.log(`norme scrise:  ${norme.length} (sarite: ${skipped})`);
console.log(
  `capitole:      ${[...chapters.entries()].sort().map(([k, v]) => `${k}=${v}`).join(" ")}`,
);

/** Sufixul "~" marcheaza in sursa o denumire taiata la marginea coloanei. */
function clean(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*~\s*$/, "")
    .replace(/\s*~\s*/g, " ")
    .trim();
}

/** Cateva norme au unitatea exportata ca "0"; le lasam fara, o pune omul. */
function normalizeUnit(value) {
  if (!value || value === "0") return null;
  return value.replace(/\s+/g, " ").trim();
}
