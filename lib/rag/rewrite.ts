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
    [/\bmodelo(s)?\s*ex-?0?1\b/, "Modelos EX-01"],
    [/\bmodelo(s)?\s*ex-?0?2\b/, "Modelos EX-02"],
    [/\bmodelo(s)?\s*ex-?1?5\b/, "Modelos EX-15"],
    [/\bmodelo(s)?\s*ex-?1?8\b/, "Modelos EX-18"],
    
    // Residence types
    [/\barraigo (social|laboral|familiar)\b/, "arraigo $1 requisitos autorización residencia"],
    [/\bresidencia (temporal|permanente)\b/, "autorización residencia $1 España"],
    [/\bresidencia por trabajo\b/, "autorización residencia y trabajo"],
    [/\btarjeta (comunitaria|familiar)\b/, "tarjeta $1 régimen comunitario"],
    
    // Student-specific terms
    [/\b(estancia|residencia) de estudiante(s)?\b/, "autorización estancia por estudios visa estudiante"],
    [/\b(renovacion|prorroga) estudiante(s)?\b/, "renovación autorización estancia estudios"],
    [/\bautorizacion de regreso\b/, "autorización de regreso estudiante extranjería"],
    [/\bestudiar (en|y) trabajar\b/, "compatibilidad estudios trabajo autorización estudiante"],
    
    // Asylum and refugees
    [/\b(solicitar|solicitud de) asilo\b/, "protección internacional asilo España procedimiento"],
    [/\brefugiado\b/, "estatuto refugiado protección internacional"],
    [/\bproteccion subsidiaria\b/, "protección subsidiaria internacional España"],
    
    // Family reunification
    [/\breagrupacion familiar\b/, "reagrupación familiar extranjería requisitos"],
    [/\breagrupacion de (hijos|padres|conyuge)\b/, "reagrupación familiar $1 requisitos documentación"],
    
    // Nationality - comprehensive paths
    [/\b(todas las|todos los) (formas?|manera|maneras|modo|modos|via|vias|camino|caminos|opciones?) (de|para|a) (obtener|adquirir|conseguir|optar|solicitar)( la)? nacionalidad\b/, "nacionalidad española por residencia por opción por matrimonio por carta de naturaleza"],
    [/\b(como|cuales?|que) (formas?|manera|maneras|modo|modos|via|vias|camino|caminos|opciones?) (de|para|a|hay|existen) (obtener|adquirir|conseguir|optar|solicitar)( la)? nacionalidad\b/, "nacionalidad española por residencia por opción por matrimonio por carta de naturaleza"],
    [/\bnacionalidad por residencia\b/, "nacionalidad española residencia 10 años 2 años 1 año requisitos"],
    [/\bnacionalidad por matrimonio\b/, "nacionalidad española cónyuge español 1 año residencia requisitos"],
    [/\bnacionalidad (sefardi|hispanoamericana)\b/, "nacionalidad española origen $1"],
    [/\bnacionalidad por (opcion|optar)\b/, "nacionalidad española opción descendiente español nietos"],
    
    // Work authorization
    [/\b(cuenta ajena|cuenta propia)\b/, "autorización trabajo $1 residencia"],
    [/\bautorizacion inicial trabajo\b/, "autorización inicial residencia trabajo"],
    
    // NIE/TIE documents
    [/\b(nie|numero de identidad de extranjero)\b/, "NIE número identidad extranjero solicitud"],
    [/\b(tie|tarjeta de identidad de extranjero)\b/, "TIE tarjeta identidad extranjero expedición"],
    [/\bcanjear (nie|tie)\b/, "renovación expedición TIE"],
    
    // Fees and procedures
    [/\btasas? (modelo 790|tasa 052)\b/, "tasa modelo 790 código 052 extranjería"],
    // Law firm prices / fees synonyms → align to document wording
    [/\b(precio|precios|cuesta|coste|costo|tarifa|tarifas|honorarios|cobran|cobro|cobrar)\b/, "precio honorarios asesoría servicios"],
    [/\bolivo(\s+galarza)?\b/, "Olivo Galarza Abogados"],
    [/\b(cita previa|pedir cita)\b/, "cita previa extranjería oficina"],
    [/\bhuellas? (dactilares?|digitales?)\b/, "toma huellas TIE extranjería"],
    
    // Document requirements
    [/\bantecedentes penales\b/, "certificado antecedentes penales apostilla"],
    [/\bseguro medico\b/, "seguro médico cobertura sanitaria extranjería"],
    [/\bmedios economicos\b/, "acreditación medios económicos suficientes"],
    [/\bcontrato de trabajo\b/, "contrato trabajo autorización residencia"],
  ];

  let rewritten = s;
  for (const [re, rep] of expansions) {
    if (re.test(n)) rewritten += `; ${rep}`;
  }

  // Add gentle anchors that help vector search
  const anchors: string[] = [];
  if (/\b(todas las|todos los) (formas?|manera|maneras|modo|modos|via|vias|opciones?)\b.*\bnacionalidad\b/.test(n)) {
    anchors.push("nacionalidad por residencia", "nacionalidad por opción", "nacionalidad por matrimonio", "nacionalidad por carta de naturaleza", "requisitos nacionalidad española");
  } else if (/\bnacionalidad\b/.test(n)) {
    anchors.push("Código Civil art. 20", "BOE Ley 20/2022", "requisitos nacionalidad española");
  }
  if (/\bnieto/.test(n)) anchors.push("descendientes de españoles", "acreditación filiación/abuelos");
  if (/\btasas?\b/.test(n)) anchors.push("modelo 790", "código 052", "importe tasas");
  if (/\b(estudiante|estudios)\b/.test(n)) anchors.push("estancia por estudios", "autorización estudiante", "visa estudiante");
  if (/\barraigo\b/.test(n)) anchors.push("arraigo social", "arraigo laboral", "arraigo familiar");
  if (/\basilo\b/.test(n)) anchors.push("protección internacional", "solicitud asilo", "estatuto refugiado");
  if (/\b(nie|tie)\b/.test(n)) anchors.push("número identidad extranjero", "tarjeta identidad extranjero");
  if (/\breagrupacion\b/.test(n)) anchors.push("reagrupación familiar", "requisitos reagrupación");
  
  if (anchors.length) rewritten += `; ${anchors.join("; ")}`;

  // Price intent + brand emphasis anchors to improve recall for firm FAQ
  const hasPrice = /\b(precio|precios|cuesta|coste|costo|tarifa|tarifas|honorarios|cobran|cobro|cobrar)\b/.test(n);
  const mentionsFirm = /\bolivo(\s+galarza)?\b/.test(n);
  if (hasPrice) anchors.push("precio honorarios asesoría servicios");
  if (mentionsFirm || hasPrice) anchors.push("Olivo Galarza Abogados", "preguntas frecuentes", "asesoría");
  if (anchors.length) rewritten += `; ${anchors.join("; ")}`;

  return rewritten;
}