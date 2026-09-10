@AGENTS.md

# Devizor

Devize si facturi pentru firme de constructii din Romania. Omul descrie lucrarea
in cuvintele lui, aplicatia scoate devizul, iar din deviz ies factura si XML-ul
de e-Factura pentru SPV.

Documentele produse aici ajung la un beneficiar si la ANAF. O cifra gresita sau
un cod oficial inventat nu sint bug-uri de interfata — sint erori pe un act pe
care il semneaza cineva. Regulile de mai jos exista ca sa nu se intimple asta.

## Cele patru reguli care nu se incalca

**1. Pretul il scrie omul, pe linia de deviz.** Recapitulatia totalizeaza si atit:
nu exista cheltuieli indirecte, nu exista procent de profit, nu exista niciun
coeficient care se adauga peste pret. Nimic nu recalculeaza in spate o valoare pe
care a scris-o omul.

Exista un catalog de preturi de referinta (`lib/materials/`), si nu incalca regula
asta, pentru ca **e referinta, nu sursa**. Distinctia se tine cu trei conditii, si
toate trei trebuie sa ramina adevarate:

- nimic din catalog nu scrie singur intr-o linie — omul vede reperul si il accepta
  sau scrie altceva;
- o schimbare de pret in catalog **nu** atinge niciun deviz existent, nici macar
  unul in ciorna;
- fiecare reper isi arata provenienta: data observatiei, sursa, si daca e pretul
  judetului sau media pe tara.

Daca vreuna cade, catalogul devine a doua sursa de adevar pentru bani, si atunci
ceva e gresit in cerinta, nu in cod.

**2. Un singur motor de calcul.** `lib/pricing/calculator.ts` e folosit de
interfata, PDF, XML, situatii de lucrari si generatorul AI. Orice adunare de
bani trece pe acolo. Nu se recalculeaza totaluri "pe scurt" in alta parte.

**3. `orgId` vine numai din sesiune.** Niciodata din body, query string sau
formular. Fiecare query de business poarta `orgId`-ul intors de `requireUser()`.
Un id venit din browser (client, proiect, sectiune, linie) se verifica intii ca
apartine firmei din sesiune.

**4. Un document emis nu se modifica si nu se sterge.** Factura emisa se
storneaza printr-o nota de credit cu numar propriu. Numerele de document se
aloca atomic, in aceeasi tranzactie cu inserarea.

## Structura

```
app/
  (auth)/          login, inregistrare firma
  (app)/           devize, facturi, clienti, proiecte, setari
  actions/         server actions — zod + verificare de apartenenta
  api/
    ai/deviz               generare deviz nou, flux SSE
    devize/[id]/linii      adaugare din vorbire in deviz existent, SSE
    devize/[id]/pdf        un singur PDF, landscape
    facturi/[id]/{pdf,xml}
    cron/preturi           trecerea zilnica la magazine, pazita cu CRON_SECRET
components/
  charts/          sparkline (server) + graficul de evolutie (client)
  icons.tsx        setul de iconite, scrise de mina
  theme-toggle.tsx comutatorul deschis / intunecat
lib/
  ai/              prompt, unelte, bucla agentica, mapare apel -> linie
  charts/          trasee SVG si bucketare pe intervale — module pure, testate direct
  consum/          consumuri specifice: cit material intra intr-o lucrare
  dashboard/       agregarile de pe panou: serii, sparkline, activitate
  norme/           indicatoarele de norme: cautare, coduri, grupe
  pricing/         motorul de calcul — sursa unica de adevar pentru cifre
  estimates/       operatiile pe deviz
  progress/        situatii de lucrari, cantitati executate cumulat
  invoices/        emitere, storno, snapshot-uri; lines.ts — deviz -> factura, pur
  materials/       catalog de preturi: cautare, reper pe judet, import din API,
                   liste si direct de la magazin (scraper/); agregat.ts: reperul
                   de piata pe magazine, pur; termeni.ts: puntea reteta -> magazin;
                   zilnic.ts: trecerea zilnica marginita
  efactura/        generator UBL 2.1 + validator CIUS-RO
  pdf/             documente react-pdf — devizul landscape, factura portret
  numbering/       alocare numere, fara goluri
  auth.ts          sesiune JWT in cookie
  tenant.ts        requireUser, canManage — poarta spre orice date
  theme.ts         tema din localStorage + scriptul care o pune inainte de pictura
  money.ts         rotunjiri half-up
  money-db.ts      conversii spre Decimal
data/              norme-c.json, norme-rpc.json, norme-ts.json, consumuri.json,
                   termeni-magazin.json
scripts/           migrarea de la deploy, import indicatoare si preturi, seed demo
prisma/            schema, migrari, seed
```

## Modelul de date

Devizul e unul singur — nu exista moduri. `EstimateLine` tine **patru preturi
unitare**: `materialUnitPrice`, `laborUnitPrice`, `equipmentUnitPrice`,
`transportUnitPrice`. Asa e scris articolul intr-un deviz romanesc, si asa se
citeste recapitulatia.

