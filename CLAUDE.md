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
                   liste si direct de la magazine (scraper/ — patru magazine,
                   cascada de straturi, selectoare invatate)
  efactura/        generator UBL 2.1 + validator CIUS-RO
  pdf/             documente react-pdf — devizul landscape, factura portret
  numbering/       alocare numere, fara goluri
  auth.ts          sesiune JWT in cookie
  tenant.ts        requireUser, canManage — poarta spre orice date
  theme.ts         tema din localStorage + scriptul care o pune inainte de pictura
  money.ts         rotunjiri half-up
  money-db.ts      conversii spre Decimal
data/              norme-c.json, norme-rpc.json, norme-ts.json, consumuri.json
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

`lib/materials/scraper/` cere pagina de cautare a magazinelor cind omul cauta un
material pe care catalogul nu-l are, sau il are invechit. `cautaMaterialeProaspete`
din `service.ts` ia decizia; ce se gaseste intra prin `importaObservatii`, deci
**fiecare cautare a unui om lasa in urma o masuratoare datata** si construieste
seria din care iese graficul. O cautare care doar ar afisa ce a gasit acum ar arata
un pret fara istorie.

**Patru magazine, intrebate deodata**: Dedeman, Leroy Merlin, Hornbach, Bricostore,
in `magazine.ts`. Sint origini diferite, deci ritmul per origine nu se incalca, iar
un magazin cazut nu-i tine in loc pe ceilalti (`Promise.allSettled`). Toate
observatiile unei cautari poarta **aceeasi marca de timp**: cu cite una per magazin,
`reperPentruJudet` — care ia cea mai noua — ar alege furnizorul aratat omului dupa
cine a raspuns primul, adica dupa o cursa de retea.

**Nimic nu iese pe internet fara `SCRAPER_ACTIV=true`.** Pornirea e o decizie, nu un
efect secundar al unui deploy. Restul comenzilor (ritm, timeout, cache, TTL,
User-Agent, ce magazine, racire) sint in `.env.example`.

Se poarta cuviincios, si fiecare parte are motivul ei: **respecta `robots.txt`** (un
magazin care spune ca nu vrea ajunge oricum sa blocheze, deci catalogul se opreste
la fel), **tine ritm** intre cereri catre aceeasi origine, **se prezinta** cu un
User-Agent care spune cine e, si **tine cache** ca doi oameni care cauta "parchet" in
acelasi minut sa nu faca doua cereri identice. Cache-ul tine promisiunea, nu textul:
altfel doua cereri pornite in aceeasi clipa nu s-ar vedea una pe alta. Rezervarea
slotului de ritm se face sincron, inainte de orice `await`, din acelasi motiv.

**Cind magazinul nu raspunde, pagina se afiseaza oricum**, cu ce e in catalog.
Verificat pe server real: cerere respinsa, pagina 200. O cautare de materiale nu e
locul unde sa cada aplicatia din cauza unui site strain.

#### Cascada de extragere

Selectoarele scrise fara sa vezi pagina sint o presupunere, si ar ramine o
presupunere si la client. De aceea extragerea nu mai atirna de ele. Straturile, in
ordinea increderii — si a costului:

1. **JSON-LD** (`schema.org/Product`), in `extract.ts`. Standard, pus pentru Google,
   supravietuieste unui redesign.
2. **Microdate** (`itemprop`), in `microdate.ts`. Acelasi standard, alta scriere.
3. **Starea de aplicatie** (`__NEXT_DATA__`, `__NUXT__`), in `stare-app.ts`. Singurul
   strat care vede produsele cind lista se deseneaza abia in browser.
4. **Selectoare** — dar numai cele **invatate de model pe pagina reala**, nu ghicite.
5. **Tipare** (`euristica.ts`): fara niciun selector, pornind de la pretul in lei.
6. **Modelul** (`lib/ai/extrage-produse.ts`), cind nimic de mai sus n-a prins.

Arbitrajul (`alegeStrat`) ia **primul strat cu cel putin 3 produse**, iar sub prag pe
cel cu numarul cel mai mare. Nu "primul strat nevid": o pagina cu douazeci si patru
de produse in grila si un singur bloc JSON-LD pentru produsul promovat din banner ar
da un produs si s-ar opri acolo. Doua straturi nu se amesteca niciodata — rezultatele
s-ar dubla peste aceleasi produse.

**Euristica se agata de moneda, nu de structura.** Cauta text care arata a pret in
lei in noduri cu text propriu scurt, urca cel mult sase parinti pina la cardul care
are si legatura si titlu, si **cere un grup repetat de cel putin doua carduri**. Asa
raman afara "de la 9,99 lei" din banner, "livrare 19,99 lei" din subsol si "Cosul meu
0,00 lei" din bara de sus. Se testeaza pe **arhetipuri de markup**, nu pe magazine
(`euristica.test.ts`): un test scris "pe Dedeman" ar fi tot o presupunere, doar cu
nume adevarat pe ea.

