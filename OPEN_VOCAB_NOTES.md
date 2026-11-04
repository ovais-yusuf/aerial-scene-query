# Open-Vocabulary Detection: Experiment Note

Status of this note: the person-prompt comparison section records results that
were independently recomputed from `comparison.json`. The category-prompt
section describes a planned run whose results are not yet filled in. Nothing
here claims accuracy, precision, recall, or F1, because no human-verified
bounding boxes exist for this footage.

## 1. Why open-vocabulary detection was tested

The capstone proposal includes open-vocabulary detection and a comparison with
the existing fixed-class detector. The production pedestrian pipeline uses
YOLOv8x filtered to the COCO `person` class, so it can only answer questions
about people. Open-vocabulary detection accepts free-text category prompts, so
the goal is to test two things: first, that a prompt-driven detector runs on
the same aerial footage, and second, whether it can propose scene categories
the person-only pipeline cannot express.

## 2. Models and settings

Both models were run on the same frames with the same inference settings. This
is a comparison between two different model sizes, not a controlled
architecture-only ablation.

- Baseline detector: `yolov8x.pt`
- Open-vocabulary detector: `yolov8l-worldv2.pt`, prompt `person`
- Input resolution: 1280
- Confidence threshold: 0.25
- NMS IoU: 0.7
- Max detections: 300
- Tracking: disabled
- Device: single GPU (runs confirmed on an NVIDIA L40S)

Source video: `/projectnb/ct-vehicle-bws/data/still.mov`

The ten source-frame indices, selected from the video length before any model
was run, were:

```
0, 196, 392, 589, 785, 982, 1178, 1375, 1571, 1768
```

Runtime was not measured rigorously. A single early inference time was observed
during setup, but it is not a benchmark and is not reported as one.

## 3. Detection counts (person prompt)

Per-frame person detection counts. These are raw detections per frame, which
are repeated observations across frames, not unique people.

| Frame | YOLOv8x | YOLO-World-L |
|---:|---:|---:|
| 0 | 20 | 15 |
| 196 | 19 | 16 |
| 392 | 21 | 15 |
| 589 | 19 | 16 |
| 785 | 19 | 13 |
| 982 | 19 | 16 |
| 1178 | 23 | 17 |
| 1375 | 31 | 19 |
| 1571 | 28 | 22 |
| 1768 | 23 | 20 |
| **Total** | **222** | **169** |

In this ten-frame sample, YOLO-World with the `person` prompt produced fewer
detections than the YOLOv8x baseline in every frame.

## 4. Model agreement, not accuracy

To measure how often the two detectors proposed the same box, boxes were
matched one to one per frame with a greedy highest-IoU assignment at a 0.5 IoU
threshold. Each box can match at most once.

- Matched pairs: 166
- YOLOv8x-only boxes: 56
- YOLO-World-only boxes: 3

These figures are internally consistent with the counts above: 166 matched plus
56 unmatched gives YOLOv8x's 222, and 166 matched plus 3 unmatched gives
YOLO-World's 169.

This is agreement between two models, not correctness. A box found by only one
model may be a correct person the other model missed, a localization
disagreement, a duplicate detection, or a false positive. Without independent
labels, this analysis cannot assign any of those outcomes, so it does not
support a claim that either detector is more accurate.

Per-frame breakdown of the matching:

| Frame | YOLOv8x | YOLO-World-L | Matched | YOLOv8x-only | YOLO-World-only |
|---:|---:|---:|---:|---:|---:|
| 0 | 20 | 15 | 15 | 5 | 0 |
| 196 | 19 | 16 | 15 | 4 | 1 |
| 392 | 21 | 15 | 14 | 7 | 1 |
| 589 | 19 | 16 | 16 | 3 | 0 |
| 785 | 19 | 13 | 13 | 6 | 0 |
| 982 | 19 | 16 | 16 | 3 | 0 |
| 1178 | 23 | 17 | 17 | 6 | 0 |
| 1375 | 31 | 19 | 19 | 12 | 0 |
| 1571 | 28 | 22 | 21 | 7 | 1 |
| 1768 | 23 | 20 | 20 | 3 | 0 |

## 5. Qualitative observations

These came from visual inspection of frame 0 and are recorded as observations
to confirm against the saved annotated frames, not as measured results.

- YOLO-World missed some distant people that YOLOv8x detected.
- Both models missed some very small or occluded people near or inside the tunnel.
- YOLOv8x appeared to duplicate the partially visible person at the extreme left.
- YOLO-World's extreme-left box extended well below the visible person.

## 6. Why no accuracy metrics

No independently human-verified bounding boxes were produced for this footage,
and manual annotation was declined. Precision, recall, F1, true positives,
false positives, and false negatives all require verified ground truth.
Reporting them from model output alone, or from one model treated as truth,
would be false. The defensible terms for this work are detection counts, model
agreement, and provisional observations.

Defensible conclusion:

