import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Clientul Anthropic si parametrii de model.
 *
 * Cheia e optionala: fara ea aplicatia functioneaza integral in mod manual,
 * doar butoanele de generare cu AI sunt dezactivate. Nu vrem ca lipsa unei
 * chei sa impiedice o firma sa-si scrie devizele de mana.
 */

export const AI_MODEL = "claude-opus-5";

/** Devizele lungi ies pe multe tokeni; streaming ca sa nu expire cererea. */
export const AI_MAX_TOKENS = 32000;

/**
 * Estimarea cantitatilor e munca de rationament: din "casa P+1, 120 mp
 * amprenta" trebuie sa iasa perimetre, suprafete de pereti, scazute golurile.
 * Merita effort mare.
 */
export const AI_EFFORT = "high" as const;

/**
 * Citirea unei pagini de magazin e munca mecanica, nu rationament de deviz: se
 * cauta produsele care sunt acolo, nu se deduce nimic. Efort mic si un plafon de
 * iesire pe masura listei de rezultate — cateva zeci de produse, nu un document.
 */
export const AI_EXTRAGERE_EFFORT = "low" as const;
export const AI_EXTRAGERE_MAX_TOKENS = 8000;

let cached: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function getAiClient(): Anthropic {
  if (!isAiConfigured()) {
    throw new Error(
      "Generarea cu AI nu este configurata. Adauga ANTHROPIC_API_KEY in fisierul .env.",
    );
  }
  cached ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return cached;
}