Utilajul si transportul sint 0 pe majoritatea liniilor. Nu e o scapare: o
tencuiala manuala n-are utilaj imputat, iar transportul e de cele mai multe ori
deja in pretul materialului. Cine il scrie si acolo il face platit de doua ori.

Dintr-un deviz iese **o singura factura**, pe toata valoarea lui. `Invoice.scope`
si enum-ul `InvoiceScope` raman in schema doar pentru facturile emise inainte,
cind devizul se putea imparte pe materiale si manopera — un document emis nu se
modifica, nici macar o eticheta pe el. Tot ce se emite de acum poarta `TOT`.

`ProgressLine` pastreaza aceleasi patru componente, ca recapitulatia unei situatii
de lucrari sa se citeasca la fel cu cea a devizului din care vine.

**`Estimate.mode` si `Organization.defaultMode` mai exista in baza, dar nu in
schema si nu in cod.** Migrarea care a scos modul e doar de expandare: sterge
coloanele intr-o migrare ulterioara, dupa ce codul nou e live peste tot. Altfel ar
disparea sub codul vechi, care inca le citeste in fereastra dintre migrare si
promovarea noii versiuni. Amindoua au `NOT NULL DEFAULT 'COMBINAT'`, deci
inserarile de azi, care nu le pomenesc, merg neschimbate.

Consecinta: `prisma migrate dev` raporteaza drift si vrea sa genereze exact
migrarea aceea de contractie. Nu e o eroare — e pasul care a fost aminat.

`Estimate.countyCode` tine judetul lucrarii, cod ISO 3166-2:RO. De el atirna
reperele de pret: manopera si materialele difera mult intre Bucuresti si Botosani.
Pina la el, judetul ales in formular ajungea in promptul AI si se pierdea.

`MaterialPrice` **creste, nu se rescrie.** Un import insereaza observatii noi, cu
data lor; nu suprascrie ultimul pret. Fara asta n-ar exista evolutie in timp, iar
un grafic desenat din presupuneri ar fi mai rau decit niciun grafic. Materialele
si preturile sint nationale, fara `orgId`, ca normele si cotele de TVA: piata e
aceeasi pentru toate firmele.

`LaborIndex` tine cit de scumpa e manopera intr-un judet fata de media pe tara.
Furnizorii nu vind manopera, deci nu exista pret de raft de citit; sursa e
statistica oficiala, iar reperul iese din inmultirea unui pret national cu
indicele judetului.

### Reguli de calcul

- Banii se tin in `Decimal`, niciodata in float. Preturi unitare cu 4 zecimale,
  totaluri cu 2.
- Valoarea unei linii e **suma componentelor rotunjite separat**, nu
  `cantitate × pret_total`. Asa se inchide recapitulatia: cele patru coloane
  totalizate dau exact totalul devizului.
- **Factura poate diferi de deviz cu citiva bani.** Devizul aduna componente
  rotunjite fiecare in parte; factura inmulteste cantitatea cu un pret unitar deja
  rotunjit la doi bani, pentru ca `cantitate × pret` trebuie sa dea exact valoarea
  liniei si in PDF si in XML. Diferenta e cunoscuta, testata in
  `lib/invoices/lines.test.ts`, si se accepta: actul trebuie sa se verifice cu el
  insusi la validatorul ANAF.
- TVA-ul pe factura se calculeaza **pe grupa de cota, din baza insumata** — nu
  prin adunarea TVA-ului de pe linii. E regula EN 16931 (BR-CO-17); insumarea
  liniilor deviaza cu un ban si factura e respinsa de validatorul ANAF.

## Indicatoarele de norme

4.570 de norme: **C** (constructii, 2.205), **RpC** (reparatii, 2.133), **Ts**
(terasamente, 232). Stau in fisiere JSON, nu in baza de date: sint liste
nationale, aceleasi pentru toate firmele, nu se editeaza si nu au `orgId`.

Cum se compune o norma — reteta, consumurile, normele locale, codificarea si
statutul legal (P 91/1-02, HG 907/2016, F3) — sta in
`.claude/skills/norma-deviz/`. Acolo scrie si ce nu poate produce aplicatia din
cauza ca nu tine consumuri: extrasele C6-C9 si formularul F3.

Din indicator se iau doar **codul, denumirea si unitatea**. Consumurile normate
nu intra in aplicatie: sint calibrate pentru tehnologia anilor '80, iar un consum
vechi inmultit cu un pret de azi da o cifra care pare riguroasa si nu e.

- `um` poate fi `null` (RpC si Ts nu au unitati in sursa). Codul care foloseste
  o norma trebuie sa trateze cazul, nu sa presupuna un sir.
- Cind o linie poarta un cod, **denumirea si unitatea vin din indicator**, nu de
  la model sau din formular. O denumire schimbata de om isi pierde codul.
- Un cod care nu exista in indicator **se arunca**; linia ramine scrisa liber. Un
  cod oficial fals e citit de beneficiar ca un angajament asupra a ce se executa.
- Lucrarile de azi (termosistem, tamplarie PVC, centrale termice, hidroizolatii)
  nu au norma. Linia fara cod e normala, nu o scapare.

### Cautarea

