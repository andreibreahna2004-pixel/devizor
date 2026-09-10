# Devizor

Devize și facturi pentru firmele de construcții din România

Descrii lucrarea în cuvintele tale — *„casă P+1, 120 mp amprentă, zidărie BCA 30,
șarpantă cu țiglă ceramică, finisaje medii"* — și primești devizul cu lucrări,
cantități și prețuri. Din deviz iese factura, cu XML de e-Factura pentru SPV.

Lucrările se numesc ca în **indicatorul de norme de deviz C**, cu codurile lui.
Prețul, în schimb, stă pe linia de deviz și îl scrii **tu**, cât vrei să fie —
nu există catalog de materiale sau de tarife și nimic nu se recalculează în spate.

---

## Ce face

**Deviz generat din descriere.** AI-ul parcurge lucrarea în ordinea execuției pe
șantier și adaugă liniile grupate pe stadii fizice. Fiecare linie poartă calculul
cantității — *„perimetru 46 ml × h 2,80 = 128,8 mp, minus goluri 18 mp = 110,8 mp"* —
un preț orientativ de pornire și un nivel de încredere. Devizul se salvează ca
ciornă în timp ce se generează, deci o generare de câteva minute nu se pierde dacă
închizi pagina.

**Spui ce ai lucrat, în cuvinte normale.** Într-un deviz deschis scrii *„am săpat
12 mc cu excavatorul și după am turnat beton în fundație"* și liniile intră
singure: lucrarea căutată în indicator, cantitatea luată din frază, prețul lăsat
ție. Intră exact ce ai spus — nu se adaugă cofraje și armătură pentru că „așa vine
pe șantier". Săpătura intră fără cod, fiindcă terasamentele sunt în alt indicator.

**Indicatoarele de norme, ca vocabular.** 4.570 de norme: **C** — lucrări de
construcții (2.205, cu unitate de măsură), **RpC** — reparații la construcții
(2.133), **Ts** — terasamente (232, toate cele zece capitole). Cauți lucrarea și linia se completează
singură; prețul rămâne al tău. Căutarea trece peste felul în care e scris
indicatorul: e tipărit înainte de reforma ortografică din 1993, așa că *stâlpi*
găsește `STILPI` și *tâmplărie* găsește `TIMPLARIE`, iar *planșeu* găsește
`PLANSEE`. Lucrările care nu există acolo — termosistem, tâmplărie PVC, centrale
termice — se scriu liber, fără cod.

**Două feluri de a scrie prețurile.** Un singur preț pe linie, cu materialul și
manopera la un loc — sau două prețuri separate. Pe modul separat, devizul se
tipărește ca două documente, *Deviz materiale* și *Deviz manoperă*, și se poate
factura separat pe fiecare, cu numere proprii în serie și XML propriu de
e-Factura. Modul se schimbă oricând cât timp devizul e ciornă.

**Editor cu recalculare live.** Modifici denumirea, cantitatea, unitatea și
prețurile, iar recapitulația se recalculează în browser cu exact același motor ca
pe server. Liniile propuse de AI și neverificate încă sunt numărate în capul
paginii; orice linie atinsă de om se marchează verificată.

**Situații de lucrări.** Facturare în tranșe, cum se lucrează pe șantier: la
sfârșitul lunii introduci cantitățile executate — direct sau ca procent din restul
de executat — și emiți factura pentru acea situație, tot cu opțiunea de a o rupe
pe materiale și manoperă. Cumulatul nu poate depăși devizul; un plus de lucrări se
adaugă în deviz, nu se strecoară într-o situație.

**Facturi și e-Factura.** Numerotare secvențială fără goluri. La emitere, datele
ambelor părți se îngheață în factură. O factură emisă nu se șterge și nu se
modifică — se stornează printr-o notă de credit cu număr propriu. Export XML
UBL 2.1 conform CIUS-RO, cu validare în română înainte de export.

---

## Pornire rapidă

Ai nevoie de **Node 20+** și **PostgreSQL 14+**.

```bash
npm install
cp .env.example .env        # completează DATABASE_URL și AUTH_SECRET
npx prisma migrate deploy
npm run db:seed             # cont demo, firmă, beneficiar, proiect
npm run dev
```

Deschide http://localhost:3000 și intră cu:

| | |
|---|---|
| Email | `demo@devizor.ro` |
| Parolă | `devizor123` |

`AUTH_SECRET` se generează cu:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Generarea cu AI

