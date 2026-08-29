---
name: norma-deviz
description: >-
  Cum se compune o norma de deviz romaneasca si cum devine ea rand de deviz:
  reteta (consumuri de materiale, manopera in ore-om pe meserii, utilaj in ore
  de functionare, transport), codificarea din indicatoare, normele locale cand
  indicatorul nu are ce trebuie, si statutul legal (Ordin 1568/2002 - ghid
  P 91/1-02, HG 907/2016, formularul F3, extrasele C6-C9). Explica si unde se
  abate Devizor deliberat de la modelul clasic, si ce nu poate produce din
  cauza asta. Foloseste cand se lucreaza la linii de deviz, coduri de norme,
  indicatoare, cele patru componente (material, manopera, utilaj, transport),
  recapitulatie, consumuri sau retete, promptul AI de generare, PDF-ul
  devizului, trecerea deviz -> factura, sau cand se pune intrebarea daca
  iesirea aplicatiei e valabila pentru o licitatie publica.
---

# Norma de deviz

Documentul asta exista pentru ca cea mai probabila stricare in Devizor nu e un
bug de sintaxa. E cineva care "repara" recapitulatia adaugind un procent de
profit, sau care importa consumurile din indicator fiindca sint acolo in PDF, sau
care lasa modelul sa rescrie denumirea unei norme. Toate trei par imbunatatiri.
Toate trei strica un act pe care il semneaza cineva.

Mai jos e modelul clasic — cum se compune si cum se citeste o norma — si apoi
unde anume se abate aplicatia de la el, deliberat.

## 1. Ce este o norma de deviz

**Specificatia tehnico-economica a unui proces de productie**: consumurile de
resurse necesare pentru **o singura unitate de masura** de lucrare.

Nu e un pret. E o **reteta**: cite kg, cite ore, de cite feluri, pentru 1 mp de
tencuiala sau 1 mc de beton. Pretul iese abia dupa, inmultind consumurile cu
preturile resurselor.

Se intocmeste pe **consumuri medii, in conditii normale de lucru** — nici cazul
cel mai bun, nici cel mai rau.

## 2. Anatomia normei: cinci parti, nu trei

| partea | ce e | in Devizor |
|---|---|---|
| codul | identificatorul in indicator | **da** |
| denumirea | ce se executa | **da** |
| U.M. | unitatea la care se raporteaza reteta | **da** |
| conditiile de masurare / continutul lucrarii | ce operatii intra si ce nu | **nu** |
| reteta (consumurile) | resursele pe unitate | **nu**, deliberat |

Coloana din dreapta e cea care conteaza aici. Din ea ies toate consecintele de la
sectiunea 9.

## 3. Reteta: patru categorii, fiecare cu unitatea ei

- **materiale** — cantitati fizice, in unitatea materialului (kg, mc, buc, mp);
- **manopera** — **ore-om, pe meserii si pe categorii de calificare**, in **ore
  centesimale** (0,25 ore, nu 15 minute);
- **utilaj** — **numai orele de functionare efectiva**, pe tipuri de utilaj, tot
  in ore centesimale;
- **transport** — de regula **articole separate**, cu cod propriu din familia
  `TRA`.

Exemplu, pentru 1 mp de tencuiala de 2 cm:

```
materiale : mortar de tencuit        29,10 kg
            spirt de ciment          10,40 kg
manopera  : muncitor deservent        0,11 ore
            zidar                     0,25 ore
utilaj    : masina de tencuit         0,07 ore
            utilaj de ridicat         0,01 ore
```

Trei lucruri de citit in exemplul asta:

1. **manopera nu e "ora de manopera".** E suma mai multor meserii, fiecare cu
   categoria ei de calificare — ora zidarului si ora deservantului nu costa la
   fel. Cine reduce manopera la un singur numar a facut deja o medie, si e bine
   sa stie ca a facut-o.
2. **utilajul numara doar functionarea efectiva**, nu timpul cit utilajul sta pe
   santier. De aceea 0,07 ore, nu 8.
3. **transportul lipseste aici** fiindca la tencuiala e deja in pretul
   materialului. Cine il scrie si separat il face platit de doua ori — exact
   regula din `CLAUDE.md`, acum cu temeiul ei.

## 4. Norma simpla, norma compusa, lista suplimentara

- **simpla** — contine numai resurse primare: material, manopera, utilaj,
  transport si lista suplimentara;
- **compusa** — poate contine si alte norme, simple sau compuse, fara limita de
  grupare;
