# Mock Interviewer

Practice multi-part coding interviews with an AI interviewer. You get a problem one part at a time, ask clarifying questions, write Python in a browser editor, run tests, and get a scorecard at the end.

## Quick start

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY or OPENAI_API_KEY
npm install
npm run dev
```

Open http://localhost:3000.

Models are configured with `INTERVIEWER_MODEL` / `GENERATOR_MODEL` in `provider:model` form (e.g. `anthropic:claude-sonnet-5-5`, `openai:gpt-5`).

## How it works

- **Problems** are structured data (`src/lib/types.ts`): each part has a prompt, a hidden spec the interviewer uses to answer questions, prepared clarifications, a reference solution, tests, and advance criteria. Library problems live in `src/lib/problems/`.
- **Code runs in the browser** via Pyodide in a module web worker (`public/pyodide-worker.js`). Each test has a 4s watchdog; on timeout the worker is killed and restarted.
- **Expected outputs always come from the reference solution.** Builtin, generated, and user-added tests only specify inputs; `resolveTests` in `src/lib/testing.ts` runs the reference to fill in (or verify) expected values and drops tests it can't run.
- **The interviewer** (`/api/interview`) is a `streamText` agent whose instructions are rebuilt every turn from the current part, your code, test results, elapsed time, and hint count (`src/lib/interviewer/prompt.ts`). Its tools (`src/lib/interviewer/tools.ts`):
  - `run_tests`, `give_hint`, `advance_part`, `end_interview` run client-side, since the code and session state live in the browser
  - `record_observation` privately logs evidence for the scorecard (toggle "Show interviewer notes" to see them)
- **Generation**: `/api/generate-problem` designs a new multi-part problem or structures one you paste in; `/api/generate-tests` adds edge-case inputs to the current part. Both are validated by executing the reference solution before use.
- **Scorecard**: `/api/scorecard` grades the transcript, per-part results, hints, and observations.

Custom/generated problems are stored in `localStorage`.

## Test input format

- Function entry: JSON list of positional args, e.g. `[[[1, 3], [2, 4]]]` for `f(intervals)`.
- Class entry (LeetCode style): `{"ops": ["KVStore", "set", "get"], "args": [[], ["a", "1"], ["a"]]}`; output is `[null, <set result>, <get result>]`.

## Roadmap

- More languages (Judge0/Piston), voice mode, session history, system-design rounds.
