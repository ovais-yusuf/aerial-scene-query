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
  confidence_threshold: number; image_size: number;
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
  person_person_close_pairs: Array<{person_a_track_id:number;person_b_track_id:number;distance_px:number}>;
  person_vehicle_close_pairs: Array<{person_track_id:number;vehicle_track_id:number;vehicle_base_class:string;clearance_to_vehicle_box_px:number}>;
}

export type Route104ToolName = "dataset_summary"|"track_count_by_class"|"track_lookup"|"track_ranking"|"short_track_count"|"proximity_summary"|"proximity_by_frame"|"proximity_ranking"|"frame_observations"|"vehicle_subtype_distribution"|"vehicle_subtype_lookup"|"vehicle_subtype_confidence_filter"|"methodology_lookup";
export class Route104QueryError extends Error {}
type ToolResult={tool:Route104ToolName;parameters?:Record<string,string|number>;result:string|number;answer:string;files:string[]};

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

async function legacyAnswerRoute104(question: string) {
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

function positiveInt(value:unknown,name:string,max=20){const n=Number(value);if(!Number.isInteger(n)||n<1||n>max)throw new Route104QueryError(`${name} must be an integer from 1 to ${max}.`);return n}
function frameIndex(value:unknown,max:number){const n=Number(value);if(!Number.isInteger(n)||n<0||n>max)throw new Route104QueryError(`processed_frame_index must be an integer from 0 to ${max}.`);return n}
function knownClass(value:unknown):Route104Class{if(typeof value!=="string"||!ROUTE104_CLASSES.includes(value as Route104Class))throw new Route104QueryError("Unknown base class.");return value as Route104Class}
function subtypeName(value:unknown,known:string[]){if(typeof value!=="string"||!known.includes(value.toLowerCase()))throw new Route104QueryError("Unknown vehicle subtype proposal.");return value.toLowerCase()}

export async function executeRoute104Tool(tool:Route104ToolName,args:Record<string,unknown>={}):Promise<ToolResult>{
 const {summary,tracks,subtypes}=await loadRoute104Data();const files:string[]=[];
 if(tool==="dataset_summary"){files.push("Route104/summary.json");const detected=ROUTE104_CLASSES.filter(c=>(summary.track_id_counts_by_stable_base_class[c]??0)>0);return {tool,result:summary.raw_track_id_count,files,answer:`Route 104 contains ${summary.total_source_frames} source frames and ${summary.processed_frames} processed frames over ${(summary.total_source_frames/summary.source_fps).toFixed(1)} seconds. Stable base classes present are ${detected.join(", ")}; no motorcycle track IDs were produced. The run used ${summary.base_detector}, ${summary.tracker}, confidence threshold ${summary.confidence_threshold}, and image size ${summary.image_size}. The maximum tracked objects in one processed frame was ${summary.maximum_tracked_objects_in_one_processed_frame}. It produced ${summary.raw_track_id_count} track IDs, not verified unique road users.`}}
 if(tool==="track_count_by_class"){const baseClass=knownClass(args.class);const count=tracks.filter(t=>t.base_class===baseClass).length;return {tool,parameters:{class:baseClass},result:count,files:["Route104/tracks.json"],answer:`The Route 104 export contains ${count} ${baseClass} track IDs. Track IDs are not verified unique road users and may fragment or switch.`}}
 if(tool==="track_lookup"){const id=positiveInt(args.track_id,"track_id",100000);const t=tracks.find(v=>v.track_id===id);if(!t)throw new Route104QueryError(`Track ID ${id} is not present.`);return {tool,parameters:{track_id:id},result:id,files:["Route104/tracks.json"],answer:`Track ID ${id} has stable base class ${t.base_class}, ${t.observations} observations, mean confidence ${(t.mean_detection_confidence*100).toFixed(1)}%, observed span ${t.observed_span_sec.toFixed(2)} seconds, path length ${t.consecutive_sample_path_length_px.toFixed(1)} pixels, and average image-space speed ${t.average_image_speed_px_per_sec.toFixed(1)} pixels per nominal second.${t.experimental_subtype!=="not_applicable"?` Its experimental unvalidated subtype proposal is ${t.experimental_subtype}.`:""}`}}
 if(tool==="track_ranking"){const metric=String(args.metric);if(!["observed_span_sec","observations","consecutive_sample_path_length_px","average_image_speed_px_per_sec"].includes(metric))throw new Route104QueryError("Unsupported track ranking metric.");const limit=positiveInt(args.limit??1,"limit",10);const rows=[...tracks].sort((a,b)=>Number((b as unknown as Record<string,unknown>)[metric])-Number((a as unknown as Record<string,unknown>)[metric])).slice(0,limit);return {tool,parameters:{metric,limit},result:rows[0].track_id,files:["Route104/tracks.json"],answer:rows.map((t,i)=>`${i+1}. Track ${t.track_id} (${t.base_class}): ${Number((t as unknown as Record<string,unknown>)[metric]).toFixed(2)}`).join("\n")+"\nSpeeds and distances are image-space measurements. Track IDs may fragment or switch."}}
 if(tool==="short_track_count"){const seconds=Number(args.seconds);if(!Number.isFinite(seconds)||seconds<0||seconds>160)throw new Route104QueryError("seconds must be between 0 and 160.");const count=tracks.filter(t=>t.observed_span_sec<seconds).length;return {tool,parameters:{seconds},result:count,files:["Route104/tracks.json"],answer:`${count} track IDs had an observed span shorter than ${seconds} second${seconds===1?"":"s"}. Track IDs may fragment or switch.`}}
 if(tool==="proximity_summary"){return {tool,result:summary.frames_with_person_vehicle_close_pairs,files:["Route104/summary.json"],answer:`${summary.frames_with_person_person_close_pairs} processed frames contained person-to-person close pairs and ${summary.frames_with_person_vehicle_close_pairs} contained person-to-vehicle close pairs. Thresholds were ${summary.person_person_threshold_px} and ${summary.person_vehicle_threshold_px} pixels respectively. These pixel-space observations do not confirm danger, collision, or near miss.`}}
 if(tool==="proximity_by_frame"||tool==="frame_observations"){const index=frameIndex(args.processed_frame_index,summary.processed_frames-1);const frame=(await loadRoute104Frames())[index];if(!frame)throw new Route104QueryError("Processed frame is outside the export range.");if(tool==="frame_observations")return {tool,parameters:{processed_frame_index:index},result:frame.observations.length,files:["Route104/frames.jsonl"],answer:`Processed frame ${index} contains ${frame.observations.length} tracked observations: ${frame.observations.map(o=>`track ${o.track_id} (${o.base_class})`).join(", ")||"none"}.`};return {tool,parameters:{processed_frame_index:index},result:frame.person_person_close_pairs.length+frame.person_vehicle_close_pairs.length,files:["Route104/frames.jsonl"],answer:`Processed frame ${index} contains ${frame.person_person_close_pairs.length} person-to-person and ${frame.person_vehicle_close_pairs.length} person-to-vehicle close-pair observations. ${frame.person_vehicle_close_pairs.map(p=>`Person ${p.person_track_id} with ${p.vehicle_base_class} track ${p.vehicle_track_id}, ${p.clearance_to_vehicle_box_px.toFixed(1)} px clearance.`).join(" ")||"No person-to-vehicle pair was flagged."} These are pixel-space observations, not confirmed collisions or near misses.`}}
 if(tool==="proximity_ranking"){const kind=String(args.kind);if(kind!=="person_vehicle"&&kind!=="person_person")throw new Route104QueryError("kind must be person_vehicle or person_person.");const limit=positiveInt(args.limit??5,"limit",10),counts=new Map<number,number>();for(const frame of await loadRoute104Frames()){if(kind==="person_vehicle")for(const p of frame.person_vehicle_close_pairs)for(const id of [p.person_track_id,p.vehicle_track_id])counts.set(id,(counts.get(id)??0)+1);else for(const p of frame.person_person_close_pairs)for(const id of [p.person_a_track_id,p.person_b_track_id])counts.set(id,(counts.get(id)??0)+1)}const rows=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,limit);return {tool,parameters:{kind,limit},result:rows[0]?.[0]??0,files:["Route104/frames.jsonl"],answer:`Tracks with the most ${kind.replace("_","-")} proximity observations: ${rows.map(([id,n])=>`track ${id} (${n})`).join(", ")}. Counts are frame observations, not distinct safety events.`}}
 if(tool==="vehicle_subtype_distribution"){const counts=new Map<string,number>();subtypes.forEach(s=>counts.set(s.proposed_subtype.toLowerCase(),(counts.get(s.proposed_subtype.toLowerCase())??0)+1));const requested=args.subtype===undefined?undefined:subtypeName(args.subtype,[...counts.keys()]);if(requested){const count=counts.get(requested)??0;return {tool,parameters:{subtype:requested},result:count,files:["Route104/vehicle_subtypes.json"],answer:`There are ${count} ${requested} proposals. These are experimental, unvalidated open-vocabulary proposals, not ground truth.`}}return {tool,result:subtypes.length,files:["Route104/vehicle_subtypes.json"],answer:`Experimental unvalidated subtype proposals: ${[...counts].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} (${v})`).join(", ")}. Unknown is retained as a valid result.`}}
 if(tool==="vehicle_subtype_lookup"){const id=positiveInt(args.track_id,"track_id",100000),s=subtypes.find(v=>v.track_id===id);if(!s)throw new Route104QueryError(`No subtype proposal exists for track ${id}.`);return {tool,parameters:{track_id:id},result:id,files:["Route104/vehicle_subtypes.json"],answer:`Track ${id}, base class ${s.base_class}, has experimental proposal ${s.proposed_subtype} at ${(s.proposal_confidence*100).toFixed(1)}% proposal confidence. It is not validated ground truth.`}}
 if(tool==="vehicle_subtype_confidence_filter"){const threshold=Number(args.threshold);if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw new Route104QueryError("threshold must be from 0 to 1.");const count=subtypes.filter(s=>s.proposal_confidence>threshold).length;return {tool,parameters:{threshold},result:count,files:["Route104/vehicle_subtypes.json"],answer:`${count} experimental subtype proposals had confidence above ${threshold}. Proposal confidence is not validated classification accuracy.`}}
 if(tool==="methodology_lookup"){const topic=String(args.topic??"limitations");if(!["tracking","person_person_proximity","person_vehicle_proximity","vehicle_subtypes","limitations"].includes(topic))throw new Route104QueryError("Unsupported methodology topic.");const text:Record<string,string>={tracking:`${summary.base_detector} detections were associated with ${summary.tracker}. Track IDs can fragment or switch and are not unique road-user counts.`,person_person_proximity:`Person-to-person proximity compares image-space ground points using a ${summary.person_person_threshold_px} pixel threshold.`,person_vehicle_proximity:`Person-to-vehicle proximity measures image-space clearance to a vehicle bounding box using an ${summary.person_vehicle_threshold_px} pixel threshold. Zero-pixel clearance means the person ground point lies on or inside that image-space box, not that a collision occurred.`,vehicle_subtypes:`${summary.subtype_method}. Proposals are experimental and unvalidated, and unknown is retained rather than guessed.`,limitations:summary.limitations.join(" ")};return {tool,parameters:{topic},result:topic,files:["Route104/summary.json"],answer:text[topic]}}
 throw new Route104QueryError("Unsupported Route 104 tool.")
}

function toolResponse(result:ToolResult){return {answer:result.answer,routeEvidence:{sceneId:"route-104" as const,tool:result.tool,parameters:result.parameters,result:result.result,files:result.files}}}
export async function answerRoute104(question:string){const q=question.toLowerCase().trim();if(/entrance|tunnel|entry zone|foot point/.test(q))return {answer:"Route 104 does not contain University Park entrance-zone or dwell-time data. Ask about Route 104 tracks, frames, proximity observations, or vehicle subtype proposals."};if(/collision|near miss|emergency|danger/.test(q))return toolResponse(await executeRoute104Tool("methodology_lookup",{topic:"person_vehicle_proximity"}));
 if(/how many subtype proposals were validated/.test(q)){const count=(await loadRoute104Data()).subtypes.filter(s=>s.validated).length;return {answer:`${count} Route 104 vehicle subtype proposals were validated. The detailed subtype proposals remain experimental and unvalidated.`,routeEvidence:{sceneId:"route-104" as const,tool:"vehicle_subtype_distribution",result:count,files:["Route104/vehicle_subtypes.json"]}}}
 if(/raw track ids.*each class/.test(q)){const data=await loadRoute104Data();return {answer:`Raw track IDs by stable base class: ${ROUTE104_CLASSES.map(c=>`${c} ${data.tracks.filter(t=>t.base_class===c).length}`).join(", ")}. These are generated track IDs, not verified unique road users.`,routeEvidence:{sceneId:"route-104" as const,tool:"track_count_by_class",result:data.tracks.length,files:["Route104/tracks.json"]}}}
 const track=q.match(/track(?: id)?\s*#?\s*(\d+)/),frame=q.match(/(?:processed )?frame\s*(\d+)/),number=q.match(/(?:above|over|more than)\s*(0(?:\.\d+)?|1(?:\.0+)?)\b/);const cls=ROUTE104_CLASSES.find(c=>q.includes(c));
 if(frame)return toolResponse(await executeRoute104Tool(/proximity|pair|happened/.test(q)?"proximity_by_frame":"frame_observations",{processed_frame_index:Number(frame[1])}));
 if(track&&/subtype|proposal/.test(q))return toolResponse(await executeRoute104Tool("vehicle_subtype_lookup",{track_id:Number(track[1])}));if(track)return toolResponse(await executeRoute104Tool("track_lookup",{track_id:Number(track[1])}));
 if(cls&&/how many|count/.test(q))return toolResponse(await executeRoute104Tool("track_count_by_class",{class:cls}));
 if(/classes were detected|what classes|vehicle base classes/.test(q))return toolResponse(await executeRoute104Tool("dataset_summary"));if(/how long|source frames|processed frames|detector|tracker|confidence threshold|image size|maximum|peak number|busiest processed/.test(q))return toolResponse(await executeRoute104Tool("dataset_summary"));
 if(/less than|shorter than/.test(q)){const seconds=Number(q.match(/(\d+(?:\.\d+)?)\s*second/)?.[1]??1);return toolResponse(await executeRoute104Tool("short_track_count",{seconds}))}
 if(/longest/.test(q))return toolResponse(await executeRoute104Tool("track_ranking",{metric:"observed_span_sec",limit:1}));if(/most observations/.test(q))return toolResponse(await executeRoute104Tool("track_ranking",{metric:"observations",limit:5}));if(/path length/.test(q))return toolResponse(await executeRoute104Tool("track_ranking",{metric:"consecutive_sample_path_length_px",limit:1}));if(/speed|fastest/.test(q))return toolResponse(await executeRoute104Tool("track_ranking",{metric:"average_image_speed_px_per_sec",limit:1}));
 if(/most.*proximity|involved in.*proximity/.test(q))return toolResponse(await executeRoute104Tool("proximity_ranking",{kind:q.includes("person-person")?"person_person":"person_vehicle",limit:5}));if(/proximity|threshold|zero.pixel clearance/.test(q)){if(/threshold/.test(q))return toolResponse(await executeRoute104Tool("proximity_summary"));if(/person.person/.test(q)||/person.vehicle/.test(q))return toolResponse(await executeRoute104Tool("proximity_summary"))}
 if(/subtype|proposal/.test(q)){if(/how|why|difference|ground truth/.test(q))return toolResponse(await executeRoute104Tool("methodology_lookup",{topic:"vehicle_subtypes"}));if(/highest confidence/.test(q)){const top=(await loadRoute104Data()).subtypes.reduce((a,b)=>b.proposal_confidence>a.proposal_confidence?b:a);return toolResponse(await executeRoute104Tool("vehicle_subtype_lookup",{track_id:top.track_id}))}if(number)return toolResponse(await executeRoute104Tool("vehicle_subtype_confidence_filter",{threshold:Number(number[1])}));const known=[...new Set((await loadRoute104Data()).subtypes.map(s=>s.proposed_subtype.toLowerCase()))].find(s=>q.includes(s));return toolResponse(await executeRoute104Tool("vehicle_subtype_distribution",known?{subtype:known}:{}))}
 if(/track.id.*not unique|unique road.user|limitations/.test(q))return toolResponse(await executeRoute104Tool("methodology_lookup",{topic:"limitations"}));if(/how.*tracked|method/.test(q))return toolResponse(await executeRoute104Tool("methodology_lookup",{topic:"tracking"}));
 return {answer:"The available Route 104 exports do not support that question. The assistant calculates supported answers from exported JSON and does not inspect the video directly."}
}
