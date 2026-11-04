/** Server-only calculation module. Never import from client components. */
import { readFile } from "node:fs/promises";
import path from "node:path";

export type Query =
  | { operation: "zone_occupancy_duration"; zone: string; threshold_seconds: number; mode: "total_observed" | "longest_observed_sequence"; comparison: "gt" | "gte" }
  | { operation: "peak_visible_count" }
  | { operation: "entry_origin_counts"; zone?: string };
type Point = [number, number];
type Stamp = { processed_frame_index: number; source_frame_index: number; timestamp_sec: number };
type Observation = Stamp & { track_id: number; class_id: number; foot_xy_px: Point; bbox_xyxy_px: number[]; legacy_center_xy_px: Point; zones_foot: string[] };
type Frame = Stamp & { detections_in_tracker_output: number; tracked_observations: Observation[] };
type Metadata = { zones: Record<string, number[]>; source_fps: number; video_stride: number; frames_processed: number; raw_track_count: number; completed: boolean; count_filter: { minimum_observations: number; minimum_center_path_px: number } };
type LegacyTrack = { track_id: number; origin: string; frames_seen: number; distance_px: number; first_seen_frame: number; first_position: Point };
type Legacy = { tracks: LegacyTrack[]; counts: Record<string, number>; total_people: number; raw_tracks: number };
export type Dataset = { metadata: Metadata; frames: Frame[]; legacy: Legacy; tracks: Map<number, Observation[]> };
export type Interval = { start: Stamp; end: Stamp; duration_seconds: number };
export type TrackEvidence = { track_id: number; total_observed_seconds: number; longest_observed_sequence_seconds: number; duration_seconds: number; included_in_legacy_count: boolean; intervals: Interval[] };
export type Evidence = { query: Query; count: number; label: string; tracks?: TrackEvidence[]; frames?: Stamp[]; origins?: { zone: string; count: number; tracks: { track_id: number; first_observation: Stamp }[] }[]; provenance: { files: string[]; frames_processed: number; raw_track_count: number; position?: string }; limitations: string[] };
export class QueryError extends Error {}
export class DataError extends Error {}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new DataError(message); }
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const integer = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v) && v >= 0;
const vector = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(finite);
export function membership(point: Point, zones: Record<string, number[]>): string[] {
  return Object.keys(zones).filter(z => { const [x1,y1,x2,y2] = zones[z]; return point[0] >= x1 && point[0] <= x2 && point[1] >= y1 && point[1] <= y2; });
}
export function validateQuery(value: unknown, zones: string[]): Query {
  if (!object(value)) throw new QueryError("Query must be an object.");
  const op = value.operation;
  const allowed = op === "zone_occupancy_duration" ? ["operation","zone","threshold_seconds","mode","comparison"] : op === "entry_origin_counts" ? ["operation","zone"] : op === "peak_visible_count" ? ["operation"] : [];
  if (!allowed.length || Object.keys(value).some(k => !allowed.includes(k))) throw new QueryError("Unsupported operation or query fields.");
  if (op === "zone_occupancy_duration") {
    if (typeof value.zone !== "string" || !zones.includes(value.zone)) throw new QueryError(`Unknown zone. Use ${zones.join(", ")}.`);
    if (!finite(value.threshold_seconds) || value.threshold_seconds < 0) throw new QueryError("Threshold must be finite and nonnegative.");
    if (!["total_observed","longest_observed_sequence"].includes(String(value.mode))) throw new QueryError("Choose total observed time or one observed sequence.");
    if (value.comparison !== "gt" && value.comparison !== "gte") throw new QueryError("Comparison must be gt or gte.");
  } else if (op === "entry_origin_counts" && value.zone !== undefined && (typeof value.zone !== "string" || ![...zones,"ALREADY PRESENT","OTHER"].includes(value.zone))) throw new QueryError("Unknown entry origin.");
  return value as Query;
}
export function validateDataset(metadataValue: unknown, framesValue: unknown, legacyValue: unknown): Dataset {
  check(object(metadataValue) && object(legacyValue) && Array.isArray(framesValue), "Malformed dataset containers.");
  const m = metadataValue as unknown as Metadata, legacy = legacyValue as unknown as Legacy, frames = framesValue as Frame[];
  check(m.completed === true && finite(m.source_fps) && m.source_fps > 0 && integer(m.video_stride) && m.video_stride > 0 && integer(m.frames_processed) && m.frames_processed > 0 && frames.length === m.frames_processed && integer(m.raw_track_count), "Invalid or incomplete metadata.");
  check(object(m.zones) && Object.keys(m.zones).length > 0 && Object.values(m.zones).every(v => vector(v,4) && v[0] <= v[2] && v[1] <= v[3]), "Invalid zone rectangles.");
  check(object(m.count_filter) && integer(m.count_filter.minimum_observations) && finite(m.count_filter.minimum_center_path_px) && m.count_filter.minimum_center_path_px >= 0, "Invalid legacy filter.");
  const tracks = new Map<number, Observation[]>();
  for (const [i,f] of frames.entries()) {
    check(object(f) && f.processed_frame_index === i && f.source_frame_index === (i+1)*m.video_stride-1 && finite(f.timestamp_sec) && Math.abs(f.timestamp_sec-f.source_frame_index/m.source_fps) < 1e-8 && (!i || f.timestamp_sec > frames[i-1].timestamp_sec), `Invalid frame or timestamp at ${i}.`);
    check(integer(f.detections_in_tracker_output) && Array.isArray(f.tracked_observations) && f.detections_in_tracker_output >= f.tracked_observations.length, `Invalid frame observations at ${i}.`);
    const seen = new Set<number>();
    for (const o of f.tracked_observations) {
      check(object(o) && integer(o.track_id) && !seen.has(o.track_id) && o.class_id === 0 && vector(o.foot_xy_px,2) && vector(o.legacy_center_xy_px,2) && vector(o.bbox_xyxy_px,4), `Malformed observation at ${i}.`);
      check(o.processed_frame_index === i && o.source_frame_index === f.source_frame_index && o.timestamp_sec === f.timestamp_sec, "Observation/frame mismatch.");
      const [x1,y1,x2,y2] = o.bbox_xyxy_px;
      check(x1 <= x2 && y1 <= y2 && Math.abs(o.foot_xy_px[0]-(x1+x2)/2) < 1e-6 && Math.abs(o.foot_xy_px[1]-y2) < 1e-6, "Invalid estimated foot position.");
      const zones = membership(o.foot_xy_px,m.zones);
      check(Array.isArray(o.zones_foot) && o.zones_foot.length === zones.length && new Set(o.zones_foot).size === zones.length && zones.every(z => o.zones_foot.includes(z)), "Computed membership disagrees with zones_foot.");
      seen.add(o.track_id); const list = tracks.get(o.track_id) ?? []; list.push(o); tracks.set(o.track_id,list);
    }
  }
  check(tracks.size === m.raw_track_count && legacy.raw_tracks === tracks.size && Array.isArray(legacy.tracks) && integer(legacy.total_people) && object(legacy.counts), "Track totals disagree.");
  const filtered = new Map<number,{seen: number; distance: number}>();
  for (const [id, observations] of tracks) {
    let distance = 0;
    observations.slice(1).forEach((o,i) => { const prev = observations[i]; distance += Math.hypot(o.legacy_center_xy_px[0]-prev.legacy_center_xy_px[0],o.legacy_center_xy_px[1]-prev.legacy_center_xy_px[1]); });
    if (observations.length >= m.count_filter.minimum_observations && distance >= m.count_filter.minimum_center_path_px) filtered.set(id,{seen: observations.length,distance});
  }
  const ids = new Set<number>(), counts: Record<string,number> = Object.fromEntries([...Object.keys(m.zones),"ALREADY PRESENT","OTHER"].map(z => [z,0]));
  for (const t of legacy.tracks) {
    check(object(t) && integer(t.track_id) && !ids.has(t.track_id) && typeof t.origin === "string" && Object.hasOwn(counts,t.origin), "Malformed legacy track.");
    const first = tracks.get(t.track_id)?.[0], stat = filtered.get(t.track_id);
    check(first && stat && t.frames_seen === stat.seen && finite(t.distance_px) && Math.abs(t.distance_px-stat.distance) <= 0.051 && t.first_seen_frame === first.processed_frame_index+1 && vector(t.first_position,2) && t.first_position.every((v,i) => v === first.legacy_center_xy_px[i]), "Legacy track/filter disagreement.");
    const origin = first.processed_frame_index < 20 ? "ALREADY PRESENT" : membership(first.legacy_center_xy_px,m.zones)[0] ?? "OTHER";
    check(t.origin === origin, "Legacy first-appearance origin disagreement.");
    ids.add(t.track_id); counts[t.origin]++;
  }
  check(ids.size === filtered.size && ids.size === legacy.total_people && Object.keys(legacy.counts).length === Object.keys(counts).length && Object.entries(counts).every(([z,n]) => legacy.counts[z] === n), "Legacy counts disagree.");
  return { metadata:m,frames,legacy,tracks };
}
const stamp = (o: Stamp): Stamp => ({ processed_frame_index:o.processed_frame_index, source_frame_index:o.source_frame_index,timestamp_sec:o.timestamp_sec });
export function durations(dataset: Dataset, zone: string): TrackEvidence[] {
  if (!Object.hasOwn(dataset.metadata.zones,zone)) throw new QueryError("Unknown zone.");
  const legacyIds = new Set(dataset.legacy.tracks.map(t => t.track_id));
  return [...dataset.tracks].sort(([a],[b])=>a-b).map(([track_id,observations]) => {
    const intervals: Interval[] = []; let previous: Observation | undefined; let active: Interval | undefined;
    let total = 0;
    for (const o of observations) {
      if (!membership(o.foot_xy_px,dataset.metadata.zones).includes(zone)) { previous=undefined;active=undefined;continue; }
      if (previous && active && o.processed_frame_index === previous.processed_frame_index+1) {
        total += o.timestamp_sec-previous.timestamp_sec; active.end=stamp(o);active.duration_seconds=o.timestamp_sec-active.start.timestamp_sec;
      } else { active={start:stamp(o),end:stamp(o),duration_seconds:0};intervals.push(active); }
      previous=o;
    }
    const longest=Math.max(0,...intervals.map(i=>i.duration_seconds));
    return {track_id,total_observed_seconds:total,longest_observed_sequence_seconds:longest,duration_seconds:total,included_in_legacy_count:legacyIds.has(track_id),intervals};
  });
}
export function executeQuery(dataset: Dataset, input: unknown): Evidence {
  const query = validateQuery(input,Object.keys(dataset.metadata.zones));
  const common = { query, provenance:{files:["Trajectory_Research_Data/trajectories.jsonl","Trajectory_Research_Data/trajectory_metadata.json"],frames_processed:dataset.frames.length,raw_track_count:dataset.tracks.size},limitations:["Track IDs are not guaranteed unique people.","Timestamps are nominal playback times, not camera timestamps.","Export consistency is not detection-accuracy or physical-safety validation."] };
  if (query.operation === "zone_occupancy_duration") {
    const tracks=durations(dataset,query.zone).map(t=>({...t,duration_seconds:query.mode === "total_observed" ? t.total_observed_seconds:t.longest_observed_sequence_seconds})).filter(t=>query.comparison === "gt" ? t.duration_seconds > query.threshold_seconds : t.duration_seconds >= query.threshold_seconds);
    return {...common,count:tracks.length,label:"Matching raw track IDs",tracks,provenance:{...common.provenance,position:"Estimated box bottom center (foot), inclusive boundaries"},limitations:[...common.limitations,"All exported tracks included, regardless of legacy movement filter.","Missing and outside observations break sequences. Singletons contribute zero. No interpolation.","Observed sequences do not prove uninterrupted presence between samples.","Foot zone membership may differ from center-based entry logic. Distances are pixels, not meters."]};
  }
  if (query.operation === "peak_visible_count") {
    const count=Math.max(...dataset.frames.map(f=>f.detections_in_tracker_output));
    return {...common,count,label:"Peak sampled-frame tracker-output count",frames:dataset.frames.filter(f=>f.detections_in_tracker_output === count).map(stamp),limitations:[...common.limitations,"Sampled-frame detections, not a guaranteed count of distinct people or the unsampled video peak."]};
  }
  const origins=Object.keys(dataset.legacy.counts).filter(z=>!query.zone || z===query.zone).map(zone=>({zone,count:dataset.legacy.counts[zone],tracks:dataset.legacy.tracks.filter(t=>t.origin===zone).map(t=>({track_id:t.track_id,first_observation:stamp(dataset.tracks.get(t.track_id)![0])}))}));
  return {...common,count:origins.reduce((sum,o)=>sum+o.count,0),label:"Filtered track IDs assigned by first appearance",origins,provenance:{...common.provenance,files:[...common.provenance.files,"Trajectory_Research_Data/results-2.json"],position:"Legacy integer box center"},limitations:[...common.limitations,"First-appearance assignments are not verified boundary crossings.","ALREADY PRESENT includes first sightings in the first 20 processed frames.","Legacy minimum observation and movement filters exclude some stationary tracks."]};
}
export async function readDataset(directory = path.join(process.cwd(),"Trajectory_Research_Data")): Promise<Dataset> {
  try {
    const [metadata,raw,legacy]=await Promise.all([readFile(path.join(directory,"trajectory_metadata.json"),"utf8"),readFile(path.join(directory,"trajectories.jsonl"),"utf8"),readFile(path.join(directory,"results-2.json"),"utf8")]);
    return validateDataset(JSON.parse(metadata),raw.trim().split(/\r?\n/).map(line=>JSON.parse(line)),JSON.parse(legacy));
  } catch (error) { if (error instanceof DataError) throw error; throw new DataError("Trajectory data is missing, unreadable, or malformed."); }
}
let cached: Promise<Dataset> | undefined;
export function loadTrajectoryDataset(): Promise<Dataset> {
  if (!cached) cached=readDataset().catch(error=>{cached=undefined;throw error;});
  return cached;
}