`searchNorme` face puntea peste felul in care sint scrise indicatoarele:
tiparite inainte de reforma ortografica din 1993, fara diacritice, in limbajul de
atunci. "stalpi" gaseste `STILPI`, "tamplarie" gaseste `TIMPLARIE`, "planseu"
gaseste `PLANSEE`.

Cautarea exacta ruleaza prima; forma trunchiata intra doar cind exacta nu
gaseste nimic, si numai la inceput de cuvint — altfel "stalp" ajunge "stal" si
prinde "inSTALatii". Daca modifici cautarea, verifica intii testele din
`lib/norme/index.test.ts`: sint scrise pe cazuri reale, nu pe sintetice.

### Provenienta datelor

Ce e greu de reconstituit si usor de stricat:

- `norme-c.json` si `norme-rpc.json` — automat, din PDF-uri cu text:
  `node scripts/import-norme.mjs <pdf> c|rpc`. Acelasi format, tabel rotit 90°,
  doar pe alte inaltimi in pagina.
- `norme-ts.json` — transcris de om din cartea scanata, completat automat din
  volumul I cu `scripts/import-norme-ts.mjs`. OCR-ul pe scanarea aceea citeste
  denumirile acceptabil dar greseste codurile (`TS A 01` devine `TS AQ`), asa ca
  **nu reintroduce OCR acolo**. Transcrierea are prioritate; stratul de text
  umple doar golurile.
- **Iz (izolatii) lipseste.** Stratul lui de text e corupt si paginile sint
  imagini JPEG2000 pe care pdfjs nu le decodeaza in Node. Pina apare alt
  exemplar, hidroizolatiile se scriu ca linii libere.

## Sursele de preturi

Catalogul se umple din trei feluri de surse, toate in spatele aceleiasi interfete
(`PriceSource` din `lib/materials/import.ts`): un API, o lista de preturi primita
de la furnizor, sau o cifra scrisa de om. Adaugarea unei surse noi inseamna un
adaptor care intoarce `PriceObservation[]` — restul lantului nu-i cunoaste forma.

**Transportul se injecteaza.** `createApiPriceSource` primeste `fetchImpl`, cu
`fetch`-ul global ca implicit. Fara asta, tot drumul — cerere, validare, mapare,
scriere — n-ar putea fi verificat decit lovind un server real, si intr-o
aplicatie unde cifra ajunge pe un act semnat asta inseamna neverificat. Testele
din `api-source.test.ts` ruleaza un API prefacut; cel adevarat doar se
substituie.

**Raspunsul se valideaza cu zod, ca si iesirea modelului.** Un raspuns de forma
gresita opreste importul cu `ApiSourceError`, nu il lasa sa scrie pe jumatate: un
catalog umplut partial arata pe ecran exact ca unul complet.

**Judetul necunoscut nu se pastreaza.** La materiale, observatia trece pe
national; la manopera, indicele se arunca. Un pret legat de o zona inexistenta ar
disparea din cautari, iar un indice pus pe alt cod ar ajusta preturi in dreptul
altcuiva.

Configurarea, in `.env` (formele exacte ale raspunsurilor sint in `.env.example`
si in antetul celor doua module):

```
PRETURI_API_URL / PRETURI_API_KEY / PRETURI_API_NUME     # materiale
MANOPERA_API_URL / MANOPERA_API_KEY / MANOPERA_API_NUME  # indicele de zona
```

Fara ele aplicatia merge intreaga, ca si fara `ANTHROPIC_API_KEY`: doar importul
automat e indisponibil. `priceApiFromEnv()` intoarce `null`, si asta se trateaza,
nu se arunca.

Importul se ruleaza cu:

```bash
npm run import:preturi              # aduce si scrie
npm run import:preturi -- --dry     # aduce si arata, fara sa scrie
```

Ruleaza cu `--conditions=react-server`, ca `demo:factura`, fiindca atinge module
marcate `server-only`.

**Materialele se adauga, indicii se inlocuiesc.** Un pret observat intr-o zi e un
fapt al zilei aceleia si ramine acolo; observatia identica adusa a doua oara nu se
mai scrie, ca un API care intoarce tot istoricul la fiecare rulare sa nu umple
tabelul cu copii ale aceleiasi masuratori. Indicele de manopera al unei perioade e
insa o statistica ce se revizuieste: perechea (judet, perioada) e unica in schema,
si valoarea corectata o inlocuieste pe cea provizorie. Doua randuri pe acelasi
trimestru ar fi doua adevaruri despre el.

### Preturi luate direct de la magazin

`lib/materials/scraper/` cere pagina de cautare a magazinului cind omul cauta un
material pe care catalogul nu-l are, sau il are invechit. `cautaMaterialeProaspete`
din `service.ts` ia decizia; ce se gaseste intra prin `importaObservatii`, deci
**fiecare cautare a unui om lasa in urma o masuratoare datata** si construieste
seria din care iese graficul. O cautare care doar ar afisa ce a gasit acum ar arata
un pret fara istorie.

**Nimic nu iese pe internet fara `SCRAPER_ACTIV=true`.** Pornirea e o decizie, nu
un efect secundar al unui deploy. Restul comenzilor (ritm, timeout, cache, TTL,
User-Agent) sint in `.env.example`.

