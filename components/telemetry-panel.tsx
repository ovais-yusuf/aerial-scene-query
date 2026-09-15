interface TelemetryPanelProps {
  videoUrl: string;
}

export function TelemetryPanel({ videoUrl }: TelemetryPanelProps) {
  return (
    <div className="telemetry-panel" aria-label="UAV telemetry preview">
      {videoUrl ? (
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-55 grayscale"
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="absolute inset-0 telemetry-grid" />
      )}

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 640 500"
        fill="none"
        aria-hidden="true"
      >
        <path d="M54 417C176 366 242 294 323 202C392 124 464 88 594 59" className="track-line" />
        <path d="M34 201C174 228 292 205 405 173C481 151 543 153 614 173" className="track-line track-line-muted" />
        <path d="M51 329L183 259L239 337L105 423Z" className="zone-shape" />
        <path d="M401 83L551 37L611 111L464 158Z" className="zone-shape" />

        <g className="detect-box detect-one">
          <rect x="112" y="331" width="39" height="57" />
          <rect x="112" y="315" width="65" height="14" className="detect-label" />
          <text x="117" y="325" className="detect-text">ID 037 · .94</text>
        </g>
        <g className="detect-box detect-two">
          <rect x="307" y="183" width="34" height="50" />
          <rect x="307" y="168" width="61" height="13" className="detect-label" />
          <text x="312" y="178" className="detect-text">ID 052 · .91</text>
        </g>
        <g className="detect-box detect-three">
          <rect x="477" y="92" width="31" height="46" />
          <rect x="477" y="77" width="59" height="13" className="detect-label detect-label-dark" />
          <text x="482" y="87" className="detect-text detect-text-light">ID 061 · .88</text>
        </g>

        <path d="M24 64V25H63M577 25H616V64M616 436V475H577M63 475H24V436" className="frame-mark" />
        <path d="M307 250H333M320 237V263" className="crosshair" />
      </svg>

      <div className="absolute inset-x-4 top-4 flex justify-between font-mono text-[10px] tracking-[0.14em] text-white/75">
        <span>UAV / CAM 01</span>
        <span>ALT 42.6 M · <b className="font-normal text-crimson">REC</b></span>
      </div>
      <div className="absolute bottom-4 right-4 border-l-2 border-crimson bg-black/65 px-3 py-2 font-mono text-[9px] leading-relaxed tracking-[0.1em] text-white/80">
        TRACKS&nbsp;&nbsp;064<br />
        ZONES&nbsp;&nbsp;&nbsp;006<br />
        STATE&nbsp;&nbsp;&nbsp;ANALYZED
      </div>
    </div>
  );
}
