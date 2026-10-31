"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { AnswerText } from "@/components/answer-text";

type Message = { role: "user" | "assistant"; content: string };

const EXAMPLE_QUESTIONS = [
  "Which entrance was busiest?",
  "How many frames had proximity alerts?",
  "What triggers a proximity alert?",
  "What are the current limitations?",
];

const SOURCES = ["results.json", "grid.json", "cell matrices", "HOW_IT_WORKS.md"];

export function SceneCopilot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasConversation = messages.length > 0;

  const updateLastAssistant = useCallback((content: string) => {
    setMessages((current) => {
      if (current.length === 0) return current;
      const next = current.slice();
      next[next.length - 1] = { role: "assistant", content };
      return next;
    });
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, isAsking]);

  const ask = useCallback(
    async (rawQuestion: string) => {
      const cleaned = rawQuestion.trim();
      if (!cleaned || isAsking) return;

      setMessages((current) => [
        ...current,
        { role: "user", content: cleaned },
        { role: "assistant", content: "" },
      ]);
      setQuestion("");
      setIsAsking(true);

      const controller = new AbortController();
      abortRef.current = controller;
      let streamed = "";

      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: cleaned }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let payload: { error?: string } = {};
          try {
            payload = (await response.json()) as { error?: string };
          } catch {
            payload = {};
          }
          updateLastAssistant(
            payload.error ??
              (response.status === 404
                ? "Scene Copilot API was not found. Restart the dev server (npm run dev) and try again."
                : "The Scene Copilot could not answer right now. Please try again."),
          );
          return;
        }

        if (!response.body) {
          updateLastAssistant("The Scene Copilot could not respond.");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          streamed += decoder.decode(value, { stream: true });
          updateLastAssistant(streamed);
        }
        streamed += decoder.decode();

        if (!streamed.trim()) {
          updateLastAssistant(
            "The analysis did not produce an answer for that question.",
          );
        } else {
          updateLastAssistant(streamed);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          if (!streamed.trim()) updateLastAssistant("Stopped.");
        } else {
          updateLastAssistant(
            "The Scene Copilot could not connect. Please try again.",
          );
        }
      } finally {
        setIsAsking(false);
        abortRef.current = null;
        textareaRef.current?.focus();
      }
    },
    [isAsking, updateLastAssistant],
  );

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    if (isAsking) return;
    setMessages([]);
    setQuestion("");
    textareaRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(question);
    }
  }

  function autoGrow(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }

  return (
    <section
      className="instrument-border flex min-h-[520px] flex-col bg-paper"
      aria-labelledby="copilot-heading"
    >
      <header className="bg-ink px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center bg-crimson text-[11px] font-bold">
              SC
            </span>
            <div>
              <h3 id="copilot-heading" className="text-sm font-bold leading-tight">
                Scene Copilot
              </h3>
              <p className="text-[11px] leading-tight text-white/55">
                Grounded in this scene&apos;s results, not the raw video
              </p>
            </div>
          </div>
          {hasConversation && (
            <button
              type="button"
              onClick={reset}
              disabled={isAsking}
              className="shrink-0 rounded-sm border border-white/20 px-2.5 py-1 text-[11px] text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-40"
            >
              New chat
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowSources((value) => !value)}
          aria-expanded={showSources}
          className="mt-3 flex items-center gap-1.5 text-[11px] text-white/45 transition hover:text-white/70"
        >
          <span>Data sources</span>
          <span
            className={`transition-transform ${showSources ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            ›
          </span>
        </button>
        {showSources && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SOURCES.map((source) => (
              <span
                key={source}
                className="bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/60"
              >
                {source}
              </span>
            ))}
          </div>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
        aria-live="polite"
      >
        {!hasConversation ? (
          <div className="flex flex-1 flex-col">
            <p className="text-[13px] leading-6 text-muted">
              Ask about entry counts, proximity alerts, grid occupancy, or how
              detection, tracking, and the pairwise proximity method work. If an
              answer is not in the evidence, the copilot will say so. Proximity
              alerts are not proof of an emergency.
            </p>
            <div className="mt-auto pt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted/70">
                Try asking
              </p>
              <div className="flex flex-col gap-1.5">
                {EXAMPLE_QUESTIONS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => void ask(example)}
                    className="group flex items-center justify-between gap-2 border border-line bg-white px-3 py-2.5 text-left text-[13px] font-medium text-ink transition hover:border-crimson"
                  >
                    <span>{example}</span>
                    <span
                      className="text-muted transition group-hover:translate-x-0.5 group-hover:text-crimson"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const isLast = index === messages.length - 1;
            const streaming =
              isLast && isAsking && message.role === "assistant";

            if (message.role === "user") {
              return (
                <div key={`user-${index}`} className="flex justify-end">
                  <div className="max-w-[88%] bg-ink px-3 py-2 text-[13px] leading-6 text-white">
                    {message.content}
                  </div>
                </div>
              );
            }

            return (
              <div key={`assistant-${index}`} className="flex flex-col gap-1">
                <div className="max-w-[94%] border border-line bg-white px-3.5 py-3">
                  {message.content ? (
                    <AnswerText text={message.content} />
                  ) : streaming ? (
                    <TypingDots />
                  ) : null}
                </div>
                {message.content && !streaming && (
                  <CopyButton text={message.content} />
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-line bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              autoGrow(event.target);
            }}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={500}
            placeholder="Ask about this scene"
            aria-label="Question for Scene Copilot"
            className="max-h-[120px] min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-6 outline-none placeholder:text-muted/60"
          />
          {isAsking ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              className="grid h-10 w-10 shrink-0 place-items-center bg-ink text-white transition hover:bg-black"
            >
              <span className="h-3 w-3 bg-white" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void ask(question)}
              disabled={!question.trim()}
              aria-label="Send question"
              className="grid h-10 w-10 shrink-0 place-items-center bg-crimson text-base text-white transition hover:bg-[#A70D26] disabled:bg-line disabled:text-muted"
            >
              <span aria-hidden="true">↑</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Reading scene evidence">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
          style={{ animationDelay: `${dot * 160}ms` }}
        />
      ))}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="self-start text-[11px] text-muted/70 transition hover:text-crimson"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
