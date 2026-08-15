/**
 * Citeste un flux SSE si apeleaza `onEvent` pentru fiecare mesaj complet.
 *
 * Folosit de ambele locuri care asculta generarea cu AI: crearea unui deviz nou
 * si adaugarea de linii intr-unul existent.
 */
export async function consumeEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Mesajele SSE sunt separate de linie goala; ultimul fragment poate fi
    // incomplet, deci ramane in buffer pana la urmatoarea citire.
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        // Fragment corupt — il ignoram si continuam fluxul.
      }
    }
  }
}
