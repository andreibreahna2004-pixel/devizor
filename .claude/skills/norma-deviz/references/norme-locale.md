# Normele locale: cum se compune o norma cand indicatorul n-are ce trebuie

Situatia e regula, nu exceptia. Indicatoarele sint din 1981, iar termosistemul,
tamplaria PVC, rigipsul, centralele termice si hidroizolatiile de azi n-au norma
nicaieri.

## Cadrul

Cand colectiile nu au o norma potrivita, se elaboreaza **norme locale**, pe
aceleasi principii ca propunerile de norme generale noi. Doua conditii:

1. **Fisele de calcul al consumurilor specifice** — se intocmesc, dar pot fi mai
   sumare decat la normele generale.
2. **Acordul comun si raspunderea proiectantului, executantului si
   beneficiarului.** Asta e partea care se sare cel mai des. O norma locala nu e
   o cifra pe care o scrie executantul singur si o pune in oferta ca pe un fapt
   verificat — e o conventie intre trei parti, si toate trei raspund de ea.

## Cele trei metode de a stabili consumurile

| metoda | cand se foloseste | ce risca |
|---|---|---|
| **asimilare** — comparatie directa si corelare cu o norma existenta apropiata ca continut | cel mai des; sursele o dau explicit ca acceptabila | daca norma-sursa descrie alta tehnologie, consumul iese plauzibil si fals |
| **calcul analitic** pe tehnologia proprie, din fisa tehnica a producatorului | lucrari noi, cu date de la furnizor | cere pierderile reale de pe santier, nu doar consumul teoretic de pe ambalaj |
| **cronometrare / observare** pe santier | cand nu exista termen de comparatie | costa timp, si un singur santier nu da o medie |

Ordinea de mai sus e si ordinea efortului. In practica, asimilarea acopera
majoritatea cazurilor; cronometrarea se face pentru lucrarile repetitive, unde
merita.

## Capcana asimilarii

O norma apropiata "ca denumire" nu e o norma apropiata ca **continut**. Doua
exemple din chiar indicatoarele incarcate aici:

- **parchetul** din `C` e parchet de stejar batut in cuie sau lipit cu aracet.
  Parchetul laminat de azi se pune altfel, cu alt suport si alta manopera.
  Asimilarea da o cifra care pare acoperita de o norma oficiala si nu e.
- un **placaj de perete** si o **pardoseala** din aceleasi placi au consumuri
  diferite de adeziv si alta manopera, desi denumirile seamana.

Regula practica: asimilezi dupa **conditiile de masurare si continutul lucrarii**,
nu dupa denumire. Daca operatiile din norma-sursa nu sint operatiile pe care le
executi, nu e asimilare — e o cifra imprumutata.

## Ce inseamna asta in Devizor

Aplicatia **nu tine norme locale** si nu tine consumuri deloc. O lucrare fara
norma se scrie ca **linie libera**: `cod_norma` gol, denumirea scrisa de om sau de
model, cu ce se executa, din ce material si la ce dimensiune ("Termosistem 10 cm
polistiren expandat pe fatada").

Asta e o alegere, nu o lipsa: pretul il scrie omul, deci reteta n-are ce
calcula. Dar are doua consecinte de stiut:

- **nu exista o fisa de calcul** in aplicatie pentru linia aceea, deci nici baza
  documentara pe care o cere o norma locala intr-o lucrare publica;
- **acordul celor trei parti nu e inregistrat nicaieri.** Daca lucrarea cere norme
  locale formale, ele se intocmesc in afara aplicatiei, iar in deviz intra
  rezultatul.

Daca vreodata se vor norme locale in aplicatie, ele sint **un model nou** (norma
proprie a firmei, cu resurse si consumuri), nu un cimp in plus pe `EstimateLine`.
Si atunci se pune si intrebarea de la regula 1: cine confirma cifra care iese din
reteta.