Se poarta cuviincios, si fiecare parte are motivul ei: **citeste `robots.txt`**,
**tine ritm** intre cereri catre aceeasi origine, **se prezinta** cu un User-Agent
care spune cine e, si **tine cache** ca doi oameni care cauta "parchet" in acelasi
minut sa nu faca doua cereri identice.

**Purtarea fata de `robots.txt` e per magazin, si implicit se respecta.** Cimpul
`robots` din `ConfigSite`, plus `SCRAPER_IGNORA_ROBOTS` care il suprascrie fara
deploy. Orice magazin nou se respecta: nu se ignora nimic din inertie.

Astazi o singura exceptie, la **Dedeman**, luata in cunostinta de cauza. Singura
cale de cautare care functioneaza (`/ro/catalogsearch/result/?q=`) e interzisa in
`robots.txt`-ul lor, dar regula e boilerplate de Magento, pusa ca paginile de
rezultate sa nu intre in indexul Google (igiena de SEO, continut duplicat), si
apare neschimbata in orice Magento needitat. Nu e o pozitie anti-scraping scrisa
de Dedeman. Fisierul se cere oricum, si se scrie in log peste ce regula s-a trecut:
o hotarire luata trebuie sa se vada.

**Ce nu se face, si nu se adauga:** nimic care sa infranga o blocare. Nu se
deghizeaza User-Agent-ul in browser, nu se rotesc identitati sau IP-uri, si nu se
reia o cerere respinsa de pe alta adresa. A nu citi un fisier de convenție e o
hotarire de risc pe deploy-ul tau; a te da drept altcineva ca sa treci de un zid e
altceva. Cind un magazin blocheaza, **acela e raspunsul** si catalogul cade pe ce
are. Vezi paragraful urmator.

**Cind magazinul nu raspunde, pagina se afiseaza oricum**, cu ce e in catalog.
Verificat pe server real: cerere respinsa, pagina 200. O cautare de materiale nu e
locul unde sa cada aplicatia din cauza unui site strain.

**Extractorul are doua straturi**, in ordinea increderii: **JSON-LD**
(`schema.org/Product`), pe care magazinele il pun pentru Google si care
supravietuieste unui redesign, si abia apoi selectoare CSS. Pretul vechi, taiat, se
**sterge din card** inainte de citirea celui curent — la un parchet redus scrie
57,90 linga 67,91, iar cel taiat ar intra in catalog ca un pret care nu se mai
practica.

**Un produs cotat pe doua baze da doua observatii.** La Hornbach acelasi parchet
arata pret pe mp si pret pe pachet. Se iau amindoua, fiecare cu unitatea ei, si
ajung materiale diferite in catalog: sunt doua cotatii adevarate ale aceluiasi bun.
Alegerea uneia era un accident de ordine, si putea pune pretul pachetului in
coloana lei/mp.

**`observedAt` e normalizat pe inceputul zilei.** Cu marca la milisecunda, acelasi
produs la acelasi pret, citit de doua ori intr-o zi, intra de doua ori, fiindca
marca difera, si la o rulare zilnica plus cautarile oamenilor ies mii de rinduri care nu
spun nimic nou. Normalizat, cheia de duplicat face ce spune comentariul de la ea:
un pret pe produs pe zi. Si e mai adevarat asa: un pret de raft e un fapt al zilei
aceleia. `supplier` intra si el in cheie, altfel doua magazine cu acelasi pret in
aceeasi zi s-ar prabusi intr-un singur rind si defalcarea pe magazin ar pierde unul.

**Selectoarele sint de confirmat, la toate patru.** Mediul in care s-a scris codul
nu vede paginile, deci sunt scrise pe tipare uzuale. Se corecteaza cu
`npm run proba:furnizor -- hornbach parchet` (sau `toate`), care arata ce s-a
extras, din ce strat si pe ce unitati; cu `--salveaza` pune pagina in `fixtures/`,
ca testele sa se scrie pe HTML adevarat. Starea de acum, verificata cerind
paginile:

| Magazin | Stare |
|---|---|
| Hornbach | `/s/<termen>` merge, produse randate pe server, `robots.txt` nu se opune |
| Dedeman | `/ro/catalogsearch/result/?q=` merge; `/ro/cauta` dadea 404 |
| Leroy Merlin | 403 pe tot site-ul dintr-un IP din afara; de probat din mediul de deploy |
| Brico | `brico.ro`, **nu** `bricostore.ro`; calea de cautare e de aflat |

**Pretul de la magazinul online e national.** Judetul ales schimba disponibilitatea
si magazinul, nu cifra, deci observatiile intra cu `countyCode` null — de aceea
`reperPentruJudet` are rezerva nationala, aratata ca atare. Nu se inventeaza o
dimensiune pe judet care nu exista in sursa.

**Calea sanctionata ramine feed-ul de afiliere** (2Performant), care da preturile
cu acordul magazinului. Intra pe aceeasi interfata `PriceSource`, deci trecerea la
el nu rescrie nimic.

### Reperul de piata, si de ce nu se stocheaza

