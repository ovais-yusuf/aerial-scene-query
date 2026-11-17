import { promises as fs } from "node:fs";
import path from "node:path";

export const ROUTE104_CLASSES = ["person", "bicycle", "motorcycle", "car", "bus", "truck"] as const;
export type Route104Class = (typeof ROUTE104_CLASSES)[number];

export interface Route104Summary {
  resolution: [number, number]; source_fps: number; total_source_frames: number;
  video_stride: number; processed_frames: number; base_detector: string; tracker: string;
  track_id_counts_by_stable_base_class: Record<string, number>;
  raw_track_id_count: number; maximum_tracked_objects_in_one_processed_frame: number;
  person_person_threshold_px: number; person_vehicle_threshold_px: number;
  frames_with_person_person_close_pairs: number; frames_with_person_vehicle_close_pairs: number;
  grid: [number, number]; subtype_method: string; subtype_validated: boolean; limitations: string[];
}

export interface Route104Track {
  track_id: number; base_class: string; observations: number; mean_detection_confidence: number;
  first_time_sec: number; last_time_sec: number; observed_span_sec: number;
  consecutive_sample_path_length_px: number; average_image_speed_px_per_sec: number;
  experimental_subtype: string; subtype_validated: boolean | null;
}

export interface VehicleSubtype {
  track_id: number; base_class: string; proposed_subtype: string; proposal_confidence: number;
  validated: boolean; cropAvailable: boolean;
}

export interface Route104Frame {
  processed_frame_index: number; source_frame_index: number; timestamp_sec: number;
  observations: Array<{track_id:number; base_class:string; confidence:number; bbox_xyxy_px:number[]; grid_cell:number[]}>;
  person_person_close_pairs: unknown[]; person_vehicle_close_pairs: unknown[];
}

const base = path.join(process.cwd(), "Route104");
let dataPromise: Promise<{summary:Route104Summary; tracks:Route104Track[]; subtypes:VehicleSubtype[]}> | undefined;

export function loadRoute104Data() {
  dataPromise ??= Promise.all([
    fs.readFile(path.join(base, "summary.json"), "utf8"),
    fs.readFile(path.join(base, "tracks.json"), "utf8"),
    fs.readFile(path.join(base, "vehicle_subtypes.json"), "utf8"),
  ]).then(([summaryText, tracksText, subtypeText]) => {
    const summary = JSON.parse(summaryText) as Route104Summary;
    const tracks = (JSON.parse(tracksText) as {tracks:Route104Track[]}).tracks;
    const raw = JSON.parse(subtypeText) as Record<string, {base_class:string; proposed_subtype:string; proposal_confidence:number; validated:boolean; crop?:string}>;
    const subtypes = Object.entries(raw).map(([id, value]) => ({
      track_id: Number(id), base_class: value.base_class, proposed_subtype: value.proposed_subtype,
      proposal_confidence: value.proposal_confidence, validated: value.validated, cropAvailable: false,
    })).sort((a,b) => a.track_id-b.track_id);
    return {summary, tracks, subtypes};
  });
  return dataPromise;
}

let framesPromise: Promise<Route104Frame[]> | undefined;
export function loadRoute104Frames() {
  framesPromise ??= fs.readFile(path.join(base, "frames.jsonl"), "utf8").then(text =>
    text.split("\n").filter(Boolean).map(line => JSON.parse(line) as Route104Frame),
  );
  return framesPromise;
}

