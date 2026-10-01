export interface CellAlertHint {
  row: number;
  col: number;
  pairs: number;
}

export interface CellMatrixIndexFrame {
  processed_frame: number;
  nominal_output_time_sec?: number;
  detection_count?: number;
  occupancy_matrix: number[][];
  within_cell_close_pairs?: number;
  cross_cell_close_pair_count?: number;
  total_close_pairs?: number;
  people_in_alert?: number;
  within_alert_cells?: CellAlertHint[];
}

export interface CellMatrixIndex {
  schema_version?: string;
  description?: string;
  source_file?: string;
  grid: [number, number];
  proximity_threshold_px?: number;
  distance_coordinate_space?: string;
  model?: string;
  tracking_enabled?: boolean;
  frames_processed?: number;
  peak_cell_count_over_run?: number;
  conventions: {
    alert_rule?: string;
    identity?: string;
    distance?: string;
    threshold_interpretation?: string;
    symmetry?: string;
    time?: string;
    cross_cell_extension?: string;
  };
  limitations: string[];
  validation?: {
    status?: string;
    frames_checked?: number;
    cells_checked?: number;
    distance_matrix_entries_checked?: number;
    within_cell_flagged_pair_observations?: number;
    cross_cell_flagged_pair_observations?: number;
    frames_with_cross_cell_alerts?: number;
    meaning?: string;
  };
  frames: CellMatrixIndexFrame[];
}

export interface OccupiedCell {
  row: number;
  col: number;
  count: number;
  labels: string[];
  detection_indices: number[];
  feet_xy_px: number[][];
  distance_matrix_px: number[][];
  proximity_matrix: number[][];
  within_cell_close_pairs: number;
}

export interface CrossCellPair {
  a?: number;
  b?: number;
  label_a?: string;
  label_b?: string;
  cell_a?: number[];
  cell_b?: number[];
  distance_px?: number;
}

export interface CellMatrixFrameDetail {
  processed_frame: number;
  nominal_output_time_sec?: number;
  detection_count?: number;
  occupancy_matrix: number[][];
  within_cell_close_pairs?: number;
  cross_cell_close_pairs: CrossCellPair[];
  total_close_pairs?: number;
  people_in_alert?: number;
  occupied_cells: OccupiedCell[];
}
