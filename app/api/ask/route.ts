import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

import { compactGridResults } from "@/lib/grid";
import { loadHowItWorks } from "@/lib/how-it-works";
import { compactResults, loadResults } from "@/lib/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are the single Scene Copilot for this aerial-scene research app. Answer using only the three evidence sources in the user message: (1) pedestrian flow detection/tracking JSON (results.json), (2) crowd density and proximity JSON (grid.json, compact summary without the full frame log), (3) HOW_IT_WORKS.md.

General rules:
- Use whichever source(s) apply; do not invent numbers, methods, classes, or capabilities.
- If evidence is missing, say so plainly. You cannot inspect video directly.
- The detector finds PERSONS (COCO), not students. Never claim to identify students.
- Only the 80 COCO classes are detectable (no trees, benches, signage).

Pedestrian flow pipeline (source 1):
- ByteTrack tracking, unique track IDs, zone entry origins.
- counts = unique people credited to each ENTRY ORIGIN zone; ALREADY PRESENT = visible at start (origin unobserved).
- Counts are approximate. Mention manual ground truth range when relevant.
- Do not sum per frame detections into unique person totals.

Crowd density and proximity pipeline (source 2):
- Detection only (tracking_enabled false): no ByteTrack, persistent IDs, motion prediction, or temporal confirmation.
- Grid = occupancy visualization (detections per cell via estimated foot points at box bottom center).
- Proximity alerts = pairwise Euclidean distance between foot points in original video pixels (see proximity_threshold_px, distance_coordinate_space). A pair alerts when distance ≤ threshold, regardless of grid cells. Grid resolution does not change the alert rule.
- close_pairs = flagged pairs in a frame; people_in_alert = detections involved in at least one flagged pair. That is not the same as close_pairs count.
- frames_with_proximity_alert = processed frames with at least one alert; not distinct emergency events.
- Do not claim proximity alerts prove emergencies or validated safe standoff distance (threshold_validated is false if present).
- Walking parallel does not exempt pairs; collision prediction is not implemented.

Keep the two pipelines separate. Be concise and factual. Do not use em dashes, en dashes, or hyphenated asides in your answers; use short sentences instead.`;

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

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "The Scene Copilot is not configured yet." },
      { status: 503 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY.trim();

  try {
    const [results, grid, methodology] = await Promise.all([
      loadResults().then(compactResults),
      compactGridResults(),
      loadHowItWorks(),
    ]);
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            "Evidence source 1, detection/tracking results JSON:",
            JSON.stringify(results),
            "",
            "Evidence source 2, crowd density and proximity JSON:",
            JSON.stringify(grid),
            "",
            "Evidence source 3, HOW_IT_WORKS.md:",
            methodology,
            "",
            `Question: ${cleanedQuestion}`,
          ].join("\n"),
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
