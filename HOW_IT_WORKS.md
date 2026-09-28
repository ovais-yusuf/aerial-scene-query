# How the System Works — Technical Overview

Pipeline: Aerial video -> Detection (YOLOv8) -> Tracking (ByteTrack) -> Analysis (counting / zones / density grid) -> Results (JSON) -> LLM query layer -> Answer

## 1. Object Detection (YOLOv8)
Every frame is passed through YOLOv8 to find people and draw bounding boxes. Runs at 1280px input resolution (not the default 640px) because aerial subjects are small; YOLO downscales each frame before inference, so at 640px small people lose too many pixels and are missed. Higher resolution preserves them, improving recall (catching more real people). Tradeoff: higher resolution costs more compute. Confidence threshold ~0.25 decides what counts as a detection. YOLO is single-stage (fast, video-capable) but limited to the 80 COCO classes.

## 2. Confidence Threshold
Each detection has a confidence score; the threshold is the keep/discard cutoff. Lower (0.15) = higher recall (catches more small/faint people) but more false positives (lower precision). Higher (0.25+) = cleaner detections (higher precision) but misses faint/occluded people (lower recall). It trades precision vs recall; the right value depends on the use case.

## 3. Multi-Object Tracking (ByteTrack)
Detection has no memory (each frame independent), so one person over 100 frames would be counted 100 times. Tracking assigns each person a persistent ID across frames, so we count unique IDs, not raw detections. ByteTrack predicts each person's next position and matches to new detections; it uses both high- and low-confidence detections to hold tracks through brief occlusion.
Failure mode: ID switching / fragmentation. When someone is occluded and reappears, the tracker may assign a new ID, so one real person gets two IDs and is counted twice. This is why an early count of ~93 differed from the true ~60.

## 4. Counting Logic, Zones, Validation (engineering on top)
- Minimum persistence filter: a track must persist a minimum number of frames to count, discarding flicker/noise.
- Zone-based assignment: the scene is split into entry zones (left, right, tunnel, etc.); each person is credited to where they first appeared, giving directional flow, not just a total.
- Ground-truth validation: manually counted the real people (~60) and compared, to MEASURE accuracy and TUNE parameters. This is evaluation/tuning, NOT training — the models are pre-trained and used off the shelf.

## 5. Density Grid + Emergency Detection (Dr. Oussa's approach)
Divide the scene into a grid (e.g. 5x5). For each person, use the FEET position (bottom-center of the box) because the grid represents ground positions and a person stands where their feet are; the box center is at chest height, which projects to the wrong ground point from an aerial angle. Assign each person to the cell their feet fall in. Build a count matrix X(i,j,t) = people per cell per frame (and a binary occupied/not version). Emergency detection: if a cell's count crosses a threshold (example: 3), flag it red as possible dangerous crowding.
Current limitation: the grid is in pixels, not real-world meters. Due to perspective, far cells cover more real area than near cells, so a fixed "3 per cell" is not a consistent physical density. Making the threshold meaningful (people per square meter) requires camera calibration / homography to map pixels to real ground coordinates. This is Phase 2.

## 6. LLM Query Layer
The vision pipeline outputs structured results (JSON: counts, zones, per-person data). The LLM (gpt-4o-mini) answers user questions in plain English, but is GROUNDED: it answers only from the JSON, not its own knowledge. A system prompt enforces rules: answer only from the data; detects persons not students; only standard classes exist; counts are approximate; and refuse/acknowledge when the data cannot answer (e.g. "how many trees?") instead of hallucinating. Grounding prevents confident made-up answers; refusing keeps it trustworthy. gpt-4o-mini is used because it is cheap, fast, and sufficient — the value is in the grounding (prompt design), not model size.