- **lista suplimentara** — resurse **neexplicitate** in norma: la adaugarea
  articolului in deviz, devizierul alege concret care resursa se foloseste (ce
  tip de placa, ce marca de mortar). E felul in care o norma acopera o familie de
  materiale fara sa aleaga in locul omului.

## 5. Codificarea

`CA01A1` se citeste pe patru niveluri:

```
C     indicatorul          C = constructii, RpC = reparatii, Ts = terasamente
A     capitolul            CA = betoane turnate, CF = tencuieli, CK = tamplarie
01    norma
A1    varianta
```

Grupele incarcate aici sint in `GRUPE` din `lib/norme/index.ts`, cu eticheta
fiecarui capitol. `Ts` se tipareste altfel (`TS A 01`), `RpC` cu prefix de patru
litere (`RPCE20B1`), dar logica e aceeasi.

Familia transportului are propria regula: `TRA` + tipul + varianta + **ultimele
doua cifre = distanta in km** (`TRA01A50` = transport rutier cu basculanta la
50 km), iar U.M. e **tona**. Deci un transport cu cod nu e o componenta a unei
linii — e o linie separata, cu cantitate in tone.

## 6. Cum se compune una noua: normele locale

Cele mai multe lucrari de azi n-au norma nicaieri — termosistem, tamplarie PVC,
rigips, centrale termice, hidroizolatii. Pentru ele se elaboreaza **norme
locale**, pe aceleasi principii ca propunerile de norme generale noi.

Doua conditii, si a doua e cea uitata de obicei:

1. **fisele de calcul al consumurilor specifice** — pot fi intocmite mai sumar
   decat la normele generale;
2. se folosesc **cu acordul comun si raspunderea proiectantului, executantului si
   beneficiarului**. Nu e o norma pe care o scrie executantul singur si o pune in
   oferta ca pe un fapt.

Detaliile si cele trei metode de stabilire a consumurilor: `references/norme-locale.md`.

## 7. De la norma la bani

Modelul clasic **nu scrie pretul unitar** — il calculeaza:

```
cantitate_linie x consum_resursa        = cantitate de resursa
cantitate de resursa x pret_resursa     = valoare, pe categorie
suma pe cele patru categorii            = pretul unitar al articolului
```

Din acelasi mecanism ies **extrasele de resurse**, prin insumare peste tot
devizul: C6 materiale, C7 manopera (ore, pe meserii), C8 utilaj (ore de
functionare), C9 transport.

Extrasele sint **consecinta retetelor**. Fara retete nu exista extrase — nu e o
functie care lipseste dintr-un program, e o informatie care nu exista in date.

## 8. Statutul legal

**Ordinul MLPTL nr. 1568 / 15.10.2002** aproba ghidul **P 91/1-02** (elaborat de
INCERC): *"Ghid privind elaborarea devizelor la nivel de categorii de lucrari si
obiecte de constructii pentru investitii realizate din fonduri publice"*.

Ce spune, si e des inteles pe dos:

- indicatoarele **seria 1981** (si cele revizuite dupa 1998) se folosesc
  **orientativ**, si de proiectant si de ofertant, la descrierea lucrarilor,
  conditiile de masurare si evaluarea resurselor;
- **ofertantul are libertate deplina** sa prevada in oferta **consumuri proprii
  si tehnologii proprii**, cu respectarea cerintelor cantitative si calitative
  din proiectul tehnic, caietele de sarcini si normativele in vigoare;
- la investitii finantate din fonduri publice, normele de consum sint considerate
  **maximale**: ofertantul poate propune consumuri **mai mici**, nu mai mari.

**Deci normele din 1981 nu sint obligatorii.** Nimeni nu poate fi obligat sa
foloseasca acele consumuri. Ce nu se poate ocoli sint cerintele de calitate si
cantitate din proiect.

Asta justifica arhitectura aplicatiei: Devizor nu incalca nimic lasand omul sa
scrie pretul — face exact ce ghidul numeste "consumuri proprii", doar ca le tine
implicite, in pret.

Pentru lucrari finantate public se adauga **HG 907/2016** (devizul general,
devizul pe obiect, formularele F1–F5, recapitulatia F3 cu indirecte, profit si
CAM). Toate in `references/lucrari-publice.md`.

## 9. Ce inseamna asta pentru Devizor

**Cele patru componente ale liniei sint exact cele patru categorii de resurse ale
unei retete.** Structura e cea legala. Ce lipseste nu e forma — e reteta din
spate.

