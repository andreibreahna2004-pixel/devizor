/**
 * Extrage indicatorul Iz — izolatii la constructii si instalatii — in
 * `data/norme-iz.json`.
 *
 *   node scripts/import-norme-iz.mjs <cale-pdf>
 *
 * Iz nu e tiparit ca tabel rotit, ca C si RpC, ci ca o carte obisnuita: codul
 * normei sta singur pe un rand, sub el codul de resursa, apoi denumirea, si in
 * final sectiunea "Cuprinde". De acolo luam denumirea, pina la "Cuprinde" sau
 * pina la urmatorul cod.
 *
 * Unitatea de masura e scrisa in proza ("Se masoara la metru patrat"), deci o
 * citim de acolo cind apare inainte de urmatoarea norma.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error("Foloseste: node scripts/import-norme-iz.mjs <cale-pdf>");
  process.exit(1);
}

const OUTPUT = new URL("../data/norme-iz.json", import.meta.url);

const CODE_LINE = /^IZ\s?([A-Z])\s?(\d{2})([A-Z])?$/;
const RESOURCE_LINE = /^\d{3}\s\d{3}\s\d{2}\s\d{2}\s\d{2}$/;
const STOP = /^(Cuprinde|Nu cuprinde|Se m[aă]soar[aă]|CANTIT|Norma|NOTA|Not[aă])/i;

/** Fraza din carte -> unitatea folosita in aplicatie. */
const UNITS = [
  [/metru\s*p[aă]trat|mp\b/i, "mp"],
  [/metru\s*cub|mc\b/i, "mc"],
  [/metru\s*liniar|metrul\s*liniar|ml\b/i, "ml"],
  [/kilogram|\bkg\b/i, "kg"],
  [/ton[aă]/i, "to"],
  [/bucat[aă]|buc\b/i, "buc"],
];

const doc = await getDocument({ url: source, useSystemFonts: true }).promise;

const lines = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const items = (await page.getTextContent()).items
    .filter((i) => i.str.trim())
    .map((i) => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));

  const rows = new Map();
  for (const item of items) {
    const key = Math.round(item.y / 3);
    rows.set(key, (rows.get(key) ?? []).concat(item));
  }

  for (const [, bucket] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
    const text = bucket
      .sort((a, b) => a.x - b.x)
      .map((i) => i.s)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push(text);
  }
}

const byCode = new Map();

for (let i = 0; i < lines.length; i++) {
  const match = CODE_LINE.exec(lines[i]);
  if (!match) continue;

  const [, capitol, numar, varianta] = match;
  const cod = `IZ ${capitol} ${numar}${varianta ?? ""}`;

  const parts = [];
  let um = null;

  for (let j = i + 1; j < lines.length && j < i + 40; j++) {
    const line = lines[j];
    if (CODE_LINE.test(line)) break;
    if (RESOURCE_LINE.test(line)) continue;

    if (STOP.test(line)) {
      // "Se masoara la ..." e singurul loc unde apare unitatea.
      if (/^Se m[aă]soar[aă]/i.test(line)) {
        um = UNITS.find(([pattern]) => pattern.test(line))?.[1] ?? null;
      }
      if (parts.length > 0) break;
      continue;
    }

    parts.push(line);
    if (parts.join(" ").length > 400) break;
  }

  const denumire = curata(parts.join(" "));
  if (!esteCurata(denumire)) continue;

  // Prima aparitie e cea din corpul cartii, cu textul complet.
  if (!byCode.has(cod)) byCode.set(cod, { cod, denumire, um });
}

/** Lipeste cuvintele taiate la capat de rand si scoate filigranul scanerului. */
function curata(text) {
  return text
    .replace(/\(?E Scann with OKEN Scann\)?/gi, " ")
    .replace(/([a-zăâîșşțţ])[-–]\s+([a-zăâîșşțţ])/g, "$1$2")
    .replace(/[.…]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Paginile scanate cu orientari amestecate ies ca o insiruire de cuvinte fara
 * sir. Nu incercam sa le reparam — o denumire stricata pe un deviz e mai rea
 * decat una lipsa — asa ca pastram doar ce arata a propozitie.
 */
function esteCurata(denumire) {
  if (denumire.length < 20 || denumire.length > 300) return false;
  // Prea multe cifre inseamna coduri de resurse amestecate in text.
  const cifre = (denumire.match(/\d/g) ?? []).length;
  if (cifre / denumire.length > 0.08) return false;
  // Titlurile de capitol si notele nu sint denumiri de norma.
  if (/CAPITOLUL|Generalit/i.test(denumire)) return false;
  // O denumire incepe cu o litera mare si un cuvint intreg.
  return /^[A-ZĂÂÎȘŞȚŢ][a-zăâîșşțţ]{2,}/.test(denumire);
}

const norme = [...byCode.values()].sort((a, b) => a.cod.localeCompare(b.cod));
writeFileSync(OUTPUT, `${JSON.stringify(norme, null, 1)}\n`, "utf8");

const capitole = new Map();
for (const n of norme) {
  const capitol = n.cod.slice(0, 4);
  capitole.set(capitol, (capitole.get(capitol) ?? 0) + 1);
}

console.log(`pagini citite: ${doc.numPages}`);
console.log(`norme scrise:  ${norme.length}`);
console.log(`cu unitate:    ${norme.filter((n) => n.um).length}`);
console.log(
  `capitole:      ${[...capitole.entries()].sort().map(([k, v]) => `${k}=${v}`).join(" ")}`,
);
