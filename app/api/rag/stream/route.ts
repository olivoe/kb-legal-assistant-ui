// app/api/rag/stream/route.ts
import { NextRequest } from "next/server";
import { genRequestId } from "@/lib/server/reqid";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";
import { webFallback } from "@/lib/rag/web";
import { rewriteEs } from "@/lib/rag/rewrite";
import { logChatSession } from "@/lib/logging/session-logger-pg";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";
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
    
    // Spanish nationality laws
    "ley de memoria", "memoria democratica", "memoria democrática",
    "ley de nietos", "nietos", "bisnietos",
    "ley de memoria historica", "memoria histórica", "memoria historica",
    
    // Countries (likely asking about immigration TO Spain FROM these)
    "venezuela", "colombia", "ecuador", "peru", "argentina", "mexico", "bolivia",
    "chile", "uruguay", "paraguay", "cuba", "nicaragua", "honduras",
    
    // Follow-up patterns (with and without accents)
    /^(y|si|como|cómo|donde|dónde|cuando|cuándo|que|qué|por|para|con|sin|sobre)/i,
    /cuanto|cuánto|cuanta|cuánta|precio|costo|valor/i,
    /^(hago|hago|realizo|efectuo|efectúo|presento)/i,
  ];
  
  // CRITICAL: If there's conversation history, check it FIRST before checking current question
  // This allows follow-up questions to be in-domain even if they don't contain immigration keywords
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
    
    // If conversation history is about immigration, ALWAYS accept follow-ups
    // This includes questions like "cuales son?", "mencionaste X", "que significa eso?"
    if (historyInDomain) {
      // Additional check: make sure the question is a follow-up, not a completely new topic
      const clearlyNewTopic = [
        /^(ahora|otra pregunta|cambiando de tema|hablemos de|quiero preguntar sobre|nueva consulta)/i,
      ];
      
      const isNewTopic = clearlyNewTopic.some(pattern => texts.some(t => pattern.test(t)));
      
      if (!isNewTopic) {
        return true; // Accept as continuation of immigration conversation
      }
    }
  }
  
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

function sse(data: string) {
  return `data: ${data}\n\n`;
}
function ev(name: string, data?: any) {
  return `event: ${name}\n${data ? sse(JSON.stringify(data)).slice(5) : "\n"}`;
}

/**
 * Expands vague follow-up questions by incorporating recent conversation context
 */