**Devizor scrie pretul in locul retetei.** E permis (sectiunea 8) si e potrivit
pentru lucrari private negociate. Ce se pierde, concret:

- **nu se pot produce extrasele C6–C9** — n-ai consumuri de insumat;
- **nu se poate demonstra "consum ≤ maximal"** intr-o licitatie publica;
- **nu exista F3** — lipsesc cheltuielile indirecte, profitul si CAM.

Astea nu sint bug-uri, sint granita aplicatiei. Iesirea din Devizor **nu se
depune ca F3** si nu se prezinta ca atare.

**Retetele exista in sursa si au fost aruncate deliberat.** In
`scripts/import-norme.mjs` scrie ca PDF-ul indicatorului contine si resursele
(`y ~ 40-65`) si consumurile (`y ~ 740-770`), si ca se pastreaza doar codul,
denumirea si unitatea. "Sa importam si retetele" e o modificare de citeva randuri,
si tocmai de asta trebuie sa fie limpede **de ce nu**: consumurile din 1981 sint
calibrate pe tehnologia de atunci, iar un consum vechi inmultit cu un pret de azi
da o cifra care pare riguroasa si nu e.

**Cand pui un cod pe o linie, te angajezi la conditiile de masurare ale normei —
desi aplicatia nu le arata.** Beneficiarul deschide indicatorul si citeste ce
operatii intra in norma aceea. Asta e temeiul regulii "un cod oficial fals e citit
ca un angajament", si motivul pentru care `lib/ai/map-tool-output.ts` arunca un cod
inexistent in loc sa-l lase pe linie.

**Consumurile din `lib/consum/` nu sint o exceptie de la cele de mai sus.**
Aplicatia tine acum retete de consum, dar pentru alta intrebare si din alta sursa:

| | consumurile din 1981 | `lib/consum/` |
|---|---|---|
| sursa | indicatoare ICCPDC, tehnologia anilor '80 | fise tehnice de producator si practica de azi |
| la ce servesc | calcularea pretului unitar | cit material cumperi |
| ating banii din deviz | ar atinge | **nu** |
| forma | o cifra, data ca exacta | interval min-max, cu sursa pe fiecare rind |

Calculatorul nu produce niciun leu si nu scrie in nicio linie. Daca cineva vrea
sa lege consumurile de preturi ca sa iasa un pret unitar calculat, aia e alta
discutie — si e discutia de la punctul urmator.

**Catalogul din `lib/materials/` e pe partea de resurse, nu de lucrari.** Daca
vreodata se vor retete, piesele exista: catalog de preturi + reteta = pret unitar
calculat. Dar ala ar fi **al doilea izvor de adevar pentru bani**, si s-ar ciocni
de regula 1 daca omul nu ramane cel care confirma linia.

## 10. Unde traieste in cod

| fisier | ce tine |
|---|---|
| `lib/norme/index.ts` | normele, `getNorma`, `searchNorme`, grupele |
| `lib/ai/prompts.ts` | ce stie modelul despre indicatoare si componente |
| `lib/ai/tools.ts` | schema apelurilor: `cod_norma`, `um`, cele patru preturi |
| `lib/ai/map-tool-output.ts` | codul inexistent se arunca; denumirea si U.M. vin din norma |
| `lib/pricing/calculator.ts` | singurul motor de calcul; ordinea rotunjirilor |
| `lib/invoices/lines.ts` | deviz -> factura, cu divergenta de citiva bani |
| `lib/pdf/documents.tsx` | devizul landscape, recapitulatia pe patru coloane |
| `scripts/import-norme.mjs` | importul din PDF, si ce se arunca din el |

## 11. Trei lucruri care nu se fac

**Nu se adauga coeficienti peste pretul scris de om** — nici indirecte, nici
profit, nici CAM. Daca se vrea F3, e un **tip nou de document**, nu un cimp lipit
peste recapitulatia existenta. Un coeficient adaugat acum ar schimba retroactiv
devize deja trimise.

**Nu se importa consumurile din indicatoarele din 1981** ca sa se calculeze
preturi din ele. Vezi sectiunea 9.

**Nu se forteaza o lucrare intr-o norma care nu i se potriveste** ca sa aiba cod.
Un cod gresit e mai daunator decat lipsa lui: e un angajament asupra a ce se
executa.

## Surse

Vezi `references/lucrari-publice.md`, sectiunea de la final. Afirmatiile legale de
aici vin din rezultate de cautare si din formulare F3 publicate de institutii
publice, **nu din textul normativ citit integral** — cele care asteapta confirmare
sint marcate acolo.
