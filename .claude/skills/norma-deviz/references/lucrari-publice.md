# Lucrari finantate public: P 91/1-02, HG 907/2016, F3, extrasele C6-C9

Ce trebuie stiut cand cineva intreaba daca un deviz din Devizor se poate depune
la o licitatie publica. Raspunsul scurt e nu, si mai jos e de ce.

## Ghidul de elaborare a devizelor

**Ordinul MLPTL nr. 1568 / 15.10.2002** aproba reglementarea tehnica *"Ghid
privind elaborarea devizelor la nivel de categorii de lucrari si obiecte de
constructii pentru investitii realizate din fonduri publice"*, indicativ
**P 91/1-02**, elaborata de INCERC.

Trei lucruri din el:

1. Devizele se intocmesc pe categorii de lucrari, folosind **norme de deviz
   recunoscute** sau **consumurile proprii** ale unitatii de constructii,
   corespunzatoare tehnologiilor ei, cu respectarea cerintelor cantitative si
   calitative din proiectul tehnic, caietele de sarcini si normativele aplicabile.
2. Indicatoarele **seria 1981** si cele revizuite dupa 1998 se folosesc
   **orientativ**, si de proiectant si de ofertant, la descrierea lucrarilor,
   conditiile de masurare si evaluarea resurselor.
3. La investitii finantate din fonduri publice, normele de consum sint
   considerate **maximale**: ofertantul are libertate deplina sa propuna consumuri
   **mai mici**, cu respectarea proiectului si a caietelor de sarcini.

Deci indicatorul nu e obligatoriu. Ce e obligatoriu e sa respecti cerintele
tehnice si sa poti **arata** ce consumuri ai prevazut.

## Documentatia dupa HG 907/2016

**HG nr. 907 / 29.11.2016** — etapele de elaborare si continutul-cadru al
documentatiilor tehnico-economice pentru obiective de investitii finantate din
fonduri publice. De aici vin:

- **devizul general** — structura pe capitole de cheltuieli a intregii investitii;
- **devizul pe obiect**;
- **formularele F1–F5**, care completate cu preturi unitare si valori devin
  formularele ofertei si stau la baza situatiilor de lucrari executate:
  - **F1** centralizatorul cheltuielilor pe obiectiv,
  - **F2** centralizatorul pe obiect si categorii de lucrari,
  - **F3** **lista cu cantitati de lucrari, pe categorii de lucrari** — devizul
    oferta propriu-zis,
  - **F4** lista cu cantitati de utilaje si echipamente,
  - **F5** fisa tehnica a utilajului.

## Recapitulatia F3

Aici e diferenta de fond fata de Devizor:

```
T1 = cheltuieli directe            material + manopera + utilaj + transport
     alte cheltuieli directe       incl. contributia asiguratorie pentru munca,
                                   2,25% asupra manoperei
T2 = T1 + alte cheltuieli directe
T3 = T2 + cheltuieli indirecte
T4 = T3 + profit
```

**Devizor se opreste la T1**, si asta e regula 1 din `CLAUDE.md`: pretul il scrie
omul pe linie, nimic nu se adauga peste el in spate.

Consecinta: recapitulatia din aplicatie **nu e recapitulatia F3**, iar devizul
generat **nu e formularul F3**. Nu i se pune eticheta asta si nu se depune ca atare.

Daca vreodata se vrea F3, e **un tip nou de document** — cu indirectele, profitul
si CAM ca elemente ale lui — nu un cimp de procent adaugat peste recapitulatia de
azi. Un coeficient adaugat acum ar schimba retroactiv devize deja trimise, si asta
incalca si regula 1, si regula documentului emis.

## Extrasele de resurse

| formular | ce contine |
|---|---|
| **C6** | extras de materiale |
| **C7** | extras de manopera — ore, pe meserii |
| **C8** | extras de utilaj — ore de functionare |
| **C9** | extras de transport |

Se obtin insumand, peste tot devizul, `cantitate_linie x consum_resursa` din
retete. **Devizor nu le poate produce**: nu tine consumuri, deci nu are ce insuma.
Nu e o functie nescrisa — e o informatie care nu exista in date.

Din acelasi motiv nu se poate demonstra "consum ≤ maximal": nu exista consumurile
proprii declarate cu care sa se faca comparatia.

## Rezumat: ce lipseste pentru o licitatie publica

| cerinta | Devizor |
|---|---|
| formularul F3 cu recapitulatia T1–T4 | **nu** — se opreste la cheltuieli directe |
| CAM 2,25% pe manopera | **nu** |
| cheltuieli indirecte, profit | **nu**, deliberat (regula 1) |
| extrasele C6–C9 | **nu** — nu exista consumuri |
| F1, F2, F4, F5 | **nu** |
| deviz general pe capitole | **nu** |

Pentru lucrari private negociate, nimic din lista de mai sus nu e cerut, si
devizul pe patru componente e complet.

## Surse

Confirmate prin cautare web (august 2026):

- Ordinul MLPTL 1568/2002 si ghidul P 91/1-02 (INCERC) — text citat in decizii
  CNSC si in ghidul publicat pe windev.ro;
- HG 907/2016 — Portal Legislativ, documentul 185166
  (`legislatie.just.ro/Public/DetaliiDocumentAfis/185166`);
- structura F3 si recapitulatia T1–T4 cu CAM 2,25% — pe formulare F3 publicate de
  institutii publice (Politia Romana, RAR, INSP, CJ Arges, ANAR Crisuri);
- anatomia normei, exemplul de reteta si extrasele C6–C9 — documentatie de
  specialitate (eDevize, WinDoc Deviz, scrigroup);
- regimul normelor locale si al consumurilor maximale — P 91/1-02, asa cum e citat
  in decizii CNSC.

**De confirmat pe textul oficial**, si de tratat pina atunci ca parafraza:

- numerotarea exacta a anexelor din HG 907/2016 in care stau F1–F5;
- formularea exacta a articolelor din P 91/1-02 (mai sus e redat sensul, nu
  cuvintele normei);
- lista completa a indicatoarelor si a editiilor revizuite dupa 1998.

Motivul pentru care nu sint citate exact: `WebFetch` e blocat de proxy-ul de retea
pe `legislatie.just.ro`, `lege5.ro`, `windev.ro` si pe site-urile de primarii care
publica formularele; a mers doar cautarea, care intoarce rezumate. Cine are textul
normativ la indemana poate inlocui parafrazele cu citate si sterge sectiunea asta.