`lib/materials/agregat.ts` intoarce, pentru un fel de material, cit cere piata:
mediana, intervalul, defalcarea pe magazin. Modul pur, fara Prisma si fara retea.

**Nu e pretul unui produs, si nu poate fi.** Magazinele nu vind acelasi articol:
la o cautare de parchet, Dedeman scoate un laminat la 87,89 lei/mp si Hornbach un
triplustratificat la 209. Media lor, 148, nu descrie nimic. Si nu se poate lega
altfel: in HTML-ul listelor nu exista EAN, iar marfa care umple un deviz e in buna
parte marca proprie a magazinului, deci de multe ori nu exista produs comun de
identificat. Ce iese e un **interval de piata pentru un fel de material, pe o
unitate, la magazinele astea, in fereastra asta**.

- **Mediana, nu media**, si **cite un vot pe magazin**, nu pe observatie. Un
  magazin cu douazeci de rezultate si altul cu doua ar face ca "media pe patru
  magazine" sa fie media pe unul. Si media nu rezista la un rind citit greșit:
  `parseNumar` avertizeaza in propriul antet ca o eroare de factor 1000 trece
  neobservata.
- **Unitatile se filtreaza, nu se convertesc.** O conversie lei/pachet -> lei/mp ar
  cere cit acopera pachetul, care e pe fiecare articol si nu se citeste de
  incredere. Ce nu se potriveste se numara si se spune, in `altaUnitate`.
- **Cifra nu apare niciodata singura.** Interfata arata intervalul, cite magazine
  au dat un pret, si vechimea celui mai vechi element; sub doua magazine scrie
  raspicat ca e un pret, nu o piata; peste `PRAG_IMPRASTIERE` conduce cu intervalul.
  `imprastiereMare` si `nrMagazine` sunt in tip anume: sunt contract, nu podoaba.
- **Nu se stocheaza nicio medie.** Ar fi un numar de bani derivat, cu ciclu de viata
  propriu, si fara `observedAt` al lui: ca sa ramina cinstit ar trebui sa duca cu el
  care magazine si ce fereastra l-au facut, adica sa stocheze din nou eșantionul.
  Eșantionul e deja in `MaterialPrice`. Calculat la citire, orice zi din trecut se
  poate reface exact.

Si nu trece prin `lib/pricing/calculator.ts`: regula 2 e despre adunarea banilor pe
un document, iar aici nu se aduna nimic si nu iese niciun total.

### De la deviz la magazin

O linie de deviz numeste o lucrare, nu un produs, si `EstimateLine` n-are nicio
legatura cu `Material`. Drumul trece prin retete:

```
descrierea lucrarii -> cautaRetete -> reteta -> termenii ei -> magazine
```

`data/termeni-magazin.json` (`lib/materials/termeni.ts`) e puntea: ce se scrie in
caseta de cautare, pe ce unitate se asteapta pretul, si care retete sunt servite.
106 termeni, 90 ceruti la magazin, 97 din cele 131 de retete acoperite. Prima
trecere a fost facuta cu `scripts/termeni-magazin.mjs`; de acum fisierul se editeaza
de mina, iar scriptul refuza sa scrie peste el.

Doua lucruri care par ocolisuri si nu sint:

- **Denumirile din `consumuri.json` nu se caută direct.** Sunt scrise pentru o
  comanda de materiale: "Caramida cu goluri 25x25x23" nu gaseste nimic la Hornbach.
  Trunchierea automata la primele cuvinte ar fi o presupunere, si presupunerile n-au
  ce cauta in lista care hotaraste ce se pune la pret.
- **`Material.name` nu e sursa de termeni.** Fiecare produs citit de la magazin
  creeaza un rind in `Material`, deci tabelul ca sursa ar fi o bucla care creste
  singura.

`laMagazin: false` nu e o omisiune, e un raspuns: betonul gata preparat vine de la
statie, balastul se ia vrac, apa nu e marfa. Interfata scrie "nu se urmareste la
magazinele astea", nu arata un agregat gol: gol se citeste "n-am gasit azi".

### Rularea zilnica

`lib/materials/zilnic.ts`, cu doi apelanti peste acelasi modul:
`npm run preturi:zilnic` si `/api/cron/preturi` (programul in `vercel.json`).

**Marginita, si de aia reluabila.** Se iau cei mai vechi termeni, citi incap in
buget; restul rimin pe maine, cind vor fi cei mai vechi si vor urca singuri.
**Nu exista cursor si nu exista tabel de progres**: vechimea sta in
`MaterialPrice.observedAt`, care exista oricum. O rulare care cade la jumatate nu
lasa nimic de reparat. Cine adauga un `ScanRun` adauga si un al doilea adevar
despre ce s-a facut.

**Termenii merg unul dupa altul, magazinele in paralel.** Nu din comoditate:
limitatorul de ritm din `fetcher.ts` citeste marca ultimei cereri si o rescrie de
partea cealalta a unui `await`, deci doua cereri concurente **catre aceeasi
origine** ocolesc pauza. Structura de acum tine o singura cerere in aer pe origine.
Cine paralelizeaza termenii sparge ritmul fara ca nimic sa se vada.

