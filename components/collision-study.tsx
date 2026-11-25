"use client";

const steps = [
  ["Detect and track", "Vehicle detections provide boxes, and track IDs let us follow vehicles across frames."],
  ["Estimate the road", "Apple Depth Pro 2 estimated depth from the first CCTV frame. Exposed asphalt samples became 3D points using the estimated focal length, then a flat road plane was fitted. The fixed camera let us reuse that plane. Raw depth readings from the cars were not compared to decide collisions."],
  ["Place vehicles on the road", "A point near each box’s bottom center approximated ground contact. A camera ray through that point met the road plane at an estimated road position. Each vehicle received a rectangular footprint aligned with the curb; its size and orientation were assumptions, not measurements."],
  ["Forecast overlap", "Recent road positions estimated velocity. Under constant velocity, the test checked whether two footprints would overlap at the same future instant within two seconds. Passing beside another vehicle did not trigger this test."],
] as const;

export function CollisionStudy() {
  return <article className="space-y-6 text-[17px] leading-[1.7]">
    <header className="instrument-border bg-paper p-6 sm:p-8">
      <p className="font-mono text-sm font-bold uppercase text-crimson">Scene 03 · CCTV case study</p>
      <h2 className="mt-2 text-3xl font-black">Collision Forecasting Study</h2>
      <p className="mt-3 max-w-4xl text-lg">Using estimated road geometry to reduce false warnings from an angled CCTV camera</p>
      <p className="mt-5 max-w-4xl">An angled CCTV camera can make vehicles look like they overlap even when there is room to pass. In this case study, we compared a forecast based on image overlap with one that estimated where vehicles were on the road. The road-based forecast stopped warning about the three cars the van passed and kept the warning for the sedan it hit.</p>
    </header>

    <figure className="instrument-border bg-paper p-4 sm:p-6">
      <video controls playsInline preload="metadata" className="aspect-video w-full bg-ink" src="/videos/collision/1.mp4">Your browser does not support video playback.</video>
      <figcaption className="mt-3 text-base text-muted">At 3.71 seconds, the forecast flags the van and sedan. The red boxes and alarm mark the warning, not the moment of impact.</figcaption>
    </figure>

    <section className="instrument-border bg-paper p-6 sm:p-8">
      <h3 className="text-2xl font-black">Why the earlier version raised false warnings</h3>
      <p className="mt-3">The earlier version forecast overlap between vehicle regions in the camera image. It warned about parked cars with track IDs 6, 5, and 4, although the van passed all three without contact.</p>
      <p className="mt-3">V4 improved the van’s motion estimate by tracking visual features across frames, but still checked overlap in the image. Better motion tracking alone did not resolve the sideways gap between vehicles on the road.</p>
    </section>

    <section className="instrument-border bg-paper p-6 sm:p-8">
      <h3 className="text-2xl font-black">How the depth-based forecast works</h3>
      <ol className="mt-5 grid gap-4 md:grid-cols-2">{steps.map(([title,body],i)=><li key={title} className="border-l-4 border-crimson bg-canvas p-4"><p className="font-mono text-sm font-bold text-crimson">0{i+1}</p><h4 className="mt-1 text-lg font-bold">{title}</h4><p className="mt-2">{body}</p></li>)}</ol>
    </section>

    <section className="instrument-border bg-paper p-6 sm:p-8">
      <h3 className="text-2xl font-black">What changed in this clip</h3>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-y border-line bg-canvas"><th className="p-3">Vehicle pair</th><th className="p-3">V4 image-overlap forecast</th><th className="p-3">Depth-based forecast</th></tr></thead><tbody><tr className="border-b border-line"><td className="p-3">Passed cars: IDs 6, 5, 4</td><td className="p-3">Warned about all three</td><td className="p-3">Zero warnings for these pairs on evaluated frames, across nine settings</td></tr><tr><td className="p-3">Sedan hit: ID 2</td><td className="p-3">First warning at 3.67 s</td><td className="p-3">Warned in all nine settings; first warning 3.58–3.83 s. Default: 3.71 s</td></tr></tbody></table></div>
      <p className="mt-4">Visible impact was estimated at 4.4–4.5 s. The default warning therefore led it by roughly 0.7–0.8 s, about one frame later than V4. The improvement was fewer pass-by warnings, not an earlier warning.</p>
      <p className="mt-3">The nine settings are sensitivity checks on this same clip: assumed vehicle width at −20%, default, and +20%, crossed with horizontal image-anchor shifts of −8%, 0%, and +8% of box width. They are not nine independent videos or a general accuracy benchmark.</p>
    </section>

    <section className="instrument-border bg-paper p-6 sm:p-8">
      <h3 className="text-2xl font-black">What the demo shows and does not prove</h3>
      <p className="mt-3">The predictor evaluated available vehicle pairs. The final replay focuses on van ID 7 and sedan ID 2, drawing red boxes and playing an alarm when their saved forecast triggers. The display pair was selected for this replay; the warning time came from forecast results, not a hand-set cue.</p>
      <p className="mt-3">Dr. Oussa’s suggestion connects camera perspective to proximity judgments and asks us to compare where objects will be at the same time. A tilted-camera simulation tested geometry with known inputs; this CCTV case used estimated depth and approximate footprints. This is one clip, not a calibrated measurement, mathematical certificate, or validation of a live warning system.</p>
    </section>
  </article>;
}
