/**
 * Completeaza `data/norme-ts.json` din volumul I al indicatorului Ts.
 *
 *   node scripts/import-norme-ts.mjs <cale-pdf-volumul-1>
 *
 * Volumul I e tot o scanare, dar are strat de text, iar acolo codurile ies
 * curat: "TsC20" pe rand propriu, urmat de denumire. Diacriticele sint insa
 * stricate — octetii UTF-8 cititi ca CP1252 — si se refac inainte de orice.
 *
 * Ce e deja in fisier ramine neatins: capitolele transcrise de om din cealalta
 * editie sint mai curate decit ce scoate stratul de text.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error("Foloseste: node scripts/import-norme-ts.mjs <cale-pdf>");
  process.exit(1);
}

const OUTPUT = new URL("../data/norme-ts.json", import.meta.url);

const CODE_LINE = /^Ts\s?([A-J])\s?(\d{2})\s?([A-Z]\d?)?$/;
const STOP = /^(CAPITOLUL|Generalit|Spor la|Cuprinde|Se m[aă]soar[aă])/i;

/** "ă" a ajuns "Ä" pentru ca octetii UTF-8 au fost cititi ca CP1252. */
function demojibake(value) {
  if (!/[ÄÃĹĂ]/.test(value)) return value;
  const back = Buffer.from(value, "latin1").toString("utf8");
  return back.includes("�") ? value : back;
}

const doc = await getDocument({ url: source, useSystemFonts: true }).promise;

const lines = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const [, , width] = page.getViewport({ scale: 1 }).viewBox;
  const middle = width / 2;

  const items = (await page.getTextContent()).items
    .filter((i) => i.str.trim())
    .map((i) => ({
      x: i.transform[4],
      y: i.transform[5],
      s: demojibake(i.str.trim()),
    }));

  // Pagina are doua coloane; citite pe randuri s-ar amesteca intre ele.
  for (const keep of [(i) => i.x < middle, (i) => i.x >= middle]) {
    const rows = new Map();
    for (const item of items.filter(keep)) {
      const key = Math.round(item.y / 4);
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
}

const gasite = new Map();

for (let i = 0; i < lines.length; i++) {
  const match = CODE_LINE.exec(lines[i]);
  if (!match) continue;

  const [, capitol, numar, varianta] = match;
  const cod = `TS ${capitol} ${numar}${varianta ? ` ${varianta}` : ""}`;

  const parts = [];
  for (let j = i + 1; j < lines.length && j < i + 12; j++) {
    if (CODE_LINE.test(lines[j]) || STOP.test(lines[j])) break;
    parts.push(lines[j]);
    if (parts.join(" ").length > 260) break;
  }

  const denumire = parts
    .join(" ")
    // Numarul paginii din tabla de materii se lipeste la coada denumirii.
    .replace(/\s*\d{1,3}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (denumire.length < 25) continue;
  if (!/^[A-ZĂÂÎȘŞȚŢ][a-zăâîșşțţ]{2,}/.test(denumire)) continue;
  if (!gasite.has(cod)) gasite.set(cod, denumire);
}

const existente = JSON.parse(readFileSync(OUTPUT, "utf8"));
const codExistent = new Set(existente.map((n) => n.cod));

const adaugate = [...gasite.entries()]
  .filter(([cod]) => !codExistent.has(cod))
  .map(([cod, denumire]) => ({ cod, denumire, um: null }));

const toate = [...existente, ...adaugate].sort((a, b) => a.cod.localeCompare(b.cod));
writeFileSync(OUTPUT, `${JSON.stringify(toate, null, 1)}\n`, "utf8");

console.log(`pagini citite:  ${doc.numPages}`);
console.log(`gasite in PDF:  ${gasite.size}`);
console.log(`adaugate:       ${adaugate.length}`);
console.log(`total in fisier: ${toate.length}`);