Ruta de cron e **pazita cu `CRON_SECRET`**; fara secretul setat raspunde 404 si nu
exista. Porneste cereri catre site-uri strine de pe serverul nostru, deci
nepazita ar face-o oricine. Cod de eroare numai la cadere totala: o trecere in care
trei magazine au mers e o reusita, si daca ar da 1, cine citeste mailul de cron
s-ar invata sa-l ignore.

```bash
npm run preturi:zilnic -- --plan      # arata planul si bugetul, FARA retea
npm run preturi:zilnic -- --dry       # cere paginile, arata, nu scrie
npm run preturi:zilnic -- --termeni=5
```

`--plan` si `--dry` nu sunt acelasi lucru: `--plan` nu atinge internetul, deci cu el
se reglează bugetul fara sa coste nimic magazinele.

## Consumurile specifice

`lib/consum/` raspunde la alta intrebare decit devizul: nu cit costa lucrarea, ci
**cit material cumperi ca s-o faci**. 131 de lucrari, 440 de rinduri de material,
in `data/consumuri.json`.

Pare ca ar incalca hotarirea de a nu tine consumuri (vezi indicatoarele mai sus),
si nu o incalca, din doua motive care trebuie tinute amindoua:

- **sursa** — fise tehnice de producator si practica de azi, nu consumurile din
  1981, calibrate pe tehnologia de atunci;
- **la ce serveste** — o cantitate de comanda, nu un pret. Nu produce niciun leu
  si nu scrie in nicio linie de deviz, deci regula 1 ramine neatinsa.

Datele stau in fisier, ca indicatoarele: sint nationale si nu se schimba de la o
zi la alta, iar in git se vede cine a schimbat o cifra si cind — ceea ce la niste
numere care ajung intr-o comanda de materiale conteaza mai mult decit editarea
din aplicatie.

**Un consum nu e un numar.** Are trei forme, si toate trei apar in date:

- fix pe unitatea lucrarii — plasa de fibra, 1,10 mp/mp, unde restul e petrecerea;
- **pe milimetru de grosime** — mortare, sape, mase de spaclu. Aici e capcana:
  cine tine doar "kg/mp" ori minte la 5 mm, ori minte la 20;
- pe varianta — adezivul de gresie, 2-3 kg/mp la placi mici si 6-8 la placi mari.

**Fiecare cifra e un interval si isi spune sursa.** Cimpul `sursa` e fie un URL,
fie eticheta `practica curenta`, si interfata le arata diferit. Un interval din
practica, spus ca atare, e util; acelasi interval prezentat ca fisa tehnica ar fi
o minciuna mica si greu de prins. Testul de integritate din
`lib/consum/index.test.ts` refuza un material fara sursa.

**Ambalajele se rotunjesc in sus.** Nimeni nu cumpara 137 kg de adeziv; cumpara
6 saci de 25. Rotunjirea la cel mai apropiat ar trimite omul pe santier cu un sac
lipsa.

**Fiecare reteta poarta si vocabularul de santier**, in `sinonime`: "rigips"
pentru gips-carton, "termopan" pentru timplarie PVC, "mana de spaclu" pentru masa
de spaclu. E aceeasi punte pe care `searchNorme` o face peste ortografia de
dinainte de 1993, doar ca aici e de vocabular. Termenii intra in cautare si se
scriu pe card, sub titlu.

Cautarea **ordoneaza** rezultatele dupa unde s-a potrivit cuvintul — denumire 50,
sinonim 40, material 20, categorie 5, plus 100 cind denumirea incepe cu toata
interogarea. Fara ordonare, "gips carton" scotea intii faianta, care doar imparte
capitolul cu peretii de rigips. Cuvintele de legatura se arunca inainte de
potrivire: "de" se regaseste in "decorative" si strica ordinea la "mana de
spaclu".

## AI

AI-ul propune, omul semneaza. Nimic generat nu se emite automat.

- Uneltele si iesirea modelului se valideaza cu zod. Ce nu trece nu produce
  linie; modelul afla prin `tool_result` ce a gresit.
- Preturile propuse sint repere de piata, marcate neverificate pina cind cineva
  atinge linia.
- `lib/ai/map-tool-output.ts` e pur, fara acces la baza de date sau retea. Acolo
  se decide ce ajunge in fata omului, deci se testeaza direct.
- Promptul si uneltele stau in blocuri stabile, cu un singur breakpoint de cache;
  descrierea lucrarii vine dupa, in `messages`, ca sa nu invalideze cache-ul.
- Fara `ANTHROPIC_API_KEY` aplicatia merge integral — doar generarea e
  dezactivata. Nu introduce dependente care cad fara cheie.
- Modelul se scrie o singura data, in `AI_MODEL` din `lib/ai/client.ts`. De acolo
  il ia si apelul, si coloana `model` din `AiRun`. Un literal copiat in ruta ar
  ramine in urma la prima schimbare si ar minti tocmai in tabelul de audit.

## Interfata

**Temele nu se scriu cu `dark:`.** Paleta trece prin `@theme inline`, deci
utilitarele Tailwind compileaza direct in `var(--ink-700)`. O culoare se schimba
o data, in `app/globals.css`, si se schimba peste tot. Cine pune o varianta
`dark:` pe un element a ocolit sistemul.

