// Module worker: Pyodide >= 314 no longer supports classic workers.
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

const HARNESS = `
import copy, io, json, linecache, sys, time, traceback

def _mi_jsonable(o):
    if isinstance(o, (set, frozenset)):
        return sorted(o, key=repr)
    return repr(o)

def _mi_format_exc(skip_frames):
    etype, value, tb = sys.exc_info()
    for _ in range(skip_frames):
        if tb is not None and tb.tb_next is not None:
            tb = tb.tb_next
    return "".join(traceback.format_exception(etype, value, tb))[-4000:]

def _mi_compile(code):
    linecache.cache["solution.py"] = (len(code), None, code.splitlines(True), "solution.py")
    ns = {"__name__": "__solution__"}
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        exec(compile(code, "solution.py", "exec"), ns)
    finally:
        sys.stdout = old
    return ns

def _mi_run_one(code, entry_json, test_json):
    entry = json.loads(entry_json)
    test = json.loads(test_json)
    try:
        ns = _mi_compile(code)
    except BaseException:
        return json.dumps({"compileError": _mi_format_exc(1)})
    target = ns.get(entry["name"])
    if target is None:
        return json.dumps({"compileError": f"'{entry['name']}' is not defined. Expected a {entry['kind']} named {entry['name']}."})
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    start = time.perf_counter()
    try:
        inp = copy.deepcopy(test["input"])
        if entry["kind"] == "function":
            actual = target(*inp)
        else:
            ops, args = inp["ops"], inp["args"]
            obj = target(*args[0])
            actual = [None]
            for op, a in zip(ops[1:], args[1:]):
                actual.append(getattr(obj, op)(*a))
        ms = (time.perf_counter() - start) * 1000
        sys.stdout = old
        return json.dumps({"actual": json.loads(json.dumps(actual, default=_mi_jsonable)), "stdout": buf.getvalue()[-2000:], "ms": ms})
    except BaseException:
        sys.stdout = old
        return json.dumps({"error": _mi_format_exc(1), "stdout": buf.getvalue()[-2000:]})
`;

const pyodideReady = (async () => {
  const pyodide = await loadPyodide();
  pyodide.runPython(HARNESS);
  self.postMessage({ type: "ready" });
  return pyodide;
})();

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type !== "run") return;
  const pyodide = await pyodideReady;
  const runOne = pyodide.globals.get("_mi_run_one");
  const entryJson = JSON.stringify(msg.entry);
  try {
    for (const test of msg.tests) {
      self.postMessage({ type: "start", runId: msg.runId, id: test.id });
      const raw = runOne(msg.code, entryJson, JSON.stringify({ input: test.input }));
      const parsed = JSON.parse(raw);
      if (parsed.compileError) {
        self.postMessage({ type: "compileError", runId: msg.runId, error: parsed.compileError });
        return;
      }
      self.postMessage({ type: "result", runId: msg.runId, result: { id: test.id, ...parsed } });
    }
  } catch (err) {
    self.postMessage({ type: "compileError", runId: msg.runId, error: String(err) });
    return;
  } finally {
    runOne.destroy?.();
  }
  self.postMessage({ type: "done", runId: msg.runId });
};
