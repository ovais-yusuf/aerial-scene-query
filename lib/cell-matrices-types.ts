export interface MetricGraphIndexFrame {
  processed_frame: number;
  path: string;
  nominal_output_time_sec?: number | null;
  detections?: number;
  frame_alarm?: boolean;
  close_pairs?: number;
  within_cell_close_pairs?: number;
  cross_cell_close_pairs?: number;
  people_in_alert?: number;
  component_count_including_isolates?: number;
  nontrivial_component_count?: number;
  largest_component_size?: number;
  nearest_pair_distance_px?: number | null;
  threshold_margin_px?: number | null;
  max_threshold_depth_px?: number | null;
}

export interface MetricGraphIndex {
  schema_version?: string;
  paper?: string;
  scope?: string;
  grid: [number, number];
  proximity_threshold_px?: number;
  threshold_operator?: string;
  distance_coordinate_space?: string;
  resolution?: [number, number];
  model?: string;
  tracking_enabled?: boolean;
  frames_processed?: number;
  peak_cell_count_over_run?: number;
  conventions: Record<string, string>;
  unavailable_reasons: Record<string, string>;
  dataset: {
    frames?: number;
    cell_records?: number;
    alert_frames?: number;
    within_cell_pair_observations?: number;
    cross_cell_pair_observations?: number;
    pairs_exactly_at_threshold?: number;
    all_pairs_comparisons?: number;
    localized_comparisons?: number;
    comparison_reduction_pct?: number;
    search_scope?: string;
  };
  validation?: {
    status?: string;
    export_frames_checked?: number;
    synthetic_cases?: number;
    checks?: string[];
    scope?: string;
  };
  limitations: string[];
  frames: MetricGraphIndexFrame[];
}

export interface MetricGraphNode {
  index: number;
  label: string;
  foot_xy_px: number[];
  cell: number[];
  degree: number;
  in_alert?: boolean;
  component_id: number;
}

export interface MetricGraphEdge {
  a: number;
  b: number;
  distance_px: number;
  threshold_depth_px?: number;
  cross_cell?: boolean;
}

export interface MetricGraphCell {
  count: number;
  detection_indices: number[];
  labels: string[];
  distance_matrix_px: number[][];
  proximity_matrix: number[][];
}

export interface MetricGraphComponent {
  component_id: number;
  detection_indices: number[];
  size: number;
  edge_count?: number;
  is_clique?: boolean;
}

export interface MetricGraphFrame {
  processed_frame: number;
  nominal_output_time_sec?: number | null;
  nodes: MetricGraphNode[];
  matrix_axis_labels: string[];
  distance_matrix_px: number[][];
  adjacency_matrix: number[][];
  laplacian_matrix: number[][];
  C: MetricGraphCell[][];
  occupancy_matrix: number[][];
  edges: MetricGraphEdge[];
  cross_cell_edges: MetricGraphEdge[];
  components: MetricGraphComponent[];
  summary: {
    detections?: number;
    frame_alarm?: boolean;
    close_pairs?: number;
    within_cell_close_pairs?: number;
    cross_cell_close_pairs?: number;
    people_in_alert?: number;
    component_count_including_isolates?: number;
    nontrivial_component_count?: number;
    largest_component_size?: number;
    nearest_pair_distance_px?: number | null;
    threshold_margin_px?: number | null;
    max_threshold_depth_px?: number | null;
  };
  search_validation?: {
    all_pairs_comparisons?: number;
    localized_comparisons?: number;
    same_edge_set?: boolean;
  };
}
