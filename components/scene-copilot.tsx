"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import type { Evidence } from "@/lib/trajectory-engine";

type Message = { role: "user" | "assistant"; content: string; evidence?: Evidence; queryContext?: string };

const EXAMPLE_QUESTIONS = [
  "Which entrance was busiest?",
  "How many frames had proximity alerts?",
  "What triggers a proximity alert?",
  "Why use feet positions?",
  "Does the grid size affect alerts?",
  "What are the current limitations?",
];

export function SceneCopilot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  useEffect(() => {
    // Scroll only the conversation, never move the surrounding workspace.
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [messages, isAsking]);

  async function ask(rawQuestion: string) {
    const cleaned = rawQuestion.trim();
    if (!cleaned || isAsking) return;

    setMessages((current) => [...current, { role: "user", content: cleaned }]);
    setQuestion("");
    setSuggestionsOpen(false);
    setIsAsking(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleaned, messages: messages.slice(-8).map(({role,content,queryContext})=>({role,content:content.slice(0, role === "user" ? 500 : 4000), ...(queryContext ? {queryContext} : {})})) }),
      });
      let payload: { answer?: string; error?: string; evidence?: Evidence; queryContext?: string } = {};
      try {
        payload = (await response.json()) as { answer?: string; error?: string; evidence?: Evidence; queryContext?: string };
      } catch {
        payload = {};
      }
      if (!response.ok) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content:
              payload.error ??
              (response.status === 404
                ? "Scene Copilot API was not found. Restart the dev server (npm run dev) and try again."
                : "The Scene Copilot could not answer right now. Please try again."),
          },
        ]);
        return;
      }
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            payload.answer ??
            payload.error ??
            "The Scene Copilot could not respond.",
          evidence: payload.evidence,
          queryContext: payload.queryContext,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "The Scene Copilot could not connect. Please try again.",
        },
      ]);
    } finally {
      setIsAsking(false);
      inputRef.current?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  const suggestions = (
    <div id="copilot-suggestions" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {EXAMPLE_QUESTIONS.map((example) => (
        <button key={example} type="button" onClick={() => void ask(example)} disabled={isAsking}
          className="min-h-11 border border-line bg-white px-3 py-2 text-left text-xs leading-5 transition hover:border-crimson hover:text-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson disabled:opacity-50">
          {example}
        </button>
      ))}
    </div>
  );

  return (
    <section className="instrument-border min-w-0 bg-paper" aria-labelledby="copilot-heading">
      <header className="bg-ink px-4 py-4 text-white sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="copilot-heading" className="flex items-center gap-2 font-extrabold">
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center bg-crimson text-sm">✦</span>
            Scene Copilot
          </h3>
          <span className="border border-white/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wider">Evidence only</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/85">
          Answers pedestrian flow, trajectory, density, proximity, and methodology questions from computed project data. Open-vocabulary object experiments are not yet connected to the assistant.
        </p>
        <ul aria-label="Evidence sources" className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-white/75">
          {[
            ["RESULTS.JSON", "Pedestrian-flow summary"],
            ["GRID.JSON", "Density and proximity summary"],
            ["HOW_IT_WORKS.MD", "Methodology notes"],
            ["Trajectory data", "Frame-by-frame exported track observations"],
          ].map(([label, description]) => <li key={label}><span title={description}>{label}<span className="sr-only">: {description}</span></span></li>)}
        </ul>
      </header>

      <div ref={historyRef} role="log" aria-label="Scene Copilot conversation" aria-live="polite" aria-relevant="additions text" tabIndex={0}
        className="h-[65vh] min-h-[240px] space-y-4 overflow-y-auto overscroll-contain p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-crimson sm:h-[68vh] sm:p-5 [overflow-wrap:anywhere]">
        {messages.length === 0 ? (
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-crimson">Ask the project data</p>
            <p className="mb-5 mt-2 text-sm leading-6 text-ink">Choose a question below or write your own. Answers use exported data and methodology notes.</p>
            {suggestions}
          </div>
        ) : messages.map((message, index) => (
          <article key={`${message.role}-${index}`} aria-label={message.role === "user" ? "Your question" : "Scene Copilot answer"}
            className={message.role === "user" ? "ml-auto w-fit max-w-[94%] border border-ink bg-ink px-4 py-3 text-white" : "min-w-0 border border-line border-l-2 border-l-crimson bg-white px-4 py-4 text-ink"}>
            <p className={`mb-2 font-mono text-[10px] font-bold uppercase tracking-wider ${message.role === "user" ? "text-white/75" : "text-crimson"}`}>
              {message.role === "user" ? "You" : "Scene Copilot"}
            </p>
            <AnswerContent message={message} />
            {message.evidence && <QueryEvidence evidence={message.evidence} />}
          </article>
        ))}
        {isAsking && <p role="status" className="font-mono text-xs text-muted">Reading scene evidence…</p>}
        {messages.length > 0 && suggestionsOpen && <div className="border-t border-line pt-4">{suggestions}</div>}
      </div>

      <footer className="border-t border-line bg-paper">
        {messages.length > 0 && <button type="button" aria-expanded={suggestionsOpen} aria-controls={suggestionsOpen ? "copilot-suggestions" : undefined}
          onClick={() => setSuggestionsOpen(open => !open)}
          className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-xs font-semibold text-ink hover:text-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-crimson">
          Suggested questions <span aria-hidden="true">{suggestionsOpen ? "−" : "+"}</span>
        </button>}
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-line bg-white p-3">
          <label className="sr-only" htmlFor="copilot-question">Question for Scene Copilot</label>
          <input id="copilot-question" ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500}
            placeholder="Ask about this scene…"
            className="min-h-11 min-w-0 flex-1 border border-line bg-paper px-3 text-base text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-crimson" />
          <button type="submit" disabled={!question.trim() || isAsking} aria-label="Send question"
            className="grid h-11 w-11 shrink-0 place-items-center bg-crimson text-lg text-white transition hover:bg-[#A70D26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:bg-line disabled:text-muted">→</button>
        </form>
      </footer>
    </section>
  );
}

