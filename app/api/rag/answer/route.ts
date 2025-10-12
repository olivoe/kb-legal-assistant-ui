// app/api/rag/answer/route.ts
import { NextRequest } from "next/server";
import { genRequestId } from "@/lib/server/reqid";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";
import { webFallback } from "@/lib/rag/web";
import { logChatSession } from "@/lib/logging/session-logger-pg";
import crypto from "crypto";

export const runtime = "nodejs";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";

const GUIDANCE_TEXT =
  "En el contexto de la Inmigración a España, ‘tasas estudiantes actualizadas’ puede referirse a: [A] tasas de visado de estudiante, [B] tasas de expedición/renovación de TIE para estudiantes, [C] tasas administrativas en sedes oficiales. Indica el contexto específico (tipo de trámite, organismo o año) para afinar la respuesta.";

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "<no body>";
  }
}

// Permissive domain classifier: accept Spanish/immigration questions, only reject if clearly about other countries
function isInSpanishImmigrationDomainStrict(
  original: string, 
  rewritten?: string,
  conversationHistory?: Array<{role: string, content: string}>
): boolean {
  const texts = [original || "", rewritten || ""].map((t) => t.toLowerCase());
  
  // Only reject if clearly about OTHER countries' immigration (US, Canada, Portugal, etc.)
  const clearlyOtherCountries = [
    "h-1b", "h1b", "h1-b", "h 1b", "h‑1b",
    "uscis", "green card", "social security number usa",
    "b1/b2", "f-1 visa usa", "j-1 visa usa",
    "united states immigration", "canadian immigration", "canada immigration",
    "australian immigration", "australia immigration",
    "portugal", "portuguesa", "portugués", "portugues", "nacionalidad portuguesa",
    "en portugal", "de portugal", "desde portugal",
  ];
  if (texts.some((s) => clearlyOtherCountries.some((k) => s.includes(k)))) return false;
  
  // PERMISSIVE: Accept by default if it's in Spanish or mentions any immigration-related terms
  // This includes: greetings, immigration words, legal terms, document requests, questions
  const inDomainIndicators = [
    // Spanish greetings and common words
    "hola", "buenos", "dias", "tardes", "ayuda", "necesito", "quiero", "puedo", "como", "donde", "cuando", "que",
    "gracias", "favor", "informacion", "información",
    
    // Immigration general terms
    "inmigracion", "inmigración", "migracion", "migración", "extranjeria", "extranjería",
    "visa", "visado", "pasaporte", "permiso", "autorizacion", "autorización",
    "residencia", "nacionalidad", "ciudadania", "ciudadanía",
    "refugio", "refugiado", "asilo", "asilado",
    "estudiante", "trabajo", "familia", "matrimonio", "hijo", "hija", "padre", "madre",
    "esposa", "esposo", "conyuge", "cónyuge", "pareja", "viudo", "viuda",
    "documento", "formulario", "solicitud", "tramite", "trámite", "procedimiento",
    "requisitos", "plazo", "fecha", "tiempo", "duracion", "duración",
    "comunicacion", "comunicación", "comunicar", "notificar", "notificacion", "notificación",
    "fallecimiento", "fallecido", "fallecida", "defuncion", "defunción", "muerte", "muerto", "muerta",
    "presentar", "presentacion", "presentación", "inscribir", "inscripcion", "inscripción",
    
    // Spain-specific economic/legal indicators used in immigration
    "iprem", "i.p.r.e.m", "indicador publico", "indicador público",
    "salario minimo", "salario mínimo", "smipg", "s.m.i",
    "empadronamiento", "empadronar", "padron", "padrón",
    "tasa", "tasas", "precio publico", "precio público",
    
    // Spain-specific immigration terms
    "españa", "espana", "español", "española", "nie", "tie",
    "boe", "ministerio", "sede", "electronica", "electrónica",
    "modelo ex", "arraigo", "reagrupacion", "reagrupación",
    "tarjeta comunitaria", "regimen comunitario", "régimen comunitario",
    
    // Countries (likely asking about immigration TO Spain FROM these)
    "venezuela", "colombia", "ecuador", "peru", "argentina", "mexico", "bolivia",
    "chile", "uruguay", "paraguay", "cuba", "nicaragua", "honduras",
    
    // Follow-up patterns (with and without accents)
    /^(y|si|como|cómo|donde|dónde|cuando|cuándo|que|qué|por|para|con|sin|sobre)/i,
    /cuanto|cuánto|cuanta|cuánta|precio|costo|valor/i,
    /^(hago|hago|realizo|efectuo|efectúo|presento)/i,
  ];
  
  // Accept if ANY indicator is present in the current question
  const currentQuestionInDomain = texts.some((s) => 
    inDomainIndicators.some((indicator) => {
      if (typeof indicator === 'string') {
        return s.includes(indicator);
      } else {
        return indicator.test(s);
      }
    })
  );
  
  if (currentQuestionInDomain) return true;
  
  // If no direct indicators, check conversation history
  // If recent conversation was about immigration, treat follow-ups as in-domain
  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-4); // Last 2 exchanges
    const historyText = recentHistory
      .map(msg => msg.content)
      .join(" ")
      .toLowerCase();
    
    const historyInDomain = inDomainIndicators.some((indicator) => {
      if (typeof indicator === 'string') {
        return historyText.includes(indicator);
      } else {
        return indicator.test(historyText);
      }
    });
    
    if (historyInDomain) return true;
  }
  
  return false;
}