export async function answerRoute104(question: string) {
  const {summary, tracks, subtypes} = await loadRoute104Data();
  const q = question.toLowerCase().trim();
  const evidence = {sceneId:"route-104", files:["Route104/summary.json", "Route104/tracks.json", "Route104/vehicle_subtypes.json"]};
  const classMatch = ROUTE104_CLASSES.find(name => q.includes(name));
  const trackMatch = q.match(/track(?: id)?\s*#?\s*(\d+)/i);
  if (/what classes|classes were detected/.test(q)) return {answer:`The stable base classes detected were ${ROUTE104_CLASSES.filter(c => (summary.track_id_counts_by_stable_base_class[c] ?? 0) > 0).join(", ")}. No motorcycle track IDs were produced in this run.`, routeEvidence:evidence};
  if (trackMatch) {
    const track = tracks.find(t => t.track_id === Number(trackMatch[1]));
    if (!track) return {answer:`Track ID ${trackMatch[1]} is not present in the Route 104 track export.`, routeEvidence:evidence};
    return {answer:`Track ID ${track.track_id} has stable base class ${track.base_class}, ${track.observations} observations, mean confidence ${(track.mean_detection_confidence*100).toFixed(1)}%, and an observed span of ${track.observed_span_sec.toFixed(2)} seconds. Its average image-space speed is ${track.average_image_speed_px_per_sec.toFixed(2)} pixels per nominal second.${track.experimental_subtype !== "not_applicable" ? ` Its experimental unvalidated subtype proposal is ${track.experimental_subtype}.` : ""}`, routeEvidence:evidence};
  }
  if (classMatch && /(how many|count)/.test(q)) return {answer:`The Route 104 export contains ${summary.track_id_counts_by_stable_base_class[classMatch] ?? 0} ${classMatch} track IDs. Track IDs are not verified unique road users and may fragment or switch.`, routeEvidence:evidence};
  if (/maximum|most/.test(q) && /objects|tracked/.test(q)) return {answer:`The maximum number of tracked objects in one processed frame was ${summary.maximum_tracked_objects_in_one_processed_frame}.`, routeEvidence:evidence};
  if (/person.person/.test(q) && /frames|proximity/.test(q)) return {answer:`${summary.frames_with_person_person_close_pairs} processed frames contained at least one person-to-person close-pair observation using a ${summary.person_person_threshold_px} pixel threshold. These are geometric image-space flags, not confirmed safety events.`, routeEvidence:evidence};
  if (/person.vehicle/.test(q) && /frames|proximity/.test(q)) return {answer:`${summary.frames_with_person_vehicle_close_pairs} processed frames contained at least one person-to-vehicle close-pair observation using an ${summary.person_vehicle_threshold_px} pixel threshold. These are geometric image-space flags, not confirmed safety events.`, routeEvidence:evidence};
  if (/threshold/.test(q)) return {answer:`The configured thresholds were ${summary.person_person_threshold_px} pixels for person-to-person pairs and ${summary.person_vehicle_threshold_px} pixels for person-to-vehicle pairs. Distances are image-space pixels, not meters.`, routeEvidence:evidence};
  if (/subtype/.test(q) && /unknown/.test(q)) return {answer:`${subtypes.filter(s => s.proposed_subtype === "unknown").length} vehicle subtype results were unknown. Subtypes are experimental, unvalidated open-vocabulary proposals.`, routeEvidence:evidence};
  if (/subtype/.test(q)) {
    const counts = new Map<string,number>(); subtypes.forEach(s => counts.set(s.proposed_subtype, (counts.get(s.proposed_subtype) ?? 0)+1));
    return {answer:`The experimental unvalidated subtype proposals were ${[...counts].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} (${v})`).join(", ")}. These are proposals, not ground truth.`, routeEvidence:evidence};
  }
  if (/longest/.test(q) && /duration|observed|track/.test(q)) {
    const t = tracks.reduce((a,b)=>b.observed_span_sec>a.observed_span_sec?b:a); return {answer:`Track ID ${t.track_id}, stable base class ${t.base_class}, had the longest observed span at ${t.observed_span_sec.toFixed(2)} seconds. Track IDs may fragment or switch.`, routeEvidence:evidence};
  }
  if (/highest|fastest/.test(q) && /speed/.test(q)) {
    const t = tracks.reduce((a,b)=>b.average_image_speed_px_per_sec>a.average_image_speed_px_per_sec?b:a); return {answer:`Track ID ${t.track_id}, stable base class ${t.base_class}, had the highest average image-space speed at ${t.average_image_speed_px_per_sec.toFixed(2)} pixels per nominal second. This is not physical speed.`, routeEvidence:evidence};
  }
  if (/limitation/.test(q)) return {answer:summary.limitations.join(" "), routeEvidence:evidence};
  return {answer:"The available Route 104 files do not contain a supported answer to that question. The assistant uses the exported JSON and does not inspect the video directly.", routeEvidence:evidence};
}