function AnswerContent({ message }: { message: Message }) {
  // Only format deterministic evidence-backed answers. Slices preserve every
  // character of backend text; arbitrary prose is displayed unchanged.
  const boundary = message.evidence ? message.content.search(/\.(?=\s+[A-Z])/) : -1;
  if (boundary < 0) return <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>;
  return <div className="whitespace-pre-wrap text-sm leading-6">
    <span className="font-semibold">{message.content.slice(0, boundary + 1)}</span>
    <span className="mt-3 block border-l-2 border-line pl-3 text-xs leading-5 text-muted">{message.content.slice(boundary + 1)}</span>
  </div>;
}

function QueryEvidence({ evidence }: { evidence: Evidence }) {
  const query = evidence.query;
  return <div className="mt-4 min-w-0 text-xs leading-5">
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-y border-line bg-paper p-3">
      <div><dt className="font-mono text-[10px] uppercase text-muted">Result</dt><dd className="font-semibold">{evidence.count} · {evidence.label}</dd></div>
      <div><dt className="font-mono text-[10px] uppercase text-muted">Operation</dt><dd>{query.operation}</dd></div>
      {query.operation === "zone_occupancy_duration" && <>
        <div><dt className="font-mono text-[10px] uppercase text-muted">Zone / threshold</dt><dd>{query.zone} · {query.comparison === "gt" ? ">" : "≥"} {query.threshold_seconds} s</dd></div>
        <div><dt className="font-mono text-[10px] uppercase text-muted">Duration rule</dt><dd>{query.mode}</dd></div>
      </>}
    </dl>
    <details className="mt-3">
      <summary className="cursor-pointer py-2 font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson">Query evidence · IDs, timestamps &amp; limitations</summary>
      <div className="space-y-2 border-l border-line pl-3">
        {evidence.tracks?.map(t => <details key={t.track_id}>
          <summary className="cursor-pointer py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson">Track {t.track_id} · {t.duration_seconds} s</summary>
          <p>Total observed: {t.total_observed_seconds} s. Longest observed sequence: {t.longest_observed_sequence_seconds} s.</p>
          <p>Included in legacy count: {String(t.included_in_legacy_count)}</p>
          {t.intervals.map((v,i) => <p key={i} className="mt-1 border-l border-line pl-2">Source frames {v.start.source_frame_index}–{v.end.source_frame_index}; nominal time {v.start.timestamp_sec}–{v.end.timestamp_sec} s; duration {v.duration_seconds} s.</p>)}
        </details>)}
        {evidence.frames?.map(f => <p key={f.source_frame_index}>Source frame {f.source_frame_index}: {f.timestamp_sec} s</p>)}
        {evidence.origins?.map(o => <details key={o.zone}>
          <summary className="cursor-pointer py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson">{o.zone}: {o.count}</summary>
          {o.tracks.map(t => <p key={t.track_id}>Track {t.track_id}: source frame {t.first_observation.source_frame_index}, {t.first_observation.timestamp_sec} s</p>)}
        </details>)}
        <div className="border-t border-line pt-2">
          <p className="font-semibold">Data provenance</p>
          {evidence.provenance.files.map(file => <p key={file}>{file}</p>)}
          <p>{evidence.provenance.frames_processed} processed frames · {evidence.provenance.raw_track_count} raw track IDs</p>
          {evidence.provenance.position && <p>{evidence.provenance.position}</p>}
        </div>
        <div className="border-t border-line pt-2">
          <p className="font-semibold">Limitations</p>
          <ul className="list-disc space-y-1 pl-4">{evidence.limitations.map(l => <li key={l}>{l}</li>)}</ul>
        </div>
      </div>
    </details>
  </div>;
}
