import { NextRequest, NextResponse } from "next/server";

import { loadCellMatrixFrame } from "@/lib/cell-matrices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("frame");
  const processedFrame = Number(raw);
  if (!Number.isInteger(processedFrame) || processedFrame < 1) {
    return NextResponse.json(
      { error: "Provide a processed frame number of 1 or greater." },
      { status: 400 },
    );
  }

  const frame = await loadCellMatrixFrame(processedFrame);
  if (!frame) {
    return NextResponse.json(
      { error: "That processed frame is not in the metric graph dataset." },
      { status: 404 },
    );
  }

  return NextResponse.json(frame);
}
