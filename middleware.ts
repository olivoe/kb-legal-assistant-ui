import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const config = {
  matcher: ["/api/chat"],
};

export function middleware(req: NextRequest) {
  // Hard-disable the /api/chat POST proxy so the UI must use /api/rag/stream
  if (req.method === "POST" && req.nextUrl.pathname === "/api/chat") {
    return new NextResponse("chat proxy disabled; use /api/rag/stream", {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-probe": "middleware-chat-disabled",
      },
    });
  }
  return NextResponse.next();
}