function expandFollowUpQuery(question: string, conversationHistory: Array<{role: string, content: string}>): string {
  // If no history or question is already detailed, return as-is
  if (!conversationHistory || conversationHistory.length === 0) {
    return question;
  }
  
  // Check if question looks like a vague follow-up
  const vaguePatterns = [
    /^(qué pasa|y si|mientras|durante|cuando|puedo|debo|tengo que|necesito)/i,
    /\b(la solicitud|el plazo|ese plazo|esos documentos|ese trámite|la renovación|el proceso)\b/i,
    /^(sí|no|vale|ok|gracias|pero|entonces|ah)/i,
  ];
  
  const isVague = vaguePatterns.some(pattern => pattern.test(question));
  
  if (!isVague) {
    return question; // Question is already specific
  }
  
  // Get last user question from history to add context
  const recentHistory = conversationHistory.slice(-4); // Last 2 exchanges
  const lastUserMessage = recentHistory.filter(m => m.role === 'user').pop();
  const lastAssistantMessage = recentHistory.filter(m => m.role === 'assistant').pop();
  
  if (!lastUserMessage) {
    return question;
  }
  
  // Extract key topic from last exchange (first 100 chars of user + assistant messages)
  const topicContext = [
    lastUserMessage.content.slice(0, 100),
    lastAssistantMessage ? lastAssistantMessage.content.slice(0, 150) : ''
  ].filter(Boolean).join(' ');
  
  // Extract main topic/procedure name if present (arraigo, TIE, nacionalidad, etc.)
  const topicKeywords = [
    'homologación de título', 'homologación título', 'homologación',
    'convalidación de título', 'reconocimiento de título',
    'arraigo social', 'arraigo laboral', 'arraigo familiar', 'arraigo',
    'renovación TIE', 'renovación de tarjeta', 'renovación',
    'nacionalidad española', 'nacionalidad por residencia', 'nacionalidad por opción', 'nacionalidad',
    'reagrupación familiar', 'familiar comunitario', 'residencia comunitaria',
    'Ley de Memoria Democrática', 'Ley de Memoria', 'memoria democrática', 'Ley de Nietos', 'nietos',
    'autorización de residencia para emprendedores', 'emprendedores',
    'visado de estudiante', 'visado',
    'permiso de trabajo', 'autorización de residencia', 'TIE', 'tarjeta'
  ];
  
  // Find the most specific topic mentioned in the conversation
  const contextLower = topicContext.toLowerCase();
  const mainTopic = topicKeywords.find(keyword => contextLower.includes(keyword)) || '';
  
  // Expand the query by prepending context + emphasizing main topic
  if (mainTopic) {
    // For topics that commonly get confused, repeat the topic keyword multiple times
    // to increase its weight in the embedding (e.g., "homologación" vs "permiso de trabajo")
    const needsExtraEmphasis = [
      'homologación', 'convalidación', 'reconocimiento de título',
      'arraigo social', 'arraigo laboral', 'arraigo familiar',
      'Ley de Memoria', 'memoria democrática', 'Ley de Nietos'
    ];
    
    const needsEmphasis = needsExtraEmphasis.some(t => mainTopic.includes(t));
    
    if (needsEmphasis) {
      // Repeat topic 2 times to strengthen its presence in the embedding
      return `${mainTopic} ${mainTopic} ${topicContext} - ${question}`;
    }
    
    return `${mainTopic} ${topicContext} - ${question}`;
  }
  
  return `${topicContext} - ${question}`;
}

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  try {
    // Adjusted defaults: topK=8 for more context, minScore=0.30 for better quality
    const { question, topK = 8, minScore = 0.30, kbOnly = true, conversationHistory = [] } = await req.json();
    
    // Expand vague follow-up questions with conversation context, then apply Spanish rewriting
    const expandedQuery = expandFollowUpQuery(question, conversationHistory);
    const rewrittenQ = rewriteEs(expandedQuery);

    if (!process.env.OPENAI_API_KEY) {
      return new Response(sse(JSON.stringify({ ok: false, error: "Missing OPENAI_API_KEY" })), {
        status: 500,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }
    if (!question || typeof question !== "string" || !question.trim()) {
      return new Response(sse(JSON.stringify({ ok: false, error: "Missing question" })), {
        status: 400,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ---------- (A) Compute KB hits up-front so we can expose metrics via headers ----------
    const origin = req.nextUrl.origin;
    const { dim } = await loadKB(origin);
    const qVec = await embedText(rewrittenQ);    
    let hits: Array<{
      id: string;
      score: number;
      meta: any;
    }> = [];

    if (Array.isArray(qVec) && qVec.length === dim) {
      hits = await searchKB(qVec, { k: topK, minScore });
    }

    const topScores = (hits ?? []).map(h => h?.score ?? 0).slice(0, 5);
    const topScore = topScores[0] ?? 0;
    const inDomain = isInSpanishImmigrationDomainStrict(question, rewrittenQ, conversationHistory);
    const isVolatile = /tasas|formularios|convocatoria|convocatorias|actualizada|vigente|\bultima\b|\búltima\b|estudiante|estudiantes/i.test(rewrittenQ);
    let route = "KB_ONLY" as "KB_ONLY" | "KB_EMPTY" | "WEB_FALLBACK" | "GUIDANCE" | "SPECIALIZATION";
    if (hits.length > 0) route = "KB_ONLY";
    else if (kbOnly) route = "KB_EMPTY";
    else route = isVolatile ? "GUIDANCE" : "WEB_FALLBACK";

    // optional source log line
    try {
      console.log(JSON.stringify({
        level: "info",
        event: "rag.metrics.source",
        top_scores: topScores,
        top_score: topScore,
        MIN_SCORE: minScore,
        TOP_K: topK,
        route,
        ts: new Date().toISOString(),
      }));
    } catch {}
    // --------------------------------------------------------------------------------------

    // Hard gate: if out-of-domain, immediately stream specialization message and return
    if (!inDomain) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const outOfDomainMsg = getOutOfDomainMessage();
      
      (async () => {
        await writer.write(sse(JSON.stringify({ delta: outOfDomainMsg })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
        
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
              rewrittenQuery: rewrittenQ,
              inDomain: false,
            },
            requestId: reqId,
            userAgent,
            ipHash,
          });
        } catch (logErr) {
          console.error("Failed to log out-of-domain session:", logErr);
        }
        
        await writer.close();
      })();

      const sseHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Expose-Headers":
          "x-probe, x-rag-top-score, x-rag-topk, x-rag-min-score, x-route, x-domain",
        "x-probe": "rag-sse-headers-2",
        "x-rag-top-score": String(topScore),
        "x-rag-topk": String(topK),
        "x-rag-min-score": String(minScore),
        "x-route": "OUT_OF_DOMAIN",
        "x-domain": "out",
      };
      return new Response(readable, { status: 200, headers: sseHeaders });
    }

    // Create our TransformStream AFTER computing hits so headers are ready
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    (async () => {
      // 1) init + meta
      await writer.write(ev("init", { ok: true }));
      await writer.write(sse(JSON.stringify({
        event: "meta",
        reqId,
        topK,
        minScore,
        kbOnly,
        q_original: question,
        q_rewritten: rewrittenQ
      })));      

      // 2) If embedding mismatch, short-circuit with error + done
      if (!Array.isArray(qVec) || qVec.length !== dim) {
        await writer.write(
          sse(JSON.stringify({ event: "error", reqId, error: `Embedding dim mismatch. KB=${dim}, q=${qVec?.length ?? 0}` })),
        );
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
        return;
      }

      // 3) Enrich KB hits with snippet/relPath (or web fallback)
      let enriched: Array<{
        id: string;
        score: number;
        meta: any;
        snippet?: string;
        relPath?: string | null;
        url?: string | null;
      }> = [];
      let actualRoute = route; // Track actual route used

      if (hits.length > 0) {
        enriched = await Promise.all(
          hits.map(async (h) => {
            const metaInfo = await loadSnippetFromMeta(h.meta as any);
            const { snippet, relPath } = metaInfo;
            const url = (metaInfo as any)?.url ?? null;
            return { ...h, snippet, relPath, url };
          }),
        );
      } else if (!kbOnly) {
        // Use stricter threshold (0.70) for web fallback to ensure quality
        const needFallback = hits.length === 0 || topScore < 0.70 || isVolatile;
        let web: Array<{ snippet: string; url: string }> = [];
        if (needFallback) {
          const primary = isVolatile
            ? `${rewrittenQ} España tasas estudiante site:boe.es OR site:exteriores.gob.es OR site:sepe.es OR site:inclusion.gob.es`
            : `${rewrittenQ} España`;
          web = await webFallback(primary, 4);
          if (!web || web.length === 0) {
            const secondary = `${rewrittenQ} España tasas estudiantes site:universia.es OR site:europa.eu OR site:boe.es`;
            web = await webFallback(secondary, 4);
          }
        }
        enriched = (web || []).map((w, idx) => ({
          id: `web#${idx}`,
          score: 0,
          meta: { file: null, start: null, end: null },
          snippet: w.snippet ?? "",
          relPath: null,
          url: w.url ?? null,
        }));
        // Update route to reflect web usage
        if (enriched.length > 0) {
          actualRoute = isVolatile ? "GUIDANCE" : "WEB_FALLBACK";
        }
      }

      // 4) Emit sources early
      const citations = enriched.map((h) => ({
        id: h.id,
        score: h.score,
        file: h.meta?.file ?? null,
        start: h.meta?.start ?? null,
        end: h.meta?.end ?? null,
        snippet: (h.snippet ?? "").slice(0, 300),
        relPath: h.relPath ?? null,
        url: h.url ?? null,
      }));
      await writer.write(sse(JSON.stringify({ event: "sources", citations })));

      // 5) Out-of-domain hard gate: specialization message when no evidence
      if (!inDomain && enriched.length === 0) {
        await writer.write(sse(JSON.stringify({ delta: getOutOfDomainMessage() })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
        return;
      }

      // 6) If still empty → guidance response
      if (enriched.length === 0) {
        const guidance = "En el contexto de la Inmigración a España, ‘tasas estudiantes actualizadas’ puede referirse a: [A] tasas de visado de estudiante, [B] tasas de expedición/renovación de TIE para estudiantes, [C] tasas administrativas en sedes oficiales. Indica el contexto específico (tipo de trámite, organismo o año) para afinar la respuesta.";
        await writer.write(sse(JSON.stringify({ delta: guidance })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms, route: "GUIDANCE" })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
        return;
      }

      // 7) Build context and stream LLM
      const ctxBlocks = enriched
        .map((h, i) => {
          const loc = `${h.meta?.file ?? ""} [${h.meta?.start ?? ""}-${h.meta?.end ?? ""}]`;
          const snip = (h.snippet ?? "").slice(0, 3000);
          return `#${i + 1} ${loc}\n${snip}`;
        })
        .join("\n\n---\n\n");

      // Build message array with conversation history
      const systemMessage = {
        role: "system" as const,
        content: `Eres un asistente legal especializado en Derecho de Inmigración Español. Sigue estas reglas estrictamente:

🚨 REGLA CRÍTICA DE CONVERSACIÓN - LEE ESTO PRIMERO:
⚠️⚠️⚠️ PRIORIDAD ABSOLUTA: Si existe un historial de conversación previo:

1. **IDENTIFICA EL TEMA PRINCIPAL DE LA CONVERSACIÓN:**
   - Lee TODO el historial antes de responder
   - Identifica el tema central (ej: "arraigo social", "renovación TIE", "nacionalidad", etc.)
   - Anota qué procedimiento o trámite específico se está discutiendo

2. **RECONOCE PREGUNTAS DE SEGUIMIENTO:**
   - Preguntas que empiezan con: "y si...", "¿qué pasa si...?", "mientras...", "durante...", "cuando...", "puedo..."
   - Preguntas que usan referencias vagas: "la solicitud", "ese plazo", "esos documentos", "ese trámite", "ese vínculo"
   - Preguntas cortas o sin contexto explícito → SON SEGUIMIENTOS del tema previo

3. **MANTÉN EL TEMA DE LA CONVERSACIÓN:**
   - Si estás hablando de "arraigo social", SIGUE hablando de "arraigo social" en las siguientes respuestas
   - Si estás hablando de "renovación TIE", NO cambies a "obtención de TIE"
   - Si estás hablando de "nacionalidad por residencia", NO cambies a "nacionalidad por opción"
   
4. **FILTRA CONTEXTO IRRELEVANTE:**
   - Si los fragmentos de contexto hablan de un tema DIFERENTE al de la conversación, IGNÓRALOS
   - Ejemplo: Si la conversación es sobre "arraigo social" y un fragmento habla de "reagrupación familiar", ESE FRAGMENTO NO ES RELEVANTE aunque mencione "vínculos familiares"
   - Prioriza fragmentos que coincidan con el TEMA de la conversación, no solo con palabras clave aisladas

5. **USA LA INFORMACIÓN DE TUS RESPUESTAS ANTERIORES:**
   - Cuando respondas a un seguimiento, PRIMERO revisa qué dijiste en respuestas anteriores
   - Construye sobre esa información, no la contradices
   - Si la nueva pregunta pide aclaración de algo que ya mencionaste, amplía ESA información específica

6. **SI HAY CONFLICTO ENTRE CONTEXTO NUEVO Y CONVERSACIÓN:**
   - PRIORIZA la línea de conversación establecida
   - Solo cambia de tema si el usuario EXPLÍCITAMENTE pregunta por algo nuevo (ej: "ahora quiero preguntar sobre otro tema...")
   - SIEMPRE menciona el tema de la conversación en tu respuesta (ej: "En relación al arraigo social del que hablamos...")
   - Si el contexto nuevo no encaja, di explícitamente: "Los documentos proporcionados hablan de [otro tema], pero en relación al [tema de conversación] que mencionaste..."

DIRECTRICES DE RESPUESTA:
1. SOLO usa la información de los fragmentos de contexto proporcionados Y tu historial de conversación
2. Prioriza fragmentos de contexto que sean coherentes con el tema de la conversación en curso
3. Si la información no está en el contexto ni en el historial, indícalo claramente en lugar de inventar
4. Cita los documentos específicos cuando los menciones (ej: "Según BOE-A-2022-xxx..." o "De acuerdo con la Instrucción DGI...")
5. Estructura tus respuestas de manera clara con puntos cuando sea apropiado
6. Usa lenguaje profesional pero accesible en español

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
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 2500,
          stream: true,
        }),
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        await writer.write(sse(JSON.stringify({ event: "error", reqId, error: text || `LLM error ${resp.status}` })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
        await writer.close();
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulatedAnswer = ""; // Track full answer for logging

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        for (const line of buffer.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            const delta: string | undefined = obj?.choices?.[0]?.delta?.content;
            if (delta) {
              accumulatedAnswer += delta;
              await writer.write(sse(JSON.stringify({ delta })));
            }
          } catch {}
        }
        const lastNl = buffer.lastIndexOf("\n");
        buffer = lastNl >= 0 ? buffer.slice(lastNl + 1) : buffer;
      }

      const ms = Date.now() - t0;
      await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms, route: actualRoute })));
      await writer.write(sse(JSON.stringify({ done: true })));
      
      // Log the chat session
      try {
        const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();
        const userAgent = req.headers.get("user-agent") || undefined;
        const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
        const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
        
        await logChatSession({
          sessionId,
          timestamp: new Date().toISOString(),
          question,
          answer: accumulatedAnswer,
          conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
          metadata: {
            topK,
            minScore,
            kbOnly,
            route: actualRoute,
            topScores: hits.map((h) => h.score),
            topScore,
            responseTimeMs: ms,
            model: CHAT_MODEL,
            rewrittenQuery: rewrittenQ,
            inDomain,
            sources: enriched.slice(0, 5).map((h) => ({
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
      
      await writer.close();
    })().catch(async (e) => {
      try {
        await writer.write(sse(JSON.stringify({ event: "error", reqId, error: String(e?.message ?? e) })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
      } finally {
        await writer.close();
      }
    });

    // ---------- (B) Response headers incl. RAG metrics ----------
    const sseHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      "Access-Control-Expose-Headers":
        "x-probe, x-rag-top-score, x-rag-topk, x-rag-min-score, x-route, x-domain",
      "x-probe": "rag-sse-headers-2",
      "x-rag-top-score": String(topScore),
      "x-rag-topk": String(topK),
      "x-rag-min-score": String(minScore),
      "x-route": route,
      "x-domain": inDomain ? "in" : "out",
    };

    return new Response(readable, { status: 200, headers: sseHeaders });
  } catch (err: any) {
    return new Response(sse(JSON.stringify({ ok: false, error: String(err?.message ?? err) })), {
      status: 500,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  }
}