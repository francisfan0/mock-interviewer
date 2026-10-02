"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateMoreTests } from "@/lib/generated";
import type { InterviewUIMessage } from "@/lib/interviewer/tools";
import { warmUpRunner } from "@/lib/runner";
import { InterviewSession } from "@/lib/session";
import { findProblem } from "@/lib/storage";
import { outputsMatch, resolveProblem, resolveTests, runPart } from "@/lib/testing";
import type { Observation, PartSnapshot, Problem, Scorecard, TestCase, TestOutcome, TestSummary } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { CodeEditor } from "./CodeEditor";
import { ProblemPane } from "./ProblemPane";
import { ScorecardView } from "./ScorecardView";
import { TestPanel } from "./TestPanel";

function forAgent(s: TestSummary) {
  return {
    passed: s.passed,
    total: s.total,
    visible: s.visible,
    hidden: s.hidden,
    compileError: s.compileError?.slice(-1500),
    failures: s.failures.slice(0, 6),
  };
}

function transcriptOf(messages: InterviewUIMessage[]) {
  const lines: string[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text" && p.text.trim()) {
        lines.push(`${m.role === "user" ? "Candidate" : "Interviewer"}: ${p.text}`);
      } else if (p.type === "tool-give_hint" && p.input) {
        lines.push(`Interviewer (hint, level ${p.input.level}): ${p.input.hint}`);
      } else if (p.type === "tool-run_tests" && p.state === "output-available") {
        const o = p.output as { passed: number; total: number; compileError?: string };
        lines.push(o.compileError ? "[Tests: compile error]" : `[Tests: ${o.passed}/${o.total} passed]`);
      } else if (p.type === "tool-advance_part" && p.state === "output-available") {
        const o = p.output as { partNumber?: number };
        if (o.partNumber) lines.push(`[Advanced to part ${o.partNumber}]`);
      }
    }
  }
  return lines.join("\n");
}

function observationsOf(messages: InterviewUIMessage[]): Observation[] {
  return messages.flatMap((m) =>
    m.parts.flatMap((p) => (p.type === "tool-record_observation" && p.input?.note ? [p.input as Observation] : [])),
  );
}

const pad = (n: number) => Math.floor(n).toString().padStart(2, "0");
const fmtClock = (sec: number) => `${pad(sec / 60)}:${pad(sec % 60)}`;

