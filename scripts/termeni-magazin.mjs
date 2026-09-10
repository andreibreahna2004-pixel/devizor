// Prima trecere pentru `data/termeni-magazin.json`.
//
// Denumirile din `data/consumuri.json` sunt scrise pentru o comanda de materiale,
// nu pentru caseta de cautare a unui magazin: "Caramida cu goluri 25x25x23" nu
// gaseste nimic la Hornbach, iar "Apa" sau "Beton C20/25" nu sunt marfa de
// bricolaj. Fisierul de termeni e puntea: ce se scrie in cautare, pe ce unitate
// se asteapta pretul, si care retete sunt servite de el.
//
// Scriptul rezolva `retete` din date, ca legatura deviz -> reteta -> termen sa nu
// fie scrisa de mana si sa nu poata rugini. Restul, adica ce intra, cum se numeste si pe
// ce unitate, e curatare de om, in tabelul de mai jos.
//
// Se ruleaza o singura data:  node scripts/termeni-magazin.mjs
// Refuza sa scrie peste un fisier existent, ca sa nu stearga editari de om.
// Dupa asta, fisierul se editeaza direct; scriptul rimine ca sa se vada de unde
// a plecat.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const IESIRE = "data/termeni-magazin.json";

// Materialul din reteta -> ce se cere la magazin.
//
// Cheia e `denumire|um` din consumuri.json. `t` e termenul de cautat, `u` e
// unitatea pe care o coteaza magazinul, care nu e mereu cea a retetei: silicon e
// socotit in ml de tub in reteta si se vinde la bucata.
const TERMENI = {
  // --- Infrastructura si beton ---
  "Ciment|kg": { t: "ciment", u: "sac" },
  "Nisip 0-4 mm|kg": { t: "nisip", u: "sac" },
  "Pietris 4-16 mm|kg": { t: "pietris", u: "sac" },
  "Otel beton|kg": { t: "otel beton", u: "buc" },
  "Plasa sudata|mp": { t: "plasa sudata", u: "buc" },
  "Geotextil|mp": { t: "geotextil", u: "mp" },
  "Membrana bituminoasa|mp": { t: "membrana bituminoasa", u: "rola" },
  "Amorsa bituminoasa|l": { t: "amorsa bituminoasa", u: "buc" },
  "Decofrol|l": { t: "decofrol", u: "buc" },
  "Placaj de cofrare 18 mm|mp": { t: "placaj cofraj", u: "buc" },
  "Tub de drenaj riflat 110 mm|ml": { t: "tub drenaj", u: "ml" },
  "Distantieri armatura|buc": { t: "distantieri armatura", u: "buc" },
  "Sarma neagra pentru legat|kg": { t: "sarma neagra", u: "buc" },
  "Cuie|kg": { t: "cuie", u: "kg" },

  // --- Zidarii ---
  "Blocuri BCA 10 cm|buc": { t: "bca 10", u: "buc" },
  "Blocuri BCA 15 cm|buc": { t: "bca 15", u: "buc" },
  "Blocuri BCA 20 cm|buc": { t: "bca 20", u: "buc" },
  "Blocuri BCA 25 cm|buc": { t: "bca 25", u: "buc" },
  "Blocuri BCA 30 cm|buc": { t: "bca 30", u: "buc" },
  "Caramida cu goluri 25x25x23|buc": { t: "caramida cu goluri", u: "buc" },
  "Caramida plina 240x115x63|buc": { t: "caramida plina", u: "buc" },
  "Mortar pentru zidarie BCA|kg": { t: "mortar zidarie bca", u: "sac" },
  "Mortar pentru zidarie|kg": { t: "mortar zidarie", u: "sac" },
  "Adeziv pentru rosturi subtiri|kg": { t: "adeziv rosturi subtiri", u: "sac" },
  "Var pasta|kg": { t: "var pasta", u: "buc" },

  // --- Acoperis ---
  "Tigla ceramica|buc": { t: "tigla ceramica", u: "buc" },
  "Tigla metalica|mp": { t: "tigla metalica", u: "mp" },
  "Sindrila bituminoasa|mp": { t: "sindrila bituminoasa", u: "mp" },
  "Placa OSB 18 mm|mp": { t: "osb 18", u: "buc" },
  "Folie anticondens|mp": { t: "folie anticondens", u: "rola" },
  "Jgheab|ml": { t: "jgheab", u: "buc" },
  "Burlan|ml": { t: "burlan", u: "buc" },
  "Sipca 30x50|ml": { t: "sipca", u: "buc" },
  "Suruburi autoforante|buc": { t: "suruburi autoforante", u: "cutie" },
  "Solutie ignifuga si antifungica|l": { t: "solutie ignifuga lemn", u: "buc" },
  "Mastic bituminos|kg": { t: "mastic bituminos", u: "buc" },

  // --- Termoizolatii ---
  "Polistiren expandat EPS 5 cm|mp": { t: "polistiren expandat 5", u: "mp" },
  "Polistiren expandat EPS 10 cm|mp": { t: "polistiren expandat 10", u: "mp" },
  "Polistiren expandat EPS 15 cm|mp": { t: "polistiren expandat 15", u: "mp" },
  "Polistiren extrudat XPS|mp": { t: "polistiren extrudat", u: "mp" },
  "Vata bazaltica de fatada|mp": { t: "vata bazaltica fatada", u: "mp" },
  "Vata minerala 5 cm|mp": { t: "vata minerala 5", u: "mp" },
  "Vata minerala in rulou|mp": { t: "vata minerala rulou", u: "rola" },
  "Adeziv pentru lipire|kg": { t: "adeziv polistiren", u: "sac" },
  "Masa de spaclu|kg": { t: "masa de spaclu", u: "sac" },
  "Plasa din fibra de sticla|mp": { t: "plasa fibra sticla", u: "rola" },
  "Dibluri cu cui metalic|buc": { t: "dibluri termoizolatie", u: "cutie" },
  "Coltare cu plasa|ml": { t: "coltar cu plasa", u: "buc" },
  "Amorsa|l": { t: "amorsa", u: "buc" },
  "Amorsa pigmentata|l": { t: "amorsa pigmentata", u: "buc" },
  "Tencuiala decorativa|kg": { t: "tencuiala decorativa", u: "buc" },
  "Tencuiala mozaicata|kg": { t: "tencuiala mozaicata", u: "buc" },

  // --- Hidroizolatii ---
  "Folie PE|mp": { t: "folie pe", u: "rola" },
  "Hidroizolatie lichida|kg": { t: "hidroizolatie lichida", u: "buc" },
  "Mortar de hidroizolare|kg": { t: "mortar hidroizolant", u: "sac" },
  "Banda de etansare la colturi|ml": { t: "banda etansare colturi", u: "buc" },
  "Silicon sau poliuretan|ml tub": { t: "silicon sanitar", u: "buc" },

  // --- Tencuieli si gleturi ---
  "Mortar de tencuit|kg": { t: "mortar tencuit", u: "sac" },
  "Mortar de tencuit exterior|kg": { t: "mortar tencuit exterior", u: "sac" },
  "Glet de ipsos|kg": { t: "glet ipsos", u: "sac" },
  "Glet vinilic gata preparat|kg": { t: "glet vinilic", u: "buc" },
  "Tencuiala de ipsos|kg": { t: "tencuiala ipsos", u: "sac" },
  "Mortar de reparatii|kg": { t: "mortar reparatii", u: "sac" },
  "Plasa de rabit|mp": { t: "plasa rabit", u: "buc" },
  "Coltare de protectie|ml": { t: "coltar tencuiala", u: "buc" },
  "Hirtie abraziva|buc": { t: "hirtie abraziva", u: "buc" },

  // --- Pardoseli ---
  "Parchet laminat|mp": { t: "parchet laminat", u: "mp" },
  "Parchet masiv|mp": { t: "parchet masiv", u: "mp" },
  "Placi de gresie|mp": { t: "gresie", u: "mp" },
  "Placi de piatra|mp": { t: "placi piatra", u: "mp" },
  "Covor PVC|mp": { t: "covor pvc", u: "mp" },
  "Mocheta|mp": { t: "mocheta", u: "mp" },
  "Adeziv pentru gresie|kg": { t: "adeziv gresie", u: "sac" },
  "Adeziv flexibil|kg": { t: "adeziv flexibil", u: "sac" },
  "Adeziv pentru parchet|kg": { t: "adeziv parchet", u: "buc" },
  "Chit de rosturi|kg": { t: "chit rosturi", u: "buc" },
  "Folie suport (spuma)|mp": { t: "folie suport parchet", u: "rola" },
  "Plinta lemn|ml": { t: "plinta lemn", u: "buc" },
  "Profile de trecere|ml": { t: "profil trecere", u: "buc" },
  "Nisip de cuart|kg": { t: "nisip cuart", u: "sac" },
  "Lac sau ulei|l": { t: "lac parchet", u: "buc" },
  "Impregnant de protectie|l": { t: "impregnant", u: "buc" },

  // --- Gips-carton si finisaje ---
  "Placa de gips-carton 12,5 mm|mp": { t: "gips carton 12,5", u: "buc" },
  "Placi de fibrogips|mp": { t: "fibrogips", u: "buc" },
  "Banda de armare rosturi|ml": { t: "banda armare rosturi", u: "buc" },
  "Glet pentru rosturi|kg": { t: "glet rosturi", u: "sac" },
  "Suruburi|buc": { t: "suruburi gips carton", u: "cutie" },
  "Banda perimetrala|ml": { t: "banda perimetrala", u: "rola" },
  "Vopsea de finisaj|l": { t: "vopsea lavabila", u: "buc" },
  "Grund anticoroziv|l": { t: "grund anticoroziv", u: "buc" },
};

