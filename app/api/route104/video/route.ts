import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const file = path.join(process.cwd(), "Route104", "annotated_multiclass_tracking_web.mp4");
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return Response.json(
      { error: "Route 104 video is not stored in this deployment. Configure NEXT_PUBLIC_ROUTE104_VIDEO_URL." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const range = request.headers.get("range");
  if (!range) return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {headers:{"Content-Type":"video/mp4", "Content-Length":String(stat.size), "Accept-Ranges":"bytes"}});
  const [startText,endText] = range.replace("bytes=","").split("-"); const start=Number(startText); const end=endText?Number(endText):Math.min(start+8*1024*1024-1,stat.size-1);
  if (!Number.isFinite(start) || start >= stat.size) return new Response(null,{status:416});
  return new Response(Readable.toWeb(createReadStream(file,{start,end})) as ReadableStream,{status:206,headers:{"Content-Type":"video/mp4","Content-Length":String(end-start+1),"Content-Range":`bytes ${start}-${end}/${stat.size}`,"Accept-Ranges":"bytes"}});
}
