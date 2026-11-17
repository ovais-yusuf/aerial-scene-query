export type SceneId = "university-park" | "route-104";
export type Route104Tab = "tracking" | "proximity" | "vehicles";

export interface SceneCopilotConfig {
  id: SceneId;
  displayName: string;
  title: string;
  description: string;
  datasetBadge: string;
  datasets: readonly string[];
  suggestedQuestions: readonly string[];
  tabSuggestions?: Partial<Record<Route104Tab, readonly string[]>>;
  methodologyContext: string;
  limitations: readonly string[];
  supportedIntents: readonly string[];
  unsupportedTopics: readonly string[];
}

export const SCENE_CONFIGS: Record<SceneId, SceneCopilotConfig> = {
  "university-park": {
    id: "university-park",
    displayName: "University Park",
    title: "University Park Copilot",
    description: "Ask about pedestrian flow, entry zones, dwell time, density, proximity and cell matrices.",
    datasetBadge: "UNIVERSITY PARK DATA",
    datasets: ["results.json", "grid.json", "trajectory exports", "cell-matrix data", "HOW_IT_WORKS.md"],
    suggestedQuestions: [
      "Which entrance produced the most track IDs?",
      "What was the peak visible pedestrian count?",
      "How many track IDs spent more than five seconds in TUNNEL?",
      "How many frames contained person-person proximity?",
    ],
    methodologyContext: "University Park person detection, ByteTrack trajectories, entry zones, density grid, proximity export and cell matrices.",
    limitations: ["Track IDs are not guaranteed unique people.", "Distances are pixels, not meters.", "The assistant does not inspect video."],
    supportedIntents: ["entry origins", "peak count", "zone dwell", "density", "person proximity", "grid occupancy", "cell matrices", "methodology"],
    unsupportedTopics: ["vehicle counts", "vehicle subtypes", "identity", "physical safety conclusions"],
  },
  "route-104": {
    id: "route-104",
    displayName: "Route 104",
    title: "Route 104 Copilot",
    description: "Ask about tracked road users, vehicle classes, proximity observations and experimental vehicle subtype proposals.",
    datasetBadge: "ROUTE 104 DATA",
    datasets: ["summary.json", "tracks.json", "frames.jsonl", "vehicle_subtypes.json"],
    suggestedQuestions: [
      "What base classes were detected?",
      "How many raw track IDs were produced for each class?",
      "How many frames contained person-person proximity?",
      "How many frames contained person-vehicle proximity?",
      "What thresholds were used?",
      "Which vehicle subtypes were proposed?",
      "How many subtype proposals were validated?",
      "Why are track-ID totals not unique road-user counts?",
      "What are the Route 104 limitations?",
    ],
    tabSuggestions: {
      tracking: ["Which track lasted the longest?", "What was the peak number of tracked objects?", "Show track ID 3."],
      proximity: ["What thresholds were used?", "Which tracks had the most person-vehicle proximity observations?", "What happened in processed frame 1198?"],
      vehicles: ["How many subtype proposals were unknown?", "Which proposal had the highest confidence?", "Explain base class versus proposed subtype."],
    },
    methodologyContext: "Route 104 multi-class detection, ByteTrack tracking, pixel-space proximity and unvalidated open-vocabulary subtype proposals.",
    limitations: ["Track IDs can fragment or switch.", "Subtype proposals are not ground truth.", "Distances and speeds are image-space only.", "Proximity does not prove a collision or near miss."],
    supportedIntents: ["dataset summary", "track count", "track lookup", "track ranking", "frame observations", "proximity", "subtype analysis", "methodology"],
    unsupportedTopics: ["entry zones", "unique road-user totals", "physical speed", "collision confirmation", "validated vehicle subtype ground truth"],
  },
};

export function isSceneId(value: unknown): value is SceneId {
  return value === "university-park" || value === "route-104";
}