Fiecare treapta isi pastreaza **rolul**, nu luminozitatea: `brand-600` e fundal
de buton si ramine saturat in ambele teme, `brand-700` e text de link si devine
deschis pe intuneric, `brand-50` e fundal de accent si devine inchis. Scara
intunecata nu e inversul celei deschise. Inainte sa adaugi o treapta, uita-te
unde e folosita: ca text sau ca fundal.

Familiile `emerald / red / amber / blue` sint redefinite tot acolo: in aplicatie
nu sint culori, ci stari — reusit, refuzat, de verificat, in lucru.

**Doua fonturi, cu roluri separate.** Poppins pe titluri si navigatie, Inter pe
text de lucru si pe **orice cifra**. Poppins are cifre proportionale: intr-o
coloana de sume, un "1" ocupa mai putin decit un "8" si cifrele nu se mai
aliniaza pe virgula.

**Contrastul se verifica, nu se presupune.** Textul marunt trece de 4.5:1 in
ambele teme. `text-ink-400` nu e pentru text care trebuie citit; treptele 500-800
au fost inchise anume pentru asta. Un degrade se masoara la capatul lui cel mai
deschis, nu la mijloc.

**Miscarea e de intrare si de raspuns la mouse, niciodata in bucla.** Pe un ecran
deschis toata ziua, o animatie care se repeta devine un tic in coltul ochiului.
`prefers-reduced-motion` opreste tot.

**Graficele nu deseneaza valori care nu exista in date.** `lib/charts/path.ts`
foloseste interpolare monotona, nu Catmull-Rom: o spline obisnuita, intre o luna
cu 0 si una cu 40.000 lei, trage linia sub zero inainte sa urce. Baza e mereu
zero, nu minimul seriei — altfel o variatie de 2% umple toata inaltimea. Testele
esantioneaza curba si verifica amindoua.

## Cum se scrie cod aici

**Limba.** Comentarii, mesaje de eroare si texte din interfata: romana **fara
diacritice**. README-ul si documentele pentru om folosesc diacritice; codul, nu.
Testele se scriu tot in romana (`describe` / `it`).

**Comentariile spun de ce, nu ce.** Codul arata ce face. Comentariul exista
pentru decizia din spate: de ce se rotunjeste asa, de ce nu se poate altfel, ce
se strica daca cineva "simplifica". Nu comenta linii evidente.

**Importuri**, in ordinea: `server-only` sau alte efecte laterale, apoi pachete
(`type` intii), apoi `@/lib` si `@/app` alfabetic. In interiorul acoladelor,
`type` inaintea valorilor.

**Server actions** intorc `{ ok, error? }`, valideaza intrarea cu zod, verifica
apartenenta la firma si cheama `revalidatePath` pe rutele atinse. Nu arunca
exceptii spre interfata.

**Editorul** recalculeaza in browser cu acelasi motor ca serverul, deci ce vede
omul in timp ce tasteaza e ce se salveaza. Salvarea e explicita, nu la fiecare
tasta: devizul e un document financiar.

Linia arata denumirea, cantitatea, U.M., pretul unitar si valoarea. **Cele patru
componente se editeaza in randul care se deschide sub linie**, impreuna cu
justificarea AI si variantele de norma. Pretul unitar ramine in tabel, read-only,
ca suma celor patru: fara el, `cantitate x pret = valoare` nu se mai poate
verifica dintr-o privire, si asa se citeste un rind de deviz.

Deci **butonul de expandare din `LineMeta` trebuie sa fie pe fiecare linie**. A
fost cindva conditionat de existenta datelor de la AI, iar o linie scrisa de mina
iesea pe `return null`. Cu preturile mutate sub linie, conditia aceea ar face
liniile scrise de mina imposibil de editat — n-ai cum sa ajungi la cifre. La fel,
randul de detalii se deschide neconditionat: preturi are orice linie.

**`server-only` e aliasat in `vitest.config.ts`** catre fisierul gol pe care
Next il rezolva pe conditia `react-server`. Fara alias, pachetul arunca la import
si tot ce scrie in baza — emiterea, importul de preturi — ar ramine
neverificabil. Testele care ating baza au nevoie de PostgreSQL pornit.

**Testele** acopera ce se strica tacut: rotunjiri, numerotare sub concurenta,
integritatea indicatoarelor, maparea apelurilor AI, generatorul e-Factura,
geometria graficelor. Cind un test pica dupa o schimbare de date, intreaba-te
intii daca testul avea dreptate — de citeva ori a avut.

## Verificare

```bash
npm test          # 444 de teste (18 cer PostgreSQL pornit)
npm run typecheck
npm run build
```

Nu raporta ceva ca terminat fara ca astea trei sa treaca.

### Migrarile se aplica la deploy, prin `scripts/migrate-deploy.mjs`

`build` e `prisma generate && node scripts/migrate-deploy.mjs && next build`.

