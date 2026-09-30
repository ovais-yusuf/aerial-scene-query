"use client";

import { FormEvent, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

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

  async function ask(rawQuestion: string) {
    const cleaned = rawQuestion.trim();
    if (!cleaned || isAsking) return;

    setMessages((current) => [...current, { role: "user", content: cleaned }]);
    setQuestion("");
    setIsAsking(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleaned }),
      });
      let payload: { answer?: string; error?: string } = {};
      try {
        payload = (await response.json()) as { answer?: string; error?: string };
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

  return (
    <section
      className="instrument-border flex min-h-[460px] flex-col bg-paper"
      aria-labelledby="copilot-heading"
    >
      <div className="bg-ink p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center bg-crimson text-sm">
              ✦
            </span>
            <h3 id="copilot-heading" className="font-extrabold">
              Scene Copilot
            </h3>
          </div>
          <span className="border border-white/20 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white/70">
            Evidence only
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/60">
          One assistant for both tabs. Answers use pedestrian flow results,
          crowd density and proximity metrics, and methodology notes. The
          copilot does not inspect video directly.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-white/60">
          <span className="bg-white/10 px-2 py-1">LLM, GPT 4o mini</span>
          <span className="bg-white/10 px-2 py-1">results.json</span>
          <span className="bg-white/10 px-2 py-1">grid.json</span>
          <span className="bg-white/10 px-2 py-1">HOW_IT_WORKS.md</span>
        </div>
      </div>

      <div
        className="flex max-h-64 flex-1 flex-col gap-2 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="border-l-2 border-crimson bg-[#F2F0EB] p-3 text-xs leading-5 text-muted">
            Ask about entry counts, proximity alerts, grid occupancy, or how
            detection, tracking, and the pairwise proximity method work. Proximity
            alerts are not proof of an emergency. If it is not in the evidence,
            I will say so.
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[92%] border px-3 py-2 text-xs leading-5 ${
                message.role === "user"
                  ? "ml-auto border-ink bg-ink text-white"
                  : "border-line bg-white text-ink"
              }`}
            >
              {message.content}
            </div>
          ))
        )}
        {isAsking && (
          <p className="font-mono text-[9px] uppercase tracking-[0.11em] text-muted">
            Reading scene evidence…
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
        {EXAMPLE_QUESTIONS.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => void ask(example)}
            disabled={isAsking}
            className="min-h-10 border border-line bg-white px-2 py-2 text-left text-[11px] font-semibold leading-4 transition hover:border-crimson hover:text-crimson disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>

      <form
        onSubmit={submit}
        className="flex border-t border-line bg-white p-3"
      >
        <input
          ref={inputRef}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
          placeholder="Question this scene…"
          aria-label="Question for Scene Copilot"
          className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted/60"
        />
        <button
          type="submit"
          disabled={!question.trim() || isAsking}
          aria-label="Send question"
          className="grid h-10 w-10 place-items-center bg-crimson text-white transition hover:bg-[#A70D26] disabled:bg-line disabled:text-muted"
        >
          →
        </button>
      </form>
    </section>
  );
}
