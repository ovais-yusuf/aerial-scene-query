import { NextRequest, NextResponse } from "next/server";
import { loadRoute104Frames } from "@/lib/route104";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const frames = await loadRoute104Frames();
  const requested = Number(request.nextUrl.searchParams.get("index") ?? 0);
  const index = Math.max(0, Math.min(frames.length - 1, Number.isFinite(requested) ? Math.round(requested) : 0));
  return NextResponse.json({frame:frames[index], frameCount:frames.length}, {headers:{"Cache-Control":"public, max-age=3600"}});
}
