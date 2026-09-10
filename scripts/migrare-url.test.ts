import { describe, expect, it } from "vitest";
import { directDinPooled, parePooled, urlPentruMigrare } from "./migrare-url.mjs";

/**
 * Alegerea conexiunii pe care merg migrarile.
 *
 * Se testeaza fiindca greseala aici nu se vede la `npm test` si nici la
 * `npm run build` local: se vede pe Vercel, ca P1002 pe advisory lock, un mesaj
 * care arata a baza cazuta. Exact asa a picat deploy-ul din 10 septembrie.
 */

/** Ce alege scriptul, cu null-ul deja dat afara: fara DATABASE_URL se testeaza separat. */
function alege(env: Record<string, string | undefined>) {
  const ales = urlPentruMigrare(env);
  if (ales === null) throw new Error("asteptam o conexiune, n-a venit niciuna");
  return ales;
}

const POOLED =
  "postgresql://neondb_owner:parola@ep-mute-rain-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";

describe("urlPentruMigrare", () => {
  it("intoarce null fara DATABASE_URL, ca build-ul sa sara peste migrari", () => {
    expect(urlPentruMigrare({})).toBeNull();
  });

  it("DIRECT_URL bate orice deducere", () => {
    const ales = alege({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: "postgresql://x@alta/neondb",
      DIRECT_URL: "postgresql://scris:demana@direct.exemplu/neondb",
    });
    expect(ales.sursa).toBe("DIRECT_URL");
    expect(ales.url).toBe("postgresql://scris:demana@direct.exemplu/neondb");
  });

  it("ia DATABASE_URL_UNPOOLED, pe care il pune integrarea Neon-Vercel", () => {
    const ales = alege({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-mute-rain-123456.us-east-2.aws.neon.tech/neondb",
    });
    expect(ales.sursa).toBe("DATABASE_URL_UNPOOLED");
  });

  it("ia si POSTGRES_URL_NON_POOLING, celalalt nume pus de integrare", () => {
    const ales = alege({
      DATABASE_URL: POOLED,
      POSTGRES_URL_NON_POOLING: "postgresql://u:p@ep-mute-rain-123456.us-east-2.aws.neon.tech/neondb",
    });
    expect(ales.sursa).toBe("POSTGRES_URL_NON_POOLING");
  });

  it("deduce conexiunea directa scotand -pooler din numele gazdei", () => {
    const ales = alege({ DATABASE_URL: POOLED });
    expect(ales.sursa).toBe("dedus");
    expect(ales.url).toBe(
      "postgresql://neondb_owner:parola@ep-mute-rain-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
    );
  });

  it("lasa neatinsa o conexiune care nu pare pooled", () => {
    const local = "postgresql://devizor:devizor@127.0.0.1:5432/devizor?schema=public";
    const ales = alege({ DATABASE_URL: local });
    expect(ales).toEqual({ url: local, sursa: "DATABASE_URL", pooled: false });
  });

  it("spune ca e pooled cand nu are de unde deduce una directa", () => {
    const ales = alege({
      DATABASE_URL: "postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
    });
    expect(ales.sursa).toBe("DATABASE_URL");
    expect(ales.pooled).toBe(true);
  });
});

describe("directDinPooled", () => {
  it("scoate parametrii care tin numai de pgbouncer", () => {
    const dedus = directDinPooled(
      "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db?sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=0",
    );
    expect(dedus).toBe("postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/db?sslmode=require");
  });

  it("nu lasa un semn de intrebare gol cand nu mai ramane niciun parametru", () => {
    const dedus = directDinPooled("postgresql://u:p@ep-x-pooler.aws.neon.tech/db?pgbouncer=true");
    expect(dedus).toBe("postgresql://u:p@ep-x.aws.neon.tech/db");
  });

  // De aia nu se trece prin `new URL()`: acela reincodeaza acreditarile, si o
  // parola cu semne ar iesi schimbata, cu o conexiune refuzata dintr-un motiv
  // care n-are legatura cu pooling-ul.
  it("nu atinge parola, oricum ar fi scrisa", () => {
    const dedus = directDinPooled(
      "postgresql://user:p%40ss w%2Frd@ep-x-pooler.aws.neon.tech/db?sslmode=require",
    );
    expect(dedus).toBe("postgresql://user:p%40ss w%2Frd@ep-x.aws.neon.tech/db?sslmode=require");
  });

  it("nu se incurca intr-un `@` din parola", () => {
    const dedus = directDinPooled("postgresql://user:a@b@ep-x-pooler.aws.neon.tech/db");
    expect(dedus).toBe("postgresql://user:a@b@ep-x.aws.neon.tech/db");
  });

  it("intoarce null cand n-are ce deduce", () => {
    expect(directDinPooled("postgresql://u:p@localhost:5432/devizor")).toBeNull();
    expect(directDinPooled("nu e un url")).toBeNull();
  });
});

describe("parePooled", () => {
  it("recunoaste gazda cu -pooler si parametrul pgbouncer", () => {
    expect(parePooled(POOLED)).toBe(true);
    expect(parePooled("postgresql://u:p@gazda/db?pgbouncer=true")).toBe(true);
  });

  it("nu ia drept pooled o conexiune obisnuita", () => {
    expect(parePooled("postgresql://devizor:devizor@127.0.0.1:5432/devizor")).toBe(false);
  });
});