function logRouteMetrics(data: Record<string, unknown>) {
  try { console.log(JSON.stringify({ level: "info", event: "rag.route", ...data })); } catch {}
}

function getOutOfDomainMessage(): string {
  const messages = [
    "Parece que su consulta no está relacionada con temas de Inmigración y Residencia en España. Esta IA se especializa únicamente en Inmigración, Residencia y Nacionalidad española. Si considera que esto es un error, por favor reformule su pregunta con más detalles específicos sobre inmigración.",
    
    "Su pregunta parece referirse a temas fuera del ámbito de la Inmigración española. Este asistente está especializado en cuestiones sobre Inmigración a España, Residencia y Nacionalidad. Si cree que se trata de un malentendido, intente replantear su consulta con más contexto sobre el procedimiento migratorio.",
    
    "No he podido identificar su consulta como relacionada con Inmigración a España. Mi especialidad son los trámites de Inmigración, Residencia y Nacionalidad española. Si piensa que esto es un error, le sugiero que amplíe su pregunta incluyendo más información sobre el proceso migratorio que le interesa.",
    
    "Parece que está preguntando sobre un tema que no se relaciona con la Inmigración española. Esta IA está diseñada para asistir exclusivamente en cuestiones de Inmigración, Residencia y obtención de Nacionalidad en España. Si esto no es correcto, reformule su pregunta con detalles adicionales sobre el trámite de extranjería.",
    
    "Su pregunta no parece estar vinculada con Inmigración y Residencia en España. Este sistema se especializa en proporcionar información sobre Inmigración a España, autorizaciones de Residencia y Nacionalidad española. Si considera que ha habido un error de interpretación, intente expresar su consulta de manera más específica en relación con procedimientos migratorios.",
  ];
  
  // Select a random message
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
}

type EnrichedKBHit = {
  id: string;
  score: number;
  meta: any;
  snippet: string;
  relPath: string | null;
  url: string | null; // KB items: null
};