// Ce nu se cere la magazinele astea, si de ce. Nu se scapa din vedere: intra in
// fisier cu `laMagazin: false`, ca interfata sa poata spune "nu se urmareste la
// magazine" in loc sa arate un agregat gol. Gol se citeste "n-am gasit azi";
// adevarul e "nu ne uitam acolo".
const FARA_MAGAZIN = {
  "Apa|l": "nu e marfa",
  "Beton C8/10|mc": "beton gata preparat, vine de la statie",
  "Beton C16/20|mc": "beton gata preparat, vine de la statie",
  "Beton C20/25|mc": "beton gata preparat, vine de la statie",
  "Beton de suprabetonare C20/25|mc": "beton gata preparat, vine de la statie",
  "Beton gata preparat|mc": "vine de la statie",
  "Balast|mc": "vrac, nu se vinde la bricolaj",
  "Nisip|mc": "vrac; la sac vezi termenul nisip",
  "Pietris 16-31 mm|mc": "vrac",
  "Pietris de drenaj|mc": "vrac",
  "Mortar de zidarie|mc": "vrac; la sac vezi mortar zidarie",
  "Piatra bruta|to": "vrac, la tona",
  "Mixtura asfaltica|kg": "de la statie de asfalt",
  "Predale prefabricate|mp": "prefabricat, pe comanda",
  "Buiandrug prefabricat|buc": "prefabricat, pe comanda",
  "Corpuri de umplutura|buc": "prefabricat, pe comanda",
};

