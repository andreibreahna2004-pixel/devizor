@AGENTS.md

# Devizor

Devize si facturi pentru firme de constructii din Romania. Omul descrie lucrarea
in cuvintele lui, aplicatia scoate devizul, iar din deviz ies factura si XML-ul
de e-Factura pentru SPV.

Documentele produse aici ajung la un beneficiar si la ANAF. O cifra gresita sau
un cod oficial inventat nu sint bug-uri de interfata — sint erori pe un act pe
care il semneaza cineva. Regulile de mai jos exista ca sa nu se intimple asta.

## Cele patru reguli care nu se incalca

**1. Pretul il scrie omul, pe linia de deviz.** Nu exista catalog de articole, de
materiale sau de tarife. Recapitulatia totalizeaza si atit: nu exista cheltuieli
indirecte, nu exista procent de profit, nu exista niciun coeficient care se adauga
peste pret. Nimic nu recalculeaza in spate o valoare pe care a scris-o omul. Daca
apare cerinta unei a doua surse de adevar pentru bani, e semnalul ca ceva e gresit
in cerinta, nu in cod.

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
components/
  charts/          sparkline (server) + graficul de evolutie (client)
  icons.tsx        setul de iconite, scrise de mina
  theme-toggle.tsx comutatorul deschis / intunecat
lib/
  ai/              prompt, unelte, bucla agentica, mapare apel -> linie
  charts/          trasee SVG — modul pur, fara DOM, testat direct
  dashboard/       agregarile de pe panou: serii, sparkline, activitate
  norme/           indicatoarele de norme: cautare, coduri, grupe
  pricing/         motorul de calcul — sursa unica de adevar pentru cifre
  estimates/       operatiile pe deviz
  progress/        situatii de lucrari, cantitati executate cumulat
  invoices/        emitere, storno, snapshot-uri; lines.ts — deviz -> factura, pur
  efactura/        generator UBL 2.1 + validator CIUS-RO
  pdf/             documente react-pdf — devizul landscape, factura portret
  numbering/       alocare numere, fara goluri
  auth.ts          sesiune JWT in cookie
  tenant.ts        requireUser, canManage — poarta spre orice date
  theme.ts         tema din localStorage + scriptul care o pune inainte de pictura
  money.ts         rotunjiri half-up
  money-db.ts      conversii spre Decimal
data/              norme-c.json, norme-rpc.json, norme-ts.json
scripts/           import indicatoare, seed demo, istoric demo, token de dezvoltare
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

**Testele** acopera ce se strica tacut: rotunjiri, numerotare sub concurenta,
integritatea indicatoarelor, maparea apelurilor AI, generatorul e-Factura,
geometria graficelor. Cind un test pica dupa o schimbare de date, intreaba-te
intii daca testul avea dreptate — de citeva ori a avut.

## Verificare

```bash
npm test          # 188 de teste
npm run typecheck
npm run build
```

Nu raporta ceva ca terminat fara ca astea trei sa treaca.

### Migrarile NU se aplica la deploy

`build` e `prisma generate && next build`. Nu ruleaza `prisma migrate deploy`, si
asta cere atentie: **o schimbare de schema trebuie aplicata pe baza de productie
manual, inainte de a duce codul acolo.**

S-a incercat si varianta cu migrarea in build. Pe Vercel a picat, si a picat prost:
build-ul esuat a blocat toate deploy-urile, nu doar pe cel cu schema noua. Pina se
citeste log-ul de build si se afla de ce (candidatii: `DATABASE_URL` neexpus la
build, sau o conexiune pooled pe care `migrate deploy` o refuza, caz in care
`datasource` are nevoie de `directUrl`), migrarile se aplica de mina:

```bash
DATABASE_URL="<url-ul de productie>" npx prisma migrate deploy
```

Ordinea conteaza. O migrare care doar adauga coloane se aplica inainte de deploy si
nu deranjeaza codul vechi. Una care sterge ceva se aplica dupa ce noul cod e live,
altfel cade codul care inca citeste coloana. De aceea migrarile de aici se scriu in
doi pasi: intii expandarea, apoi contractia.

Pentru date de umblat prin aplicatie, dupa `npm run db:seed`:

```bash
npm run demo:deviz     # deviz de 21 de linii, cu utilaj si transport pe citeva
npm run demo:istoric   # un an de documente, ca sa aiba graficele ce arata
npm run demo:factura   # factura pe tot devizul
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