type EnrichedWebHit = {
  id: string; // e.g. web#0
  score: number; // keep 0 for web to avoid confusion
  meta: null;
  snippet: string;
  relPath: null;
  url: string; // non-null
};

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  try {
    // Adjusted defaults: topK=8 for more context, minScore=0.30 for better quality
    const { question, topK = 8, minScore = 0.30, kbOnly = true, conversationHistory = [] } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json", "x-request-id": reqId },
      });
    }
    if (typeof question !== "string" || question.trim().length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Missing question" }), {
        status: 400,
        headers: { "content-type": "application/json", "x-request-id": reqId },
      });
    }

    // 1) Load KB + embed query
    const origin = req.nextUrl.origin;
    const { dim } = await loadKB(origin);

    const qVec = await embedText(question);
    if (!Array.isArray(qVec) || qVec.length !== dim) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Embedding dim mismatch. KB=${dim}, q=${qVec?.length ?? 0}`,
        }),
        { status: 500, headers: { "content-type": "application/json", "x-request-id": reqId } }
      );
    }

    // 2) KB search + domain routing
    const inDomain = isInSpanishImmigrationDomainStrict(question, question, conversationHistory);
    const hits = await searchKB(qVec, { k: topK, minScore });
    const topScore = hits[0]?.score ?? 0;

    // 3) Enrich KB hits with snippets/relPath
    const kbEnriched: EnrichedKBHit[] = await Promise.all(
      hits.map(async (h) => {
        const metaInfo = await loadSnippetFromMeta(h.meta as any);
        const { snippet, relPath } = metaInfo;
        // tolerate older return types that lacked `url`
        const url = (metaInfo as any)?.url ?? null;
        return {
          id: h.id,
          score: h.score,
          meta: h.meta,
          snippet: snippet ?? "",
          relPath: relPath ?? null,
          url: url ?? null, // KB items normally null
        };
      })
    );

    // 4) Optional web fallback (only when kbOnly=false and confidence is weak OR volatile topic)
    //    Heuristic: no KB hits OR topScore below 0.70 (stricter threshold for better quality)
    const isVolatile = /tasas|formularios|convocatoria|convocatorias|actualizada|vigente|última|ultima/i.test(question);
    let webEnriched: EnrichedWebHit[] = [];
    const attemptedFallback = !kbOnly && (kbEnriched.length === 0 || topScore < 0.70 || isVolatile);
    let fallbackQueryUsed: string | null = null;
    if (attemptedFallback) {
      const primary = isVolatile
        ? `${question} España tasas estudiante site:boe.es OR site:exteriores.gob.es OR site:sepe.es OR site:inclusion.gob.es OR site:boe.es/boe`
        : `${question} España`;
      fallbackQueryUsed = primary;
      let web = await webFallback(primary, 3);
      if (!web || web.length === 0) {
        const secondary = `${question} España tasas estudiantes site:universia.es OR site:europa.eu OR site:boe.es`;
        web = await webFallback(secondary, 3);
        fallbackQueryUsed = secondary;
      }
      webEnriched = (web || [])
        .filter((w) => !!w.url)
        .map((w, i) => ({
          id: `web#${i}`,
          score: 0,
          meta: null,
          snippet: w.snippet || "",
          relPath: null,
          url: w.url!,
        }));
    }

    // 5) Combine evidence
    const allEnriched = [...kbEnriched, ...webEnriched];

    // Hard gate: always specialize when out-of-domain
    if (!inDomain) {
      const ms = Date.now() - t0;
      const outOfDomainMsg = getOutOfDomainMessage();
      logRouteMetrics({ reqId, inDomain, route: "specialization", topScore, topK, minScore, ms });
      
      // Log out-of-domain session
      try {
        const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
        const userAgent = req.headers.get("user-agent") || undefined;
        const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
        const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
        
        await logChatSession({
          sessionId,
          timestamp: new Date().toISOString(),
          question,
          answer: outOfDomainMsg,
          conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
          metadata: {
            topK,
            minScore,
            kbOnly,
            route: "OUT_OF_DOMAIN",
            topScores: [],
            topScore: 0,
            responseTimeMs: ms,
            model: CHAT_MODEL,
            inDomain: false,
          },
          requestId: reqId,
          userAgent,
          ipHash,
        });
      } catch (logErr) {
        console.error("Failed to log out-of-domain session:", logErr);
      }
      
      return new Response(
        JSON.stringify({
          ok: true,
          question,
          answer: outOfDomainMsg,
          citations: [],
          reqId,
          runtime_ms: ms,
        }),
        { status: 200, headers: { "content-type": "application/json", "x-request-id": reqId, "x-runtime-ms": String(ms) } }
      );
    }

    if (allEnriched.length === 0) {
      const ms = Date.now() - t0;
      logRouteMetrics({ reqId, inDomain, route: "unsure", topScore, topK, minScore, ms });
      const payload = {
        ok: true,
        question,
        answer: GUIDANCE_TEXT,
        citations: [],
        reqId,
        runtime_ms: ms,
      };
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-request-id": reqId,
        "x-runtime-ms": String(ms),
        "x-route": "GUIDANCE",
      };
      if (fallbackQueryUsed) headers["x-fallback-query"] = fallbackQueryUsed;
      return new Response(JSON.stringify(payload), { status: 200, headers });
    }

    // 6) Build context blocks (show source location or URL)
    const ctxBlocks = allEnriched
      .map((h, i) => {
        const loc =
          h.url ??
          `${h.meta?.file ?? ""}${h.meta?.start != null && h.meta?.end != null ? ` [${h.meta.start}-${h.meta.end}]` : ""}`;
        const snip = (h.snippet ?? "").slice(0, 3000);
        return `#${i + 1} ${loc}\n${snip}`;
      })
      .join("\n\n---\n\n");

    // 7) Ask the LLM (guardrails: only use provided context)
    // Build message array with conversation history
  const systemMessage = {
    role: "system" as const,
    content: `Eres un asistente legal especializado en Derecho de Inmigración Español. Sigue estas reglas estrictamente:

MANEJO DE CONVERSACIÓN Y SEGUIMIENTO:
⚠️ PRIORIDAD MÁXIMA: Si existe un historial de conversación previo:
1. LEE TODO el historial de conversación antes de responder
2. Identifica si la pregunta actual es un SEGUIMIENTO de temas previos
3. Si la pregunta actual menciona conceptos vagos (ej: "la solicitud", "ese plazo", "esos documentos"), ASUME que se refiere al tema de la conversación previa
4. Usa la información de tus respuestas anteriores para dar contexto a la pregunta actual
5. Las preguntas como "¿qué pasa si...?", "¿y si...?", "¿cuánto cuesta?" generalmente se refieren al tema que acabas de explicar

DIRECTRICES DE RESPUESTA:
1. SOLO usa la información de los fragmentos de contexto proporcionados Y tu historial de conversación
2. Si la información no está en el contexto ni en el historial, indícalo claramente en lugar de inventar
3. Cita los documentos específicos cuando los menciones (ej: "Según BOE-A-2022-xxx..." o "De acuerdo con la Instrucción DGI...")
4. Estructura tus respuestas de manera clara con puntos cuando sea apropiado
5. Usa lenguaje profesional pero accesible en español

EXTRACCIÓN DE LEYES Y NORMATIVA:
- Extrae nombres de leyes, números y referencias incluso si no están etiquetados explícitamente como "nombre oficial"
- Busca patrones como "Ley X/YYYY", "Ley de [Nombre]", "Real Decreto X/YYYY", etc.
- Si el contexto menciona una ley con su número, úsalo en tu respuesta
- CRÍTICO: NUNCA inventes números de leyes, decretos o normativas que no aparezcan textualmente en el contexto
- Si no encuentras el número exacto en el contexto, di "no se especifica el número de la ley en los documentos proporcionados"

EXTRACCIÓN DE LISTAS Y REQUISITOS:
- Cuando el contexto contenga listas numeradas o con viñetas (requisitos, documentos, pasos), extrae y presenta la LISTA COMPLETA
- Mantén la estructura y numeración original de las listas
- Si una lista tiene sub-items (a, b, c), inclúyelos todos
- NO digas "no se especifica" si la lista completa está en el contexto - extráela íntegramente
- Cuando el usuario pida "lista completa" o "todos los documentos/requisitos", asegúrate de incluir TODOS los ítems presentes en el contexto

MANEJO DE INFORMACIÓN INCOMPLETA:
- Si el contexto no contiene información específica sobre fechas, tasas actualizadas, o procedimientos vigentes, indica: "La información específica sobre [tema] requiere verificación actualizada"
- Para preguntas sobre plazos o requisitos específicos, cita la fuente del documento
- Si hay información contradictoria, menciona ambas fuentes

RECOMENDACIONES PROFESIONALES:
- Cuando la consulta requiera asesoramiento personalizado o actualización de datos específicos, sugiere: "Para obtener asesoramiento personalizado y actualizado sobre su caso particular, le recomendamos contactar con Olivo Galarza Abogados"
- NO uses referencias genéricas como "contactar con un especialista", "consultar con un abogado", "acudir a un profesional" o similares - SOLO usa la recomendación específica de "Olivo Galarza Abogados" cuando sea necesario
- Si el contexto menciona "contactar con un especialista" o similar, OMITE esa parte y usa únicamente la recomendación de Olivo Galarza Abogados al final si es pertinente
- NO inventes datos, fechas, cantidades, ni números de leyes que no estén en el contexto

ACRONIMOS Y TÉRMINOS:
- Al mencionar acronimos por primera vez, proporciona su significado completo (ej: "TIE (Tarjeta de Identidad de Extranjero)")
- Explica términos técnicos de manera accesible

FORMATO DE CITAS:
- Referencia los documentos del contexto cuando proporciones información específica
- Si mencionas normativa, indica el documento exacto del contexto que lo respalda`,
  };

    // Include conversation history (limit to last 4 exchanges to avoid token overflow)
    const recentHistory = Array.isArray(conversationHistory) 
      ? conversationHistory.slice(-8) // Last 4 Q&A pairs (8 messages)
      : [];

    const messages = [
      systemMessage,
      ...recentHistory,
      { role: "user" as const, content: `Pregunta: ${question}\n\nContexto (fragmentos de documentos oficiales):\n${ctxBlocks}` },
    ];

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0.3, max_tokens: 2500 }),
    });

    if (!resp.ok) {
      const errText = await safeText(resp);
      return new Response(JSON.stringify({ ok: false, error: `LLM error ${resp.status}: ${errText}` }), {
        status: 500,
        headers: { "content-type": "application/json", "x-request-id": reqId },
      });
    }

    const json = await resp.json();
    const answer = json?.choices?.[0]?.message?.content ?? "";

    // 8) Shape citations (KB + web)
    const citations = allEnriched.map((h) => ({
      id: h.id,
      score: h.score,
      file: h.meta?.file ?? null,
      start: h.meta?.start ?? null,
      end: h.meta?.end ?? null,
      snippet: (h.snippet ?? "").slice(0, 300),
      relPath: h.relPath ?? null,
      url: h.url ?? null, // web hits will have a non-null URL
    }));

    const ms = Date.now() - t0;
    const actualRoute = webEnriched.length > 0 ? "kb+web" : "kb";
    logRouteMetrics({ reqId, inDomain, route: actualRoute, topScore, topK, minScore, ms });
    
    // Log successful chat session
    try {
      const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
      const userAgent = req.headers.get("user-agent") || undefined;
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
      const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
      
      await logChatSession({
        sessionId,
        timestamp: new Date().toISOString(),
        question,
        answer,
        conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
        metadata: {
          topK,
          minScore,
          kbOnly,
          route: actualRoute.toUpperCase().replace("+", "_"),
          topScores: hits.map((h) => h.score),
          topScore,
          responseTimeMs: ms,
          model: CHAT_MODEL,
          inDomain,
          sources: allEnriched.slice(0, 5).map((h) => ({
            id: h.id,
            score: h.score,
            file: h.meta?.file || null,
            snippet: h.snippet?.slice(0, 200),
          })),
        },
        requestId: reqId,
        userAgent,
        ipHash,
      });
    } catch (logErr) {
      console.error("Failed to log chat session:", logErr);
    }
    
    return new Response(
      JSON.stringify({
        ok: true,
        question,
        answer,
        citations,
        reqId,
        runtime_ms: ms,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": reqId,
          "x-runtime-ms": String(ms),
        },
      }
    );
  } catch (err: any) {
    const ms = Date.now() - t0;
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { "content-type": "application/json", "x-request-id": reqId, "x-runtime-ms": String(ms) },
    });
  }
}