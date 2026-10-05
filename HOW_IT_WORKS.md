# How the System Works: Technical Overview

Two analysis paths feed one dashboard: **pedestrian flow tracking** (unique people and entry zones) and **crowd density and proximity** (per frame detections, grid occupancy, pairwise proximity alerts). A later **metric graph** export extends the density log into per-cell matrices plus a framewise proximity graph. Both pipelines end in JSON outputs and a grounded LLM query layer.

## 1. Object Detection (YOLOv8)
Every frame is passed through YOLOv8 to find people and draw bounding boxes. Runs at 1280px input resolution (not the default 640px) because aerial subjects are small; YOLO downscales each frame before inference, so at 640px small people lose too many pixels and are missed. Higher resolution preserves them, improving recall (catching more real people). Tradeoff: higher resolution costs more compute. Confidence threshold ~0.25 decides what counts as a detection. YOLO is single stage (fast, video capable) but limited to the 80 COCO classes.

## 2. Confidence Threshold
Each detection has a confidence score; the threshold is the keep/discard cutoff. Lower (0.15) = higher recall (catches more small/faint people) but more false positives (lower precision). Higher (0.25+) = cleaner detections (higher precision) but misses faint/occluded people (lower recall). It trades precision vs recall; the right value depends on the use case.

## 3. Multi Object Tracking (ByteTrack), pedestrian flow pipeline only
The **pedestrian flow workspace** uses tracking. Detection alone has no memory (each frame independent), so one person over 100 frames would be counted many times. Tracking assigns each person a persistent ID across frames, so we count unique IDs, not raw detections. ByteTrack predicts each person's next position and matches to new detections; it uses both high and low confidence detections to hold tracks through brief occlusion.
Failure mode: ID switching / fragmentation. When someone is occluded and reappears, the tracker may assign a new ID, so one real person gets two IDs and is counted twice. This is why an early count of ~93 differed from the true ~60.

## 4. Counting Logic, Zones, Validation, pedestrian flow pipeline
- Minimum persistence filter: a track must persist a minimum number of frames to count, discarding flicker/noise.
- Zone based assignment: the scene is split into entry zones (left, right, tunnel, etc.); each person is credited to where they first appeared, giving directional flow, not just a total.
- Ground truth validation: manually counted the real people (~60) and compared, to MEASURE accuracy and TUNE parameters. This is evaluation/tuning, NOT training. The models are pre trained and used off the shelf.

## 5. Crowd density and proximity, detection only pipeline
The **Crowd density and proximity** tab uses a separate pass documented in `grid.json` and shown in `grid_output.mp4`. It runs YOLOv8 person detection (`model.predict`) on strided frames with **tracking disabled**. There are no persistent IDs, ByteTrack, motion prediction, or temporal confirmation in this pipeline.

For each processed frame:
1. **Estimated foot point:** bottom center of each person bounding box (an estimate of where the person stands on the ground, not a guaranteed ground contact measurement).
2. **Grid occupancy:** the scene is divided into a grid (e.g. 10×10). Each detection’s foot point falls in one cell; the grid counts how many detections occupy each cell that frame. The heatmap visualizes occupancy only. Cell population does **not** trigger proximity alerts. Changing grid resolution changes the occupancy visualization, not the pairwise alert rule.
3. **Proximity alerts in this video/JSON export:** Euclidean distance between foot points in **original video pixel coordinates**. The `grid.json` note uses the earlier inclusive rule (distance at or below `proximity_threshold_px`). Detection was not rerun for later exports.

The annotated video and `grid.json` were **not regenerated** for the paper-aligned graph package. **Proximity alerts are not validated emergencies** and the pixel threshold is not a calibrated safe standoff distance.

## 6. Metric graph export (Cell matrices tab)
The **Cell matrices** tab reads `Metric_Graph_Research_Data/`: one compact `frame_index.json` plus one JSON file per processed frame. Detection was not rerun. This export implements the framewise pixel-space portion of the professor’s metric-graph notes:

- Occupancy C: detections per rectangular cell (image 1920×1080, grid 10×10, cells 192×108, not squares).
- Global distance matrix D and within-cell distance matrices, original video pixels.
- Adjacency A: 1 only for distinct pairs with **distance strictly less than 60 px** (paper rule). No pair in this dataset is exactly 60 px, so observed alert counts match the earlier inclusive export.
- Frame graph: nodes at estimated `foot_xy_px`; edges are the supplied close pairs only. Degree is the number of close neighbors. Threshold depth for a flagged pair is 60 minus distance. Frame max depth is geometric, not a danger score.
- Connected components include isolates. A component can be a chain; it is not necessarily a clique. Component IDs are frame local.
- Graph Laplacian is available as an optional matrix view.
- Neighboring-cell search was compared with all-pairs search on all 589 frames and 12 synthetic cases (142,196 all-pairs checks vs 51,310 localized checks, about 63.9% fewer pair-distance checks). That is a comparison-count reduction, not a measured runtime speedup. The exporter still computes both methods and full matrices for validation.

Validation checks numerical consistency with the supplied coordinates. It does not establish detection accuracy or physical safety. Calibration, uncertainty-certified labels, pair exposure/persistence, and motion sampling guarantees are unavailable and were not fabricated.

## 7. LLM Query Layer
Structured JSON (`results.json` for pedestrian flow, compact `grid.json` for the earlier density export, compact metric-graph totals, plus this methodology file) ground the Scene Copilot. Full per-frame D/A/Laplacian matrices are not injected into the prompt. The LLM (GPT 4o mini) answers in plain English using only that evidence. It must not invent counts, methods, or emergencies; it must keep the pipelines separate (do not sum per frame detections into unique person totals; do not treat alert frames as distinct emergency events). gpt-4o-mini is used because it is cheap, fast, and sufficient. The value is in grounding (prompt design), not model size.