Adaugă în `.env` o cheie de la [console.anthropic.com](https://console.anthropic.com):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Fără ea aplicația funcționează integral — doar *„Generează devizul"* și *„Spune ce
ai lucrat"* sunt dezactivate. Restul merge: cauți norma în indicator și scrii
linia de mână.

Pentru a umbla prin aplicație fără să consumi o generare:

```bash
npm run demo:deviz                  # deviz de 21 de linii, în modul separat
npm run demo:factura -- materiale   # factura de materiale
npm run demo:factura -- manopera    # factura de manoperă
```

---

## Cum e construit

```
app/
  (auth)/        login, înregistrare firmă
  (app)/         devize, facturi, clienți, proiecte, setări
  api/
    ai/deviz     generare cu AI a unui deviz nou, flux SSE
    devize/[id]/linii    adăugare din vorbire într-un deviz existent, flux SSE
    devize/[id]/pdf?parte=materiale|manopera
    facturi/[id]/{pdf,xml}
  actions/       server actions (validate cu zod, verifică apartenența la firmă)
lib/
  ai/            prompt, unelte, buclă agentică, mapare apel → linie de deviz
  norme/         indicatorul C: căutare, coduri, grupe
  pricing/       motorul de calcul — sursa unică de adevăr pentru cifre
  estimates/     operațiile pe deviz
  progress/      situații de lucrări, cantități executate cumulat
  invoices/      emitere pe materiale/manoperă/tot, storno, snapshot-uri
  efactura/      generator UBL 2.1 + validator CIUS-RO
  pdf/           documente react-pdf
  numbering/     alocare numere, fără goluri
prisma/          schema, migrări, seed
data/            norme-c.json — indicatorul, generat cu scripts/import-norme.mjs
assets/fonts/    Liberation Sans (SIL OFL) pentru diacriticele din PDF
```

### Deciziile care contează

**Indicatorul e vocabular, nu preț.** Din normă se iau codul, denumirea și
unitatea; consumurile normate nu intră în aplicație. Sunt calibrate pentru
tehnologia și organizarea de acum patruzeci de ani, iar un consum vechi înmulțit
cu un preț de azi dă o cifră care pare riguroasă și nu e. Codul spune *ce* se
execută; *cât costă* rămâne al firmei.

**Listele stau în fișiere, nu în baza de date.** Sunt aceleași pentru toate
firmele și nu se editează, deci nu au `orgId` și nu au nevoie de migrări.

`norme-c.json` și `norme-rpc.json` se regenerează cu
`node scripts/import-norme.mjs <pdf> c|rpc` — cele două indicatoare sunt tipărite
la fel, ca tabel rotit 90°, doar pe alte înălțimi.
`norme-ts.json` vine din două surse. Cartea scanată a fost transcrisă de mână:
OCR-ul citește denumirile acceptabil, dar greșește codurile — `TS A 01` devine
`TS AQ`, `TS A 07` devine `15 A 07` — iar un cod oficial greșit ajunge pe devizul
pe care îl semnează cineva. Peste transcriere, `scripts/import-norme-ts.mjs`
completează din volumul I, care are strat de text: acolo codurile ies curat, și
de acolo vin normele de pe fila lipsă din scanare. Unitatea de măsură nu e în
tabla de materii, deci la Ts și RpC `um` e `null` și se completează pe linie.

**Nicio a doua sursă de adevăr pentru bani.** Prețul stă pe linia de deviz și
atât. Nu există catalog din care să se recompună, nici coeficienți care să se
adauge peste el în recapitulație. Ce scrii pe linie e ce plătește beneficiarul,
iar factura adună exact cât devizul.

**Un singur motor de calcul.** `lib/pricing/calculator.ts` e folosit de interfață,
PDF, XML, situații de lucrări și generatorul AI. Valoarea unei linii nu e
`cantitate × preț total rotunjit`, ci suma componentelor material și manoperă
rotunjite separat — așa cele două facturi emise dintr-un deviz separat adună la
ban exact cât devizul.

**TVA-ul pe grupă de cotă.** Se calculează din baza impozabilă însumată, nu prin
adunarea TVA-ului de pe linii. E regula EN 16931 (BR-CO-17); adunarea liniilor
poate devia cu un ban și factura ar fi respinsă de validatorul ANAF.

**Numerotare atomică.** Un singur `UPDATE ... RETURNING` alocă numărul, în aceeași
tranzacție cu inserarea documentului. Dacă inserarea eșuează, rollback-ul dă
numărul înapoi. Verificat cu un test de 50 de emiteri concurente.

**Izolare pe firmă.** Fiecare tabel de business poartă `orgId`, iar `orgId`-ul vine
doar din sesiune — niciodată din request. Verificat: o firmă autentificată
primește 404 pe documentele altei firme.

**AI-ul propune, omul semnează.** Nimic generat nu se emite automat. Modelul
caută norma în indicator și trimite codul; dacă inventează un cod, codul se
aruncă și rămâne linia scrisă liber — un cod oficial fals ar fi citit de
beneficiar ca un angajament asupra a ce se execută. Prețurile propuse sunt repere
de piață, marcate ca neverificate până când cineva atinge linia. O linie fără justificare, cu cantitate ≤ 0 sau cu preț negativ e refuzată
din start; modelul primește înapoi explicația și reia. Când nu are niciun reper
rezonabil pentru o lucrare, trimite prețul 0 și scrie de ce — un zero vizibil e
mai onest decât o cifră inventată.

---

## Verificare

```bash
npm test          # 89 de teste
npm run typecheck
npm run build
```

Acoperă motorul de calcul (inclusiv capcanele de rotunjire și faptul că cele două
facturi separate adună exact cât devizul), numerotarea sub concurență, integritatea
indicatorului și punțile de căutare peste ortografia veche, maparea apelurilor AI
în linii de deviz pentru ambele moduri și generatorul e-Factura — inclusiv două
teste care parsează XML-ul și verifică pe arbore că documentul se închide cu el
însuși.

---

## Ce nu e făcut încă

- **Trimiterea automată în SPV.** Se exportă XML-ul, dar încărcarea în SPV se face
  manual. Integrarea cu API-ul ANAF cere certificat și OAuth, care nu pot fi
  testate fără credențiale reale.
- **Reutilizarea prețurilor între devize.** Fiecare deviz se scrie de la zero sau
  se pornește de la o generare. Nu există „copiază devizul" și nici o listă de
  prețuri folosite recent din care să tragi o linie.
- **Unitatea de măsură la Ts și RpC.** Nu e în tabla de materii, ci în corpul
  cărții, în fraza „Se măsoară la...". Se poate scoate cu OCR — acolo greșelile
  nu contează, fiindcă rezultatul se potrivește pe o listă scurtă de unități.
- **Capitolul TS C e incomplet.** Are 34 din cele 42 de norme: scanării îi
  lipsește o filă (paginile 14–15 din carte), iar volumul I acoperă doar o parte
  din ce era acolo.
- **Izolațiile (Iz).** PDF-ul are strat de text, dar prea corupt ca să fie de
  folos: paginile au orientări amestecate, iar cuvintele ies stricate
  („groisime", „vapoirilor"). Din 175 de coduri au trecut de filtrul de calitate
  doar 19, așa că indicatorul nu e încărcat. Rămâne de transcris vizual, ca Ts.
  Până atunci, hidroizolațiile se scriu ca linii libere, fără cod.
- **Instalațiile (S, E, I)** au indicatoarele lor, care se procură separat.
- **Consumurile normate.** Se extrag din PDF, dar nu se stochează. Dacă vrei să
  vezi ce cuprinde o normă, trebuie păstrate la import și afișate în editor.
- **Facturi în altă monedă.** Se validează, dar cursul BNR nu se preia automat.
- **Generarea cu AI nu a fost rulată împotriva API-ului real** — nu exista cheie în
  mediul de dezvoltare. Logica de mapare e acoperită cu teste, dar prima rulare cu
  o cheie adevărată merită urmărită atent, mai ales cât de bine nimerește modelul
  norma potrivită într-un indicator scris acum patruzeci de ani.

### Factura pe tot devizul, în modul separat

Pe un deviz cu materialele și manopera separate, factura de materiale și cea de
manoperă adună la ban exact cât devizul: fiecare pornește de la componenta ei,
rotunjită la fel ca în recapitulație.

Factura pe *tot* devizul comasează cele două prețuri într-unul singur pe linie,
pentru că ANAF cere ca `cantitate × preț afișat` să dea valoarea afișată. La
cantități mari, comasarea poate abate totalul cu câțiva bani față de deviz. Dacă
ai nevoie de potrivire exactă, emite cele două facturi separate — sau folosește
`BaseQuantity` din EN 16931 (preț per N unități), care nu e implementat.