A fost o vreme cind nu era asa, si a costat. `prisma migrate deploy` pus direct in
`build` a picat pe Vercel si a blocat **toate** deploy-urile, nu doar pe cel cu
schema noua, iar din log nu se intelegea de ce. S-a scos, migrarile au ramas de
aplicat de mina — si s-a uitat. Productia a stat cu cod nou peste schema veche:
pagina de materiale si deschiderea oricarui deviz dadeau 500.

Scriptul acopera amindoi candidatii caderii de atunci:

- **fara `DATABASE_URL` sare peste**, cu o linie in log. Un build de preview sau o
  rulare locala nu mai cade din cauza asta;
- **migrarea merge pe o conexiune directa.** `migrate deploy` cere un
  `pg_advisory_lock`, care e o incuietoare de sesiune; prin pgbouncer nu exista
  stare de sesiune, deci asteapta degeaba si pica cu `P1002`. Mesajul lui vorbeste
  despre server si despre advisory lock, si nu pomeneste nicaieri pooling-ul —
  asa a cazut deploy-ul de pe `2193fbb`, cu baza perfect sanatoasa.
  `schema.prisma` ramine neatins: un `directUrl` acolo, cu variabila nesetata, ar
  strica si rularile locale.

  Care conexiune se ia, si in ce ordine, sta in `scripts/migrare-url.mjs` — modul
  pur, testat direct, fiindca greseala de aici nu se vede nici la `npm test` nici
  la un build local, ci abia pe Vercel:

  1. `DIRECT_URL`, scrisa de om;
  2. `DATABASE_URL_UNPOOLED` sau `POSTGRES_URL_NON_POOLING`, pe care le pune
     singura integrarea Neon-Vercel;
  3. dedusa din `DATABASE_URL`, scotind `-pooler` din numele gazdei. La Neon
     aceeasi baza are doua nume care difera doar prin sufixul asta. E singurul pas
     care ghiceste, deci merge numai pe forma aia de nume si scrie in log ce a
     dedus.

  Cind nu se potriveste nimic, ramine `DATABASE_URL` neatins, cu un avertisment:
  unele conexiuni pooled accepta totusi migrarile, si nu oprim un deploy dintr-o
  banuiala.

  **Acreditarile nu trec prin `new URL()`.** Acela normalizeaza si reincodeaza
  userul si parola, iar o parola cu semne iese pe partea cealalta schimbata si
  conexiunea e refuzata pentru un motiv care n-are legatura cu nimic. Se taie
  bucata de gazda si bucata de parametri, si numai ele se ating.

O migrare care chiar da eroare opreste build-ul, si asa trebuie: mai bine
deploy-ul nu pleaca decit sa ajunga cod nou peste schema veche. Diferenta fata de
prima incercare e ca acum motivul se citeste din log de la prima privire.

Ordinea expandare/contractie ramine valabila si conteaza in continuare. O migrare
care doar adauga coloane e inofensiva in ambele sensuri, deci o poate aplica
build-ul inainte ca noul cod sa fie live. **Una care sterge ceva nu se pune in
build**: se aplica de mina, dupa ce codul nou ruleaza peste tot. De aceea
migrarile de aici se scriu in doi pasi.

Migrarea de mina ramine disponibila, pentru cazurile alea si pentru urgente:

```bash
DATABASE_URL="<url-ul de productie>" npm run db:deploy
```

Pentru date de umblat prin aplicatie, dupa `npm run db:seed`:

```bash
npm run demo:deviz     # deviz de 21 de linii, cu utilaj si transport pe citeva
npm run demo:istoric   # un an de documente, ca sa aiba graficele ce arata
npm run demo:factura   # factura pe tot devizul
npm run demo:materiale # sase materiale cu un an de preturi pe trei judete
```

`demo:istoric` genereaza determinist (simbure fixat), deci doua rulari dau
aceleasi grafice si o captura de ecran se poate compara cu alta.

## Capcane de mediu (Windows)

- **Dev-ul ruleaza pe webpack, nu pe Turbopack.** Turbopack incearca sa creeze
  junction-uri in `.next\dev` pentru pachetele externalizate (`@react-pdf`) si
  pica fara Developer Mode, luind cu el si HMR-ul. Porneste cu
  `npm run dev -- --webpack`.
- **`prisma generate` esueaza daca dev serverul ruleaza** — tine deschis
  `query_engine-windows.dll.node`. Opreste-l intii. `npm run build` il cheama,
  deci si build-ul cere serverul oprit.
- **PostgreSQL sta intr-un container, nu ca serviciu.** Masina n-are Postgres
  local si n-are `psql` in PATH. Baza din `DATABASE_URL` e servita de:

  ```bash
  docker start devizor-postgres
  ```

  Docker Desktop nu porneste singur la boot. Containerul a fost creat cu
  `postgres:16`, utilizator/parola/baza `devizor`, volum `devizor-pgdata`.
  `.claude/session-start.sh` presupune Linux (`pg_ctlcluster`, `su postgres`) si
  nu face nimic aici — raporteaza tacut ca baza nu porneste.
- Testele de numerotare au nevoie de PostgreSQL pornit. Sub incarcare mare,
  testul de 50 de emiteri concurente poate pica o data; verifica-l separat
  inainte sa cauti o regresie.
