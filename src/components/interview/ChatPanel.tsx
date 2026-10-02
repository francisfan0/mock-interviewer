"use client";

import type { ChatStatus } from "ai";
import { useEffect, useRef, useState } from "react";
import type { InterviewUIMessage } from "@/lib/interviewer/tools";
import { Markdown } from "../Markdown";

const QUICK_ACTIONS = [
  "I think I'm done with this part.",
  "Could I get a hint?",
  "Can we move on to the next part?",
];

type Part = InterviewUIMessage["parts"][number];

export function isSystemEvent(text: string) {
  return /^\[[\s\S]*\]$/.test(text.trim());
}

export function ChatPanel({
  messages,
  status,
  error,
  ended,
  showNotes,
  onSend,
}: {
  messages: InterviewUIMessage[];
  status: ChatStatus;
  error?: Error;
  ended: boolean;
  showNotes: boolean;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const send = (text: string) => {
    if (!text.trim() || busy || ended) return;
    onSend(text.trim());
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            {m.parts.map((part, i) => (
              <MessagePart key={i} role={m.role} part={part} showNotes={showNotes} />
            ))}
          </div>
        ))}
        {status === "submitted" && <div className="text-xs text-zinc-500">Interviewer is thinking…</div>}
        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
            {error.message}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!ended && (
        <div className="border-t border-zinc-800 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={busy}
                className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={3}
            placeholder="Ask a clarifying question or talk through your approach…"
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function MessagePart({ role, part, showNotes }: { role: string; part: Part; showNotes: boolean }) {
  switch (part.type) {
    case "text": {
      if (!part.text.trim()) return null;
      if (role === "user") {
        if (isSystemEvent(part.text)) {
          return <div className="text-center text-[11px] text-zinc-600">{part.text.slice(1, -1)}</div>;
        }
        return (
          <div className="ml-8 rounded-lg bg-indigo-600/20 px-3 py-2 text-sm text-zinc-100">
            <Markdown>{part.text}</Markdown>
          </div>
        );
      }
      return (
        <div className="mr-4 rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200">
          <Markdown>{part.text}</Markdown>
        </div>
      );
    }
    case "tool-give_hint":
      if (!part.input) return null;
      return (
        <div className="mr-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            Hint · level {part.input.level ?? "?"}
          </div>
          <Markdown>{part.input.hint ?? ""}</Markdown>
        </div>
      );
    case "tool-run_tests": {
      const out = part.state === "output-available" ? (part.output as { passed?: number; total?: number; compileError?: string }) : null;
      return (
        <div className="text-center text-[11px] text-zinc-500">
          {out
            ? out.compileError
              ? "Interviewer ran your code — it failed to compile"
              : `Interviewer ran tests — ${out.passed}/${out.total} passed`
            : "Interviewer is running your tests…"}
        </div>
      );
    }
    case "tool-advance_part": {
      const out = part.state === "output-available" ? (part.output as { title?: string; partNumber?: number }) : null;
      if (!out?.title) return null;
      return (
        <div className="flex items-center gap-3 py-1 text-xs text-indigo-300">
          <div className="h-px flex-1 bg-indigo-500/30" />
          Part {out.partNumber}: {out.title}
          <div className="h-px flex-1 bg-indigo-500/30" />
        </div>
      );
    }
    case "tool-end_interview":
      return <div className="py-1 text-center text-xs text-zinc-500">Interview ended</div>;
    case "tool-record_observation":
      if (!showNotes || !part.input) return null;
      return (
        <div className="mr-4 rounded border border-dashed border-zinc-700 px-2 py-1 text-[11px] text-zinc-500">
          📝 {part.input.category} ({part.input.signal}): {part.input.note}
        </div>
      );
    default:
      return null;
  }
}