export function InterviewRoom({ problemId, timeLimitMin }: { problemId: string; timeLimitMin: number }) {
  const [session] = useState(() => new InterviewSession(timeLimitMin));
  const [transport] = useState(
    () => new DefaultChatTransport<InterviewUIMessage>({ api: "/api/interview", body: () => session.requestBody() }),
  );

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partIndex, setPartIndex] = useState(0);
  const [code, setCode] = useState("");
  const [outcomes, setOutcomes] = useState<Map<string, TestOutcome>>(new Map());
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<PartSnapshot[]>([]);
  const [ended, setEnded] = useState(false);
  const [showScorecard, setShowScorecard] = useState(false);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [scorecardError, setScorecardError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const messagesRef = useRef<InterviewUIMessage[]>([]);
  const kickedOff = useRef(false);

  const runTests = useCallback(async (): Promise<TestSummary | null> => {
    const part = session.part;
    if (!part) return null;
    setRunning(true);
    try {
      const res = await runPart(session.code, part, session.partIndex);
      session.setSummary(res.summary);
      setOutcomes(new Map(res.outcomes.map((o) => [o.id, o])));
      setSummary(res.summary);
      return res.summary;
    } finally {
      setRunning(false);
    }
  }, [session]);

  const requestScorecard = useCallback(async () => {
    if (!session.problem) return;
    setScorecard(null);
    setScorecardError(null);
    try {
      const res = await fetch("/api/scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemTitle: session.problem.title,
          totalParts: session.problem.parts.length,
          snapshots: session.snapshots,
          observations: observationsOf(messagesRef.current),
          transcript: transcriptOf(messagesRef.current),
          elapsedSec: session.elapsedSec,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setScorecard(await res.json());
    } catch (e) {
      setScorecardError(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  const finish = useCallback(async () => {
    if (!session.end()) return;
    setEnded(true);
    await runTests();
    setSnapshots(session.snapshot());
    setShowScorecard(true);
    void requestScorecard();
  }, [session, runTests, requestScorecard]);

  const { messages, sendMessage, addToolOutput, status, error, stop } = useChat<InterviewUIMessage>({
    transport,
    sendAutomaticallyWhen: (opts) => !session.ended && lastAssistantMessageIsCompleteWithToolCalls(opts),
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;
      const toolCallId = toolCall.toolCallId;

      switch (toolCall.toolName) {
        case "run_tests": {
          const s = await runTests();
          addToolOutput({ tool: "run_tests", toolCallId, output: s ? forAgent(s) : { error: "not ready" } });
          break;
        }
        case "give_hint":
          addToolOutput({ tool: "give_hint", toolCallId, output: { hintsUsedThisPart: session.addHint() } });
          break;
        case "advance_part": {
          await runTests();
          setSnapshots(session.snapshot());
          const next = session.advance();
          if (next === null) {
            addToolOutput({
              tool: "advance_part",
              toolCallId,
              output: { done: true, message: "That was the final part. Wrap up and call end_interview." },
            });
            break;
          }
          const p = session.part!;
          setPartIndex(next);
          setSummary(null);
          setOutcomes(new Map());
          setNotice(null);
          addToolOutput({
            tool: "advance_part",
            toolCallId,
            output: { partNumber: next + 1, title: p.title, prompt: p.prompt, signature: p.signature },
          });
          break;
        }
        case "end_interview":
          await finish();
          addToolOutput({ tool: "end_interview", toolCallId, output: { ended: true } });
          break;
      }
    },
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = findProblem(problemId);
      if (!found) {
        setLoadError("Problem not found.");
        return;
      }
      try {
        await warmUpRunner();
        const { problem: resolved, reports } = await resolveProblem(found);
        if (cancelled) return;
        const broken = reports.find((r) => r.compileError);
        if (broken) {
          setLoadError(`Reference solution for part "${broken.partId}" failed:\n${broken.compileError}`);
          return;
        }
        const dropped = reports.reduce((n, r) => n + r.dropped.length, 0);
        if (dropped) setNotice(`${dropped} test(s) were dropped because the reference solution couldn't run them.`);
        session.start(resolved);
        setProblem(resolved);
        setCode(resolved.starterCode);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [problemId, session]);

  useEffect(() => {
    if (!problem || kickedOff.current) return;
    kickedOff.current = true;
    void sendMessage({ text: "[Candidate joined the session]" });
  }, [problem, sendMessage]);

  useEffect(() => {
    if (!problem || ended) return;
    const t = setInterval(() => setElapsed(session.elapsedSec), 1000);
    return () => clearInterval(t);
  }, [problem, ended, session]);

  const onCodeChange = (v: string) => {
    session.setCode(v);
    setCode(v);
  };

  const updatePartTests = (index: number, tests: TestCase[]) => {
    const next = session.setPartTests(index, tests);
    if (next) setProblem(next);
  };

  const onGenerate = async () => {
    const part = session.part;
    if (!part) return;
    const idx = session.partIndex;
    setGenerating(true);
    setNotice(null);
    try {
      const { tests, report } = await generateMoreTests(part);
      updatePartTests(idx, [...session.problem!.parts[idx].tests, ...tests]);
      setNotice(
        `Added ${tests.length} generated test(s) with expected outputs from the reference solution` +
          (report.dropped.length ? `; dropped ${report.dropped.length} the reference couldn't run.` : "."),
      );
    } catch (e) {
      setNotice(`Test generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  const onAddTest = async (inputJson: string, expectedJson: string): Promise<string | null> => {
    const part = session.part;
    if (!part) return "Not ready.";
    let input: unknown;
    let expected: unknown;
    try {
      input = JSON.parse(inputJson);
    } catch {
      return "Input is not valid JSON.";
    }
    if (expectedJson.trim()) {
      try {
        expected = JSON.parse(expectedJson);
      } catch {
        return "Expected output is not valid JSON.";
      }
    }
    const idx = session.partIndex;
    const draft: TestCase = {
      id: `user-${Math.random().toString(36).slice(2, 8)}`,
      input,
      hidden: false,
      source: "user",
      description: "Your test",
    };
    const { tests } = await resolveTests(part, [draft]);
    if (!tests.length) return "The reference solution couldn't run this input. Check the input format.";
    if (expected !== undefined && !outputsMatch(tests[0].expected, expected, part.compare)) {
      return `The reference solution returns ${JSON.stringify(tests[0].expected)} for this input. Leave expected blank to use it — or ask the interviewer about this case.`;
    }
    updatePartTests(idx, [...part.tests, tests[0]]);
    return null;
  };

  const endNow = async () => {
    if (!confirm("End the interview and get feedback?")) return;
    await stop();
    await finish();
  };

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8">
        <pre className="max-w-2xl whitespace-pre-wrap text-sm text-rose-300">{loadError}</pre>
        <Link href="/" className="text-sm text-indigo-400 hover:underline">
          ← Back
        </Link>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-zinc-400">
        <span className="animate-pulse">Loading Python runtime and validating tests…</span>
      </div>
    );
  }

  const overTime = elapsed > timeLimitMin * 60;

  return (
    <div className="flex h-screen min-w-[1100px] flex-col">
      <header className="flex items-center gap-4 border-b border-zinc-800 px-4 py-2">
        <Link href="/" className="text-sm font-semibold text-zinc-300 hover:text-white">
          Mock Interviewer
        </Link>
        <div className="flex items-center gap-1.5">
          {problem.parts.map((p, i) => (
            <span
              key={p.id}
              title={i <= partIndex ? p.title : "Not revealed yet"}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                i < partIndex
                  ? "bg-emerald-500/15 text-emerald-300"
                  : i === partIndex
                    ? "bg-indigo-500/20 text-indigo-200"
                    : "bg-zinc-800 text-zinc-500"
              }`}
            >
              Part {i + 1}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
            Show interviewer notes
          </label>
          <span className={`font-mono text-sm ${overTime ? "text-rose-400" : "text-zinc-300"}`}>
            {fmtClock(elapsed)} / {timeLimitMin}:00
          </span>
          {ended ? (
            <button
              onClick={() => setShowScorecard(true)}
              className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-500"
            >
              View feedback
            </button>
          ) : (
            <button
              onClick={endNow}
              className="rounded-md border border-rose-500/40 px-3 py-1 text-sm text-rose-300 hover:bg-rose-500/10"
            >
              End interview
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-1/4 min-w-[240px] max-w-[380px] shrink-0 border-r border-zinc-800">
          <ProblemPane problem={problem} partIndex={partIndex} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-[3]">
            <CodeEditor value={code} onChange={onCodeChange} onRun={runTests} readOnly={ended} />
          </div>
          <div className="min-h-0 flex-[2] border-t border-zinc-800">
            <TestPanel
              part={problem.parts[partIndex]}
              outcomes={outcomes}
              summary={summary}
              running={running}
              generating={generating}
              notice={notice}
              disabled={ended}
              onRun={runTests}
              onGenerate={onGenerate}
              onAddTest={onAddTest}
            />
          </div>
        </main>

        <aside className="flex w-[30%] min-w-[280px] max-w-[440px] shrink-0 flex-col border-l border-zinc-800">
          <div className="border-b border-zinc-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Interviewer
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={messages}
              status={status}
              error={error}
              ended={ended}
              showNotes={showNotes}
              onSend={(text) => void sendMessage({ text })}
            />
          </div>
        </aside>
      </div>

      {showScorecard && (
        <ScorecardView
          problem={problem}
          snapshots={snapshots}
          scorecard={scorecard}
          error={scorecardError}
          onClose={() => setShowScorecard(false)}
        />
      )}
    </div>
  );
}
