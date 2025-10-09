// app/api/rag/stream/route.ts
import { NextRequest } from "next/server";
import { genRequestId } from "@/lib/server/reqid";
import { embedText } from "@/lib/llm/embed";
import { searchKB } from "@/lib/rag/search";
import { loadKB } from "@/lib/rag/kb";
import { loadSnippetFromMeta } from "@/lib/rag/snippet";
import { webFallback } from "@/lib/rag/web";
import { rewriteEs } from "@/lib/rag/rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";
function isInSpanishImmigrationDomainStrict(original: string, rewritten?: string): boolean {
  const texts = [original || "", rewritten || ""].map((t) => t.toLowerCase());
  
  // Only reject if clearly about OTHER countries' immigration (US, Canada, etc.)
  const clearlyOtherCountries = [
    "h-1b", "h1b", "h1-b", "h 1b", "h‑1b",
    "uscis", "green card", "social security number usa",
    "b1/b2", "f-1 visa usa", "j-1 visa usa",
    "united states immigration", "canadian immigration", "canada immigration",
    "australian immigration", "australia immigration",
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
    "documento", "formulario", "solicitud", "tramite", "trámite", "procedimiento",
    "requisitos", "plazo", "fecha", "tiempo", "duracion", "duración",
    
    // Spain-specific
    "españa", "espana", "español", "española", "español", "nie", "tie",
    "boe", "ministerio", "sede", "electronica", "electrónica",
    "modelo ex", "arraigo", "reagrupacion", "reagrupación",
    
    // Countries (likely asking about immigration TO Spain FROM these)
    "venezuela", "colombia", "ecuador", "peru", "argentina", "mexico", "bolivia",
    "chile", "uruguay", "paraguay", "cuba", "nicaragua", "honduras",
    
    // Follow-up patterns
    /^(y|si|como|donde|cuando|que|por|para|con|sin|sobre)/i,
  ];
  
  // Accept if ANY indicator is present
  return texts.some((s) => 
    inDomainIndicators.some((indicator) => {
      if (typeof indicator === 'string') {
        return s.includes(indicator);
      } else {
        return indicator.test(s);
      }
    })
  );
}

function logRouteMetrics(data: Record<string, unknown>) {
  try { console.log(JSON.stringify({ level: "info", event: "rag.route", ...data })); } catch {}
}


function sse(data: string) {
  return `data: ${data}\n\n`;
}
function ev(name: string, data?: any) {
  return `event: ${name}\n${data ? sse(JSON.stringify(data)).slice(5) : "\n"}`;
}

export async function POST(req: NextRequest) {
  const reqId = genRequestId();
  const t0 = Date.now();

  try {
    // Adjusted defaults: topK=8 for more context, minScore=0.30 for better quality
    const { question, topK = 8, minScore = 0.30, kbOnly = true, conversationHistory = [] } = await req.json();
    const rewrittenQ = rewriteEs(question);

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
    const inDomain = isInSpanishImmigrationDomainStrict(question, rewrittenQ);
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
      (async () => {
        await writer.write(sse(JSON.stringify({ delta: "Esta IA se especializa solo en temas de Inmigración a España." })));
        const ms = Date.now() - t0;
        await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms })));
        await writer.write(sse(JSON.stringify({ done: true })));
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
        "x-route": "SPECIALIZATION",
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
        await writer.write(sse(JSON.stringify({ delta: "Esta IA se especializa solo en temas de Inmigración a España." })));
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
          const snip = (h.snippet ?? "").slice(0, 1000);
          return `#${i + 1} ${loc}\n${snip}`;
        })
        .join("\n\n---\n\n");

      // Build message array with conversation history
      const systemMessage = {
        role: "system" as const,
        content: `Eres un asistente legal especializado en Derecho de Inmigración Español. Sigue estas reglas estrictamente:

DIRECTRICES DE RESPUESTA:
1. SOLO usa la información de los fragmentos de contexto proporcionados
2. Si la información no está en el contexto, indícalo claramente en lugar de inventar
3. Cita los documentos específicos cuando los menciones (ej: "Según BOE-A-2022-xxx..." o "De acuerdo con la Instrucción DGI...")
4. Estructura tus respuestas de manera clara con puntos cuando sea apropiado
5. Usa lenguaje profesional pero accesible en español

MANEJO DE INFORMACIÓN INCOMPLETA:
- Si el contexto no contiene información específica sobre fechas, tasas actualizadas, o procedimientos vigentes, indica: "La información específica sobre [tema] requiere verificación actualizada"
- Para preguntas sobre plazos o requisitos específicos, cita la fuente del documento
- Si hay información contradictoria, menciona ambas fuentes

RECOMENDACIONES PROFESIONALES:
- Cuando la consulta requiera asesoramiento personalizado o actualización de datos específicos, sugiere: "Para obtener asesoramiento personalizado y actualizado sobre su caso particular, le recomendamos contactar con Olivo Galarza Abogados"
- NO inventes datos, fechas, o cantidades que no estén en el contexto

ACRONIMOS Y TÉRMINOS:
- Al mencionar acronimos por primera vez, proporciona su significado completo (ej: "TIE (Tarjeta de Identidad de Extranjero)")
- Explica términos técnicos de manera accesible

FORMATO DE CITAS:
- Referencia los documentos del contexto cuando proporciones información específica
- Si mencionas normativa, indica el documento exacto del contexto que lo respalda

CONVERSACIÓN:
- Si hay un historial de conversación previo, úsalo para entender el contexto de preguntas de seguimiento
- Las preguntas breves como "¿y eso qué es?" o "¿cuánto cuesta?" pueden referirse a temas de la conversación previa`,
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
          max_tokens: 1000,
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
            if (delta) await writer.write(sse(JSON.stringify({ delta })));
          } catch {}
        }
        const lastNl = buffer.lastIndexOf("\n");
        buffer = lastNl >= 0 ? buffer.slice(lastNl + 1) : buffer;
      }

      const ms = Date.now() - t0;
      await writer.write(sse(JSON.stringify({ event: "metrics", reqId, runtime_ms: ms, route: actualRoute })));
      await writer.write(sse(JSON.stringify({ done: true })));
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