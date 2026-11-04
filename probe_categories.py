"""
Open-vocabulary category probe for aerial scene understanding.

Purpose: test whether YOLO-World can detect scene categories beyond the
person-only production pipeline, using text prompts chosen in advance. This
is an exploratory detection probe, not an accuracy evaluation. No human
verified bounding boxes are produced here, so it reports detection counts
and confidences only. It does not compute precision, recall, or F1.

This script is standalone. It does not import, modify, or run the YOLOv8x
plus ByteTrack pedestrian pipeline. It writes to its own timestamped output
directory and leaves all existing runs untouched.

Prompts are fixed before any output is examined, per the experiment rules in
the project handoff. Edit PROMPTS to add categories, but record the change in
the research note and rerun cleanly rather than tuning prompts against results.
"""

from pathlib import Path
from datetime import datetime
import json
import re

import cv2
import numpy as np
from ultralytics import YOLOWorld

ROOT = Path("/projectnb/ct-vehicle-bws")
VIDEO = ROOT / "data/still.mov"
WEIGHTS = ROOT / "yolov8l-worldv2.pt"
OUT = ROOT / "runs" / datetime.now().strftime("category_probe_%Y%m%d_%H%M%S")
OUT.mkdir(parents=True, exist_ok=False)

# Category prompts selected in advance, before inspecting any model output.
PROMPTS = ["bench", "picnic table"]

# Shared inference settings. Kept identical to compare_detectors.py so counts
# are comparable to the person-prompt run on the same frames. The confidence
# threshold strongly affects open-vocabulary counts, so it is recorded and
# should be held fixed across prompts within a run.
IMGSZ = 1280
CONF = 0.25
IOU = 0.7
MAX_DET = 300
DEVICE = 0

cap = cv2.VideoCapture(str(VIDEO))
if not cap.isOpened():
    raise RuntimeError(f"Cannot open {VIDEO}")

total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = float(cap.get(cv2.CAP_PROP_FPS))
if total < 1 or fps <= 0:
    cap.release()
    raise RuntimeError("Invalid video frame count or FPS")

# Same ten-frame selection as compare_detectors.py: indices computed from the
# video length alone, independently of any model output.
indices = sorted(set(np.linspace(0, total - 1, 10, dtype=int).tolist()))
samples = {}
index = 0
try:
    while index <= indices[-1]:
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError(f"Video decoding stopped at frame {index}")
        if index in indices:
            samples[index] = frame
        index += 1
finally:
    cap.release()


def save_image(path, image):
    if not cv2.imwrite(str(path), image):
        raise RuntimeError(f"Cannot save {path}")


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


# Save the raw frames so this run is independently inspectable.
for index, frame in samples.items():
    save_image(OUT / f"frame_{index:06d}_raw.jpg", frame)

report = {
    "video": str(VIDEO),
    "weights": str(WEIGHTS),
    "model": "yolo_world_l",
    "imgsz": IMGSZ,
    "confidence_threshold": CONF,
    "iou_threshold": IOU,
    "max_det": MAX_DET,
    "tracking": False,
    "frame_indices_zero_based": indices,
    "prompts_selected_in_advance": list(PROMPTS),
    "fps_nominal": fps,
    "note": (
        "Open-vocabulary category probe, not accuracy evaluation. "
        "No human-verified bounding boxes. Counts are raw detections per "
        "frame, not unique objects and not validated presence. Confidence "
        "threshold affects counts and is fixed per run. A detection is a "
        "model proposal that must still be inspected by a person."
    ),
    "results": [],
}

# One prompt at a time. set_classes re-indexes the chosen prompt to class 0,
# so boxes stay attributable to a single category with no cross-prompt NMS.
model = YOLOWorld(str(WEIGHTS))

for prompt in PROMPTS:
    print(f"\nPrompt: {prompt}", flush=True)
    model.set_classes([prompt])
    tag = slug(prompt)

    for index, frame in samples.items():
        result = model.predict(
            source=frame,
            classes=[0],
            imgsz=IMGSZ,
            conf=CONF,
            iou=IOU,
            max_det=MAX_DET,
            device=DEVICE,
            verbose=False,
        )[0]

        image = frame.copy()
        detections = []
        for box in result.boxes:
            coords = box.xyxy[0].cpu().tolist()
            confidence = float(box.conf[0].item())
            detections.append({
                "bbox_xyxy_px": coords,
                "confidence": confidence,
                "prompt": prompt,
            })
            x1, y1, x2, y2 = map(int, coords)
            cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 255), 2)

        # Small header only; no per-box labels obscuring the scene.
        cv2.rectangle(image, (0, 0), (820, 38), (0, 0, 0), -1)
        title = f"yolo_world_l | prompt: {prompt} | frame {index} | detections: {len(detections)}"
        cv2.putText(
            image, title, (10, 26),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6,
            (255, 255, 255), 1, cv2.LINE_AA,
        )
        save_image(OUT / f"frame_{index:06d}_{tag}.jpg", image)

        report["results"].append({
            "model": "yolo_world_l",
            "prompt": prompt,
            "source_frame_index": index,
            "nominal_time_sec": index / fps,
            "detection_count": len(detections),
            "detections": detections,
        })
        print(f"  Frame {index}: {len(detections)} detections", flush=True)

del model

with (OUT / "category_probe.json").open("w") as f:
    json.dump(report, f, indent=2)

# Compact count table for quick reading, derived only from what was saved.
print("\nprompt           " + "  ".join(f"{i:>5}" for i in indices) + "   total")
for prompt in PROMPTS:
    row = {r["source_frame_index"]: r["detection_count"]
           for r in report["results"] if r["prompt"] == prompt}
    cells = "  ".join(f"{row[i]:>5}" for i in indices)
    print(f"{prompt:<15} {cells}   {sum(row.values()):>5}")

print(f"\nFinished. Outputs: {OUT}", flush=True)
print("Next: open the annotated frames and record honest hits and misses "
      "per prompt. Do not convert these counts into accuracy numbers.", flush=True)