const retete = JSON.parse(readFileSync("data/consumuri.json", "utf8"));

// Materialul -> retetele care il folosesc. De aici vine legatura cu devizul.
const serveste = new Map();
for (const r of retete) {
  for (const m of r.materiale) {
    const cheie = `${m.denumire}|${m.um}`;
    if (!serveste.has(cheie)) serveste.set(cheie, []);
    if (!serveste.get(cheie).includes(r.id)) serveste.get(cheie).push(r.id);
  }
}

const necunoscute = [];
const iesire = [];

for (const [cheie, { t, u }] of Object.entries(TERMENI)) {
  const ale = serveste.get(cheie);
  if (!ale) {
    necunoscute.push(cheie);
    continue;
  }
  iesire.push({ termen: t, um: u, material: cheie.split("|")[0], laMagazin: true, retete: ale });
}

for (const [cheie, motiv] of Object.entries(FARA_MAGAZIN)) {
  const ale = serveste.get(cheie);
  if (!ale) {
    necunoscute.push(cheie);
    continue;
  }
  iesire.push({
    termen: cheie.split("|")[0].toLowerCase(),
    um: cheie.split("|")[1],
    material: cheie.split("|")[0],
    laMagazin: false,
    motiv,
    retete: ale,
  });
}

if (necunoscute.length > 0) {
  console.error("Materiale care nu exista in consumuri.json:");
  for (const n of necunoscute) console.error(`  ${n}`);
  process.exitCode = 1;
  process.exit();
}

// Doi termeni identici ar face doua rinduri pe acelasi ecran si doua cereri la
// magazin pentru acelasi lucru.
const vazute = new Set();
for (const x of iesire) {
  const cheie = `${x.termen}|${x.um}`;
  if (vazute.has(cheie)) {
    console.error(`Termen dublu: ${cheie}`);
    process.exitCode = 1;
    process.exit();
  }
  vazute.add(cheie);
}

if (existsSync(IESIRE) && !process.argv.includes("--forteaza")) {
  console.error(`${IESIRE} exista deja. Se editeaza de mana de acum.`);
  console.error("Daca chiar vrei sa-l regenerezi si sa pierzi editarile: --forteaza");
  process.exitCode = 1;
  process.exit();
}

iesire.sort((a, b) => a.termen.localeCompare(b.termen, "ro"));
writeFileSync(IESIRE, JSON.stringify(iesire, null, 2) + "\n", "utf8");

const laMagazin = iesire.filter((x) => x.laMagazin).length;
console.log(`${IESIRE}: ${iesire.length} termeni, ${laMagazin} ceruti la magazin.`);
console.log(`retete acoperite: ${new Set(iesire.flatMap((x) => x.retete)).size} din ${retete.length}`);