> YOLO-World was integrated successfully with the text prompt `person`. On this
> ten-frame sample it produced fewer person detections than the YOLOv8x
> baseline, and the two models agreed on 166 of their boxes at IoU 0.5. The
> experiment establishes compatibility and detector disagreement, not
> comparative accuracy.

## 7. Decision on the operational detector

YOLOv8x remains the operational pedestrian detector for the tracking pipeline.
Nothing in this comparison establishes that YOLO-World is more accurate, so
there is no verified basis to replace the baseline. The value of YOLO-World for
this project is open-vocabulary category proposal, tested next, not a drop-in
person-detector swap.

## 8. Planned category-prompt test

The next step tests YOLO-World on categories the person-only pipeline cannot
express, using prompts chosen in advance and the same ten frames. The script is
`probe_categories.py`, which writes to its own `runs/category_probe_<timestamp>/`
directory and does not touch the pedestrian pipeline.

Initial prompts: `bench`, `picnic table`.

A note on COCO, to avoid an earlier error: `bench` is a COCO class (index 13),
so the absence of benches from production answers is a consequence of filtering
inference to the `person` class, not of the category being missing from COCO.
`picnic table` is not among the 80 COCO classes, so it is the clearer test of
genuine open-vocabulary value. Do not describe any category as absent from COCO
without checking the class list.

Run output directory: `runs/category_probe_20261103_213548/`. Settings were
the same as the person-prompt run: `yolov8l-worldv2.pt`, resolution 1280,
confidence 0.25, NMS IoU 0.7, tracking disabled, on the ten frame indices
listed in Section 2.

Detection counts per frame. These are raw model proposals per prompt, not
confirmed objects. The hits and misses column is deliberately left pending
until the annotated frames are inspected by eye.

| Prompt | 0 | 196 | 392 | 589 | 785 | 982 | 1178 | 1375 | 1571 | 1768 | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bench | 4 | 2 | 2 | 2 | 2 | 3 | 2 | 2 | 2 | 2 | 23 |
| picnic table | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 3 |

What these counts mean, after visual inspection of the annotated frames
(`frame_000000_bench.jpg`, `frame_000982_bench.jpg`,
`frame_000000_picnic_table.jpg`, `frame_001375_picnic_table.jpg`). The judgments
below are qualitative, made by eye at display resolution. They are not accuracy
measurements, and no human-verified boxes exist.

Bench. The prompt reliably boxes a real wooden slatted bench in the near
foreground in both inspected frames. That is a clear correct detection, and it
is the same bench across frames, which is why the count is steady rather than
the model latching onto noise. A second, smaller detection sits far back near
the central planter. At that distance it is plausibly a bench but cannot be
confirmed from the image. In at least one frame a dark metal picnic table beside
the path is boxed as a bench, which looks like bench versus picnic-table
confusion rather than a clean hit. So the steady two-to-three bench proposals
are one clear correct hit, one probable but unconfirmable hit, and occasional
category confusion.

Picnic table. This is the weaker and more informative result. The foreground of
every frame contains several clearly visible metal mesh picnic tables. The
picnic-table prompt does not detect them. In the frames where it fires at all,
the single box lands on a smaller structure near the path whose identity is not
clearly a picnic table, and the obvious foreground tables are missed entirely.
On this footage at confidence 0.25, picnic-table detection has poor recall on
clear examples and its few detections are not reliable.

Honest hit and miss summary, from the inspected frames:

| Prompt | Clear correct hits | Misses seen | Questionable boxes |
|---|---|---|---|
| bench | real wooden foreground bench, in every inspected frame | some other bench-like objects not consistently boxed | distant planter object (unconfirmable); a metal picnic table boxed as a bench |
| picnic table | none confirmed | multiple obvious foreground metal picnic tables, in all inspected frames | the single near-path detection, identity unclear |

Taken together, these two prompts show the practical range of open-vocabulary
detection on this scene. A common, visually distinct category, bench, is
detected on its clearest instance and tracked steadily. A rarer category, picnic
table, is mostly missed even where instances are obvious and large in frame.
This is the kind of category-dependent behavior the experiment was meant to
surface. It is a qualitative observation, not a measured accuracy difference.
Here "missed" means not boxed in these specific annotated frames, judged by eye,
and the remaining frames (196, 392, 589, 785, 1178, 1571, 1768) were not
individually inspected for this note.

## 9. Provenance and honesty labels

- Settings, frame indices, per-frame counts, the 222 and 169 totals, and the
  166 / 56 / 3 agreement figures: recomputed directly from `comparison.json`
  for this note.
- Frame-0 visual observations: reported from inspection, to be reconfirmed
  against the saved annotated frames.
- Category-prompt counts: recorded from the `probe_categories.py` run output
  (`category_probe_20261103_213548`). The hit and miss judgments come from
  visual inspection, by eye at display resolution, of four annotated frames
  (bench 0 and 982, picnic table 0 and 1375). They are qualitative, not
  accuracy metrics, and the other six frames were not individually inspected.
- No accuracy, precision, recall, or F1 is claimed anywhere, by design.
