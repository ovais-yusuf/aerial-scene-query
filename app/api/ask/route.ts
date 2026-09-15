import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import { compactResults, loadResults } from "@/lib/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You answer questions about pedestrian analysis of a fixed-camera aerial video, using only the provided JSON. Rules: answer only from the data; if it's not there, say so. The system detects PERSONS not students — give person counts but never claim to identify students. Only the 80 COCO classes are detectable (no trees, benches, signage). The counts object gives unique people whose ENTRY ORIGIN was each zone; ALREADY PRESENT means visible at video start so origin unobserved. Counts are approximate — mention the manual ground-truth range when relevant. Be concise and factual.";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;

type RateBucket = { count: number; resetAt: number };
type RateLimitGlobal = typeof globalThis & {
  aerialAskRateLimits?: Map<string, RateBucket>;
};

const rateLimitGlobal = globalThis as RateLimitGlobal;
const rateLimits =
  rateLimitGlobal.aerialAskRateLimits ?? new Map<string, RateBucket>();
rateLimitGlobal.aerialAskRateLimits = rateLimits;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function allowRequest(ip: string): boolean {
  const now = Date.now();

  if (rateLimits.size > 1_024) {
    rateLimits.forEach((bucket, key) => {
      if (bucket.resetAt <= now) rateLimits.delete(key);
    });
  }

  const current = rateLimits.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  if (!allowRequest(ip)) {
    return NextResponse.json(
      {
        error:
          "You’ve reached the question limit for this minute. Please wait briefly and try again.",
      },
      { status: 429 },
    );
  }

  let question: unknown;
  try {
    ({ question } = (await request.json()) as { question?: unknown });
  } catch {
    return NextResponse.json({ error: "Please send a valid question." }, { status: 400 });
  }

  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "Please enter a question first." }, { status: 400 });
  }

  const cleanedQuestion = question.trim();
  if (cleanedQuestion.length > 500) {
    return NextResponse.json(
      { error: "Please keep the question under 500 characters." },
      { status: 400 },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "The Scene Copilot is not configured yet." },
      { status: 503 },
    );
  }

  try {
    const results = compactResults(await loadResults());
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 240,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analysis results:\n${JSON.stringify(results)}\n\nQuestion: ${cleanedQuestion}`,
        },
      ],
    });

    const answer = completion.choices[0]?.message.content?.trim();
    return NextResponse.json({
      answer: answer || "The analysis did not produce an answer for that question.",
    });
  } catch (error) {
    console.error("Scene Copilot request failed", error);
    return NextResponse.json(
      { error: "The Scene Copilot could not answer right now. Please try again." },
      { status: 500 },
    );
  }
}
