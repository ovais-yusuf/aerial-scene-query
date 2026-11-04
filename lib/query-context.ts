import { createHmac, timingSafeEqual } from "node:crypto";
import { executeQuery, QueryError, validateQuery, type Dataset, type Query } from "./trajectory-engine";
import { DURATION_CLARIFICATION, type ConversationMessage, explainEvidence, explicitDurationMode } from "./trajectory-copilot";

// A receipt proves that the server executed this query. Bind it to its answer so
// a client cannot attach old query state to a different assistant response.
export function signQueryContext(query: Query, answer: string, key: string): string {
  const body = Buffer.from(JSON.stringify({ query, answer, expires: Date.now() + 60 * 60_000 })).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}
export function verifyQueryContext(token: string, answer: string, key: string, zones: string[]): Query {
  if (token.length > 8000) throw new QueryError("Invalid query context.");
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) throw new QueryError("Invalid query context.");
  const expected = createHmac("sha256", key).update(body).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw new QueryError("Invalid query context signature.");
  let parsed;
  try { parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new QueryError("Malformed query context."); }
  if (!parsed || parsed.answer !== answer || !Number.isFinite(parsed.expires) || parsed.expires < Date.now()) throw new QueryError("Expired or mismatched query context.");
  return validateQuery(parsed.query, zones);
}

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Resolve only explicit edits, never ask the model to fill missing parameters. */
export function resolveQueryFollowup(question: string, previous: Query | PendingDurationQuery | undefined, zones: string[]): { query?: Query; answer?: string } | undefined {
  let rest = question.trim().toLowerCase().replace(/[?!.]+$/g, "");
  const mode = explicitDurationMode(rest);
  const prefix = /^(what about|how about|and|instead|same query|same question)\b/.test(rest);
  const shortEdit = /^(total\b|sequence\b|observed sequence\b|in total|one (observed )?sequence|longest (observed )?sequence|total observed time|for |in |at least |more than )/.test(rest);
  if (!prefix && !shortEdit) return undefined;
  rest = rest.replace(/^(what about|how about|and|instead|same query|same question)\b/, "");
  if (mode) rest = rest.replace(/\b(in total|total observed(?: time)?|total time|total duration|total|cumulative|altogether|one (?:observed )?sequence|longest (?:observed )?sequence|single (?:observed )?sequence|observed sequence|sequence|uninterrupted|continuously|consecutive)\b/g, "");
  let comparison: "gt" | "gte" | undefined;
  if (/\bat least\b/.test(rest)) { comparison = "gte"; rest = rest.replace(/\bat least\b/g, ""); }
  else if (/\b(more than|over)\b/.test(rest)) { comparison = "gt"; rest = rest.replace(/\b(more than|over)\b/g, ""); }
  const duration = rest.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?|${words.join("|")})\\s*(seconds?|minutes?)\\b`));
  let threshold: number | undefined;
  if (duration) {
    threshold = (words.includes(duration[1]) ? words.indexOf(duration[1]) : Number(duration[1])) * (duration[2].startsWith("minute") ? 60 : 1);
    rest = rest.replace(duration[0], "");
  }
  const found = zones.filter(zone => new RegExp(`\\b${escaped(zone.toLowerCase()).replace(/ /g, "\\s+")}\\b`).test(rest));
  for (const zone of found) rest = rest.replace(new RegExp(`\\b${escaped(zone.toLowerCase()).replace(/ /g, "\\s+")}\\b`, "g"), "");
  // Remaining substantive words indicate a new topic or an unknown parameter.
  rest = rest.replace(/\b(in|for|the|with|using|of|time|duration|zone|to|please|instead)\b/g, "").replace(/[,;:\s]/g, "");
  if (rest) {
    if (/\b(in|zone)\b/i.test(question) && (mode || duration || previous?.operation === "zone_occupancy_duration") && !found.length) return { answer: `Please specify one zone: ${zones.join(", ")}.` };
    return undefined;
  }
  if (!mode && !duration && !comparison && !found.length) return undefined;
  if (found.length > 1) return { answer: `Please specify one zone: ${zones.join(", ")}.` };
  const base = previous?.operation === "zone_occupancy_duration" ? previous : undefined;
  const zone = found[0] ?? base?.zone;
  const seconds = threshold ?? base?.threshold_seconds;
  const rule = mode ?? base?.mode;
  const compare = comparison ?? base?.comparison;
  if (!zone || seconds === undefined || !rule || !compare) return { answer: "Please specify the zone, duration threshold, comparison (more than or at least), and total observed time or one observed sequence. There is no complete relevant query to continue." };
  return { query: validateQuery({ operation: "zone_occupancy_duration", zone, threshold_seconds: seconds, comparison: compare, mode: rule }, zones) };
}

export function mayHavePreviousQuery(message: {content:string;queryContext?:string} | undefined): boolean {
  return Boolean(message?.queryContext) || /^\d+ raw track IDs have /.test(message?.content ?? "");
}

/** Older browser sessions sent text only. Never trust a claimed count: validate
 * the parsed specification, rerun it, and require an exact canonical answer. */
export function restorePreviousQuery(
  message: { content: string; queryContext?: string } | undefined,
  key: string,
  dataset: Dataset,
): Query | undefined {
  if (!message) return undefined;
  const zones = Object.keys(dataset.metadata.zones);
  if (message.queryContext) return verifyQueryContext(message.queryContext, message.content, key, zones);
  const match = message.content.match(/^(\d+) raw track IDs have (more than|at least) (\d+(?:\.\d+)?(?:e[+-]?\d+)?) seconds in (.+), using (total observed time|the longest observed sequence) from estimated foot positions\./);
  if (!match) return undefined;
  let query: Query;
  try {
    query = validateQuery({
      operation: "zone_occupancy_duration",
      zone: match[4], threshold_seconds: Number(match[3]),
      comparison: match[2] === "more than" ? "gt" : "gte",
      mode: match[5] === "total observed time" ? "total_observed" : "longest_observed_sequence",
    }, zones);
  } catch (error) {
    if (error instanceof QueryError) return undefined;
    throw error;
  }
  const evidence = executeQuery(dataset, query);
  return explainEvidence(evidence) === message.content ? query : undefined;
}

export type PendingDurationQuery = Omit<Extract<Query, {operation:"zone_occupancy_duration"}>, "mode"> & {mode?: undefined};

// Pending context comes from the user's own bounded question, never from a
// claimed assistant count or a client-supplied unvalidated query object.
export function parsePendingDuration(question: string, zones: string[]): PendingDurationQuery | undefined {
  if (explicitDurationMode(question)) return undefined;
  const pattern = new RegExp(`^how many (?:people|persons|track ids) (?:stayed|spent|remained)(?: time)? in (?:the )?(.+?) (?:for )?(more than|over|at least) (\\d+(?:\\.\\d+)?|${words.join("|")}) (seconds?|minutes?)[?.!]*$`, "i");
  const match = question.trim().match(pattern);
  if (!match) return undefined;
  const zone = zones.find(z => z.toLowerCase() === match[1].trim().toLowerCase());
  if (!zone) return undefined;
  const amount = match[3].toLowerCase();
  const threshold_seconds = (words.includes(amount) ? words.indexOf(amount) : Number(amount)) * (/minute/i.test(match[4]) ? 60 : 1);
  // Reuse the complete validator to check the known fields, then omit the
  // placeholder mode. This specification is never executed until a user chooses.
  const checked = validateQuery({operation:"zone_occupancy_duration",zone,threshold_seconds,comparison:match[2].toLowerCase()==="at least"?"gte":"gt",mode:"total_observed"},zones);
  if (checked.operation !== "zone_occupancy_duration") return undefined;
  const {mode: _mode, ...pending} = checked;
  return pending;
}
export function restorePendingDuration(history: ConversationMessage[], zones: string[]): PendingDurationQuery | undefined {
  const last = history[history.length-1], previous = history[history.length-2];
  if (last?.role !== "assistant" || ![DURATION_CLARIFICATION, "Do you mean total observed time in the zone, or one observed sequence?"].includes(last.content) || previous?.role !== "user") return undefined;
  return parsePendingDuration(previous.content,zones);
}
