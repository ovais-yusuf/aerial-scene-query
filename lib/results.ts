import { readFile } from "node:fs/promises";
import path from "node:path";

export const ZONE_ORDER = [
  "ALREADY PRESENT",
  "LEFT",
  "RIGHT",
  "TUNNEL",
  "TRAIN PATH",
  "OTHER",
] as const;

export type ZoneName = (typeof ZONE_ORDER)[number];

export interface AnalysisResults {
  video?: string;
  resolution?: [number, number] | number[];
  duration_sec?: number;
  model?: string;
  tracker?: string;
  total_people: number;
  counts: Partial<Record<ZoneName, number>> & Record<string, number>;
  ground_truth_manual?: unknown;
  zones?: unknown;
  known_limitations?: unknown;
  tracks?: unknown[];
  [key: string]: unknown;
}

export async function loadResults(): Promise<AnalysisResults> {
  const filePath = path.join(process.cwd(), "data", "results.json");
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as AnalysisResults;
}

export function compactResults(results: AnalysisResults) {
  const { tracks, ...compact } = results;
  return {
    ...compact,
    n_tracks_recorded: Array.isArray(tracks) ? tracks.length : 0,
  };
}
