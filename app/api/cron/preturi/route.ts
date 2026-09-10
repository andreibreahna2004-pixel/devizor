import { esteCadereTotala, treceriZilnice } from "@/lib/materials/zilnic";

/**
 * Trecerea zilnica peste preturi, pornita de Vercel Cron.
 *
 * Acelasi modul ca `npm run preturi:zilnic`: logica sta in
 * `lib/materials/zilnic.ts` si aici e doar poarta. Programul e in `vercel.json`.
 *
 * **Pazita cu `CRON_SECRET`.** Ruta porneste cereri catre site-uri strine de pe
 * serverul nostru; nepazita, ar face-o oricine, de cate ori vrea. Fara secretul
 * setat in mediu, ruta raspunde 404 si nu exista: mai bine indisponibila decat
 * deschisa. 404, nu 401, ca sa nu confirme nici macar ca exista ceva aici.
 *
 * Vercel trimite `Authorization: Bearer $CRON_SECRET` de la sine la rutele din
 * `crons`, deci nu e nimic de configurat in plus.
 */

// Trecerea are propriul buget de timp (`SCRAPER_SCAN_BUGET_MS`, implicit 240s),
// socotit sa se termine inaintea limitei de aici.
export const maxDuration = 300;

function autorizat(cerere: Request, secret: string): boolean {
  const antet = cerere.headers.get("authorization");
  return antet === `Bearer ${secret}`;
}

export async function GET(cerere: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return new Response("Not found", { status: 404 });
  if (!autorizat(cerere, secret)) return new Response("Not found", { status: 404 });

  const rezultat = await treceriZilnice();

  // Se scrie in logul functiei, fiindca acolo se uita omul cand se intreaba de ce
  // n-au mai crescut preturile. Un magazin la 0 din N e alarma.
  for (const m of rezultat.magazine) {
    console.log(
      `[preturi] ${m.magazin}: ${m.cuRezultate}/${m.termeni} termeni cu rezultate`,
    );
  }
  if (rezultat.sarit) console.log(`[preturi] sarit: ${rezultat.sarit}`);

  const cazut = esteCadereTotala(rezultat);
  if (cazut) console.error("[preturi] niciun magazin n-a dat nimic");

  // 500 numai la cadere totala, ca sa se vada in tabloul Vercel. O trecere in
  // care trei magazine au mers e o reusita.
  return Response.json(rezultat, { status: cazut ? 500 : 200 });
}
