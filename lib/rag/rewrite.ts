// Lightweight Spanish legal-query normalizer to improve KB recall.
// No AI call, just synonym expansion & spelling normalization.
export function rewriteEs(q: string): string {
  let s = (q || "").trim();

  // Normalize accents/spacing for matching
  const norm = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();

  const n = norm(s);

  // Common variants → canonical terms used in the KB
  const expansions: Array<[RegExp, string]> = [
    // Grandchildren of Spaniards → frames LMD / art. 20 CC
    [/\b(nieto|nieta|nietos|nietas) de (espanol(es)?|espanola(s)?)\b/, "descendiente de españoles por LMD (Ley 20/2022) y art. 20 CC"],
    [/\b(opta(r)?|solicita(r)?|tramita(r)?)( la)? nacionalidad espan(ol|ola)a\b/, "nacionalidad española por opción"],

    // Law names
    [/\bley de memoria( democratica)?\b/, "Ley 20/2022 de Memoria Democrática"],
    [/\b(lmd)\b/, "Ley 20/2022 de Memoria Democrática"],

    // Ministry / models
    [/\bmodelo(s)?\s*ex-?0?3\b/, "Modelos EX-03"],
  ];

  let rewritten = s;
  for (const [re, rep] of expansions) {
    if (re.test(n)) rewritten += `; ${rep}`;
  }

  // Add gentle anchors that help vector search
  const anchors: string[] = [];
  if (/\bnacionalidad\b/.test(n)) anchors.push("Código Civil art. 20", "BOE Ley 20/2022");
  if (/\bnieto/.test(n)) anchors.push("descendientes de españoles", "acreditación filiación/abuelos");
  if (anchors.length) rewritten += `; ${anchors.join("; ")}`;

  return rewritten;
}