**`plauzibil.ts` ruleaza dupa fiecare strat**, si nu e cosmetizare: `MaterialPrice`
creste si nu se rescrie, deci **poluarea catalogului e definitiva**. Pret intre 0,1 si
100.000; denumiri intre 3 si 200 de caractere; etichetele de interfata aruncate;
plafon de 24 de produse per magazin, ca frina de avarie. Filtrul de relevanta (macar
un cuvint al interogarii in denumire) se aplica **doar** straturilor care ghicesc
structura paginii — 4, 5 si 6 — nu celor declarate de magazin: e gardul pentru cazul
in care adresa de cautare ghicita a nimerit o pagina de categorie.

Moneda se verifica peste tot: un pret in euro citit ca leu intra de cinci ori mai mic
decit adevarul si nu se mai poate distinge dupa aceea.

#### Modelul citeste pagina, si isi lasa in urma selectoarele

`lib/ai/extrage-produse.ts` e ultimul strat. Trei lucruri il tin onest si ieftin:

- **e ultimul.** Un magazin care pune JSON-LD nu costa niciodata niciun token.
- **ce spune se verifica in pagina.** Denumirea si cifra trebuie sa apara literal in
  textul trimis modelului. Un model care n-a gasit destule poate completa din ce stie
  despre materiale, si intr-un tabel append-only asta ar ramine acolo pentru
  totdeauna. Ce nu se regaseste se arunca.
- **intoarce si selectoarele** prin care a gasit produsele. Se pastreaza numai daca,
  rulate cu `dinSelectoare` pe **aceeasi** pagina, prind macar jumatate din aceleasi
  produse; altfel ar fi tot o presupunere, doar ca de-acum scrisa in baza. Salvate in
  `MagazinSelector`, sterse la al doilea esec la rind. Asa modelul e chemat **o data
  per magazin per redesign**, nu la fiecare cautare.

Pagina nu se trimite bruta: se condenseaza (fara `script`, `style`, `svg`), cu plafon
in `SCRAPER_AI_MAX_CARACTERE`. Ce nu incape se taie la o granita de linie si se scrie
in log — o trunchiere tacuta ar arata pe ecran ca o pagina fara produse. Iesirea trece
prin `output_config.format` si prin zod, ca peste tot. Fiecare apel se scrie in
`AiRun` cu `kind = MATERIALE`: un apel care costa bani apartine tabelului de audit.

**Fara `ANTHROPIC_API_KEY` stratul nu exista**, si asta nu e o eroare: cautarea merge
mai departe cu straturile deterministe.

#### Cind un magazin nu da nimic

`sanatate.ts` tine socoteala, in memorie: trei goluri la rind si magazinul e sarit
sase ore, fara nicio cerere si fara niciun apel de model. Un 403 sau 429 intra in
racire imediat — cind magazinul spune raspicat nu, insistenta n-aduce produse, aduce
blocare. Interdictia din `robots.txt` se scrie in log **o data**, nu la fiecare
cautare. Un interstitial servit cu status 200 ("Just a moment") se recunoaste dupa
vocabular, nu dupa vreun selector.

Adresa de cautare a unui magazin **nu e un fapt verificabil de aici**: se incearca
formele uzuale, in ordine, pina cind una da produse, iar cea cistigatoare se tine
minte. `SCRAPER_URL_<CHEIE>` o suprascrie, pentru ziua in care magazinul si-o muta.

**Pretul de la magazinul online e national.** Judetul ales schimba disponibilitatea si
magazinul, nu cifra, deci observatiile intra cu `countyCode` null — de aceea
`reperPentruJudet` are rezerva nationala, aratata ca atare.

**`supplier` e singura identitate a magazinului in baza**, si de aceea intra si in
cheia de dedublare din `importaObservatii`: cu o singura marca de timp pe toata
cautarea, doua magazine care listeaza acelasi produs la acelasi pret ar parea aceeasi
masuratoare, iar al doilea furnizor ar disparea. Doua magazine sint doua masuratori.

**Singurele selectoare scrise de mina sint cele ale Dedeman-ului, din `magazine.ts`,
si sint de confirmat**: mediul in care s-au scris n-are acces la internet, deci vin
din tipare uzuale, nu de pe pagina reala. Nu se mai adauga altele ghicite — celelalte
trei magazine n-au niciunul, si nici n-au nevoie. Se verifica cu
`npm run proba:furnizor -- ciment`, care arata ce a dat fiecare strat si de ce n-a dat
nimic; `--fisier` merge si pe o pagina salvata, deci si fara internet.

**Calea sanctionata ramine feed-ul de afiliere** (2Performant), care da preturile cu
acordul magazinului. Intra pe aceeasi interfata `PriceSource`, deci trecerea la el nu
rescrie nimic.

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
npm test          # 420 de teste
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
- **cind exista `DIRECT_URL`, migrarea merge pe ea.** `migrate deploy` refuza o
  conexiune pooled (pgbouncer). `schema.prisma` ramine neatins: un `directUrl`
  acolo, cu variabila nesetata, ar strica si rularile locale. Cind `DATABASE_URL`
  pare pooled si `DIRECT_URL` lipseste, scriptul avertizeaza inainte sa incerce.

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
