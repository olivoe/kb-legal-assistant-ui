// lib/server/sse.ts
// Minimal Server-Sent Events helper for Next.js Route Handlers (Node runtime).

export type SSEWriter = (chunk: string) => void;

export function sseResponse(writeCb: (write: SSEWriter) => Promise<void> | void): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write: SSEWriter = (chunk: string) => {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      };

      (async () => {
        try {
          // Initial ping so client knows we're alive
          controller.enqueue(encoder.encode(`event: init\ndata: {"ok":true}\n\n`));
          await writeCb(write);
        } catch (err: any) {
          const msg = JSON.stringify({ error: String(err?.message ?? err) });
          controller.enqueue(encoder.encode(`event: error\ndata: ${msg}\n\n`));
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // for some proxies
    },
  });
}