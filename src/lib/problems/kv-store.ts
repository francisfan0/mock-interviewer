import type { Problem, TestCase } from "../types";

const ops = (
  id: string,
  pairs: [string, unknown[]][],
  hidden = false,
  description?: string,
): TestCase => ({
  id,
  input: { ops: ["KVStore", ...pairs.map((p) => p[0])], args: [[], ...pairs.map((p) => p[1])] },
  hidden,
  description,
  source: "builtin",
});

export const kvStore: Problem = {
  id: "kv-store",
  title: "In-Memory Key-Value Store",
  difficulty: "medium",
  language: "python",
  summary: "Build a key-value store, then add value counting, then nested transactions.",
  tags: ["design", "hash map", "stack"],
  origin: "library",
  starterCode: `class KVStore:
    def __init__(self):
        pass

    def set(self, key: str, value: str) -> None:
        pass

    def get(self, key: str) -> str | None:
        pass

    def delete(self, key: str) -> bool:
        pass
`,
  parts: [
    {
      id: "basic",
      title: "Basic operations",
      prompt: `Implement a class \`KVStore\` that stores string keys mapped to string values.

- \`set(key, value)\` stores the value for the key.
- \`get(key)\` returns the stored value.
- \`delete(key)\` removes the key.`,
      signature: "class KVStore:\n    def set(self, key: str, value: str) -> None\n    def get(self, key: str) -> str | None\n    def delete(self, key: str) -> bool",
      entry: { kind: "class", name: "KVStore" },
      hiddenSpec: [
        "get on a missing key returns None.",
        "delete returns True if the key existed and was removed, False otherwise.",
        "set on an existing key overwrites the value.",
        "Keys and values are non-empty strings; no need to validate types.",
        "All operations should be O(1) average time.",
      ],
      clarifications: [
        { question: "What does get return for a missing key?", answer: "None." },
        { question: "What does delete return?", answer: "True if the key existed, False otherwise." },
      ],
      advanceCriteria:
        "All tests pass and the candidate can state the time complexity of each operation.",
      referenceSolution: `class KVStore:
    def __init__(self):
        self.data = {}

    def set(self, key, value):
        self.data[key] = value

    def get(self, key):
        return self.data.get(key)

    def delete(self, key):
        if key in self.data:
            del self.data[key]
            return True
        return False
`,
      tests: [
        ops("b1", [["set", ["a", "1"]], ["get", ["a"]]], false, "set then get"),
        ops("b2", [["get", ["missing"]]], false, "get missing key"),
        ops("b3", [["set", ["a", "1"]], ["delete", ["a"]], ["get", ["a"]], ["delete", ["a"]]], false, "delete twice"),
        ops("b4", [["set", ["a", "1"]], ["set", ["a", "2"]], ["get", ["a"]]], true, "overwrite"),
        ops("b5", [["set", ["x", "1"]], ["set", ["y", "2"]], ["delete", ["x"]], ["get", ["y"]], ["get", ["x"]]], true, "independent keys"),
      ],
    },
    {
      id: "count",
      title: "Count by value",
      prompt: `Add a method \`count(value)\` that returns how many keys currently hold exactly that value.`,
      signature: "    def count(self, value: str) -> int",
      entry: { kind: "class", name: "KVStore" },
      hiddenSpec: [
        "count must be O(1); a linear scan over all keys is acceptable only as a first pass and the interviewer should push for O(1).",
        "Overwriting a key with a new value must decrement the old value's count.",
        "Deleting a key decrements its value's count.",
        "count of a value no key holds returns 0.",
      ],
      clarifications: [
        { question: "What if no key has the value?", answer: "Return 0." },
        { question: "How fast does count need to be?", answer: "Ideally constant time, it will be called very frequently." },
      ],
      advanceCriteria: "All tests pass and count is O(1) (maintained incrementally, not by scanning).",
      referenceSolution: `from collections import Counter

class KVStore:
    def __init__(self):
        self.data = {}
        self.counts = Counter()

    def set(self, key, value):
        if key in self.data:
            self.counts[self.data[key]] -= 1
        self.data[key] = value
        self.counts[value] += 1

    def get(self, key):
        return self.data.get(key)

    def delete(self, key):
        if key not in self.data:
            return False
        self.counts[self.data.pop(key)] -= 1
        return True

    def count(self, value):
        return self.counts[value]
`,
      tests: [
        ops("c1", [["set", ["a", "1"]], ["set", ["b", "1"]], ["count", ["1"]]], false, "two keys same value"),
        ops("c2", [["count", ["nope"]]], false, "count of absent value"),
        ops("c3", [["set", ["a", "1"]], ["set", ["a", "2"]], ["count", ["1"]], ["count", ["2"]]], false, "overwrite moves count"),
        ops("c4", [["set", ["a", "1"]], ["set", ["b", "1"]], ["delete", ["a"]], ["count", ["1"]]], true, "delete decrements"),
        ops("c5", [["set", ["a", "1"]], ["set", ["a", "1"]], ["count", ["1"]]], true, "set same value twice"),
      ],
    },
    {
      id: "transactions",
      title: "Nested transactions",
      prompt: `Add transaction support:

- \`begin()\` opens a new transaction. Transactions can be nested.
- \`rollback()\` discards every change made in the most recent open transaction.
- \`commit()\` applies the most recent open transaction.

\`get\` and \`count\` should always reflect uncommitted changes.`,
      signature: "    def begin(self) -> None\n    def commit(self) -> bool\n    def rollback(self) -> bool",
      entry: { kind: "class", name: "KVStore" },
      hiddenSpec: [
        "commit and rollback return False if there is no open transaction, True otherwise.",
        "commit only closes the innermost transaction; its changes merge into the parent transaction (so a later rollback of the parent undoes them). If there is no parent, the changes become permanent.",
        "rollback restores both values and counts exactly, including keys that did not exist before the transaction.",
        "Ideal: an undo log per transaction so cost is proportional to the number of writes, not the size of the store. Copying the whole dict on begin is acceptable as a first pass but the interviewer should ask about memory.",
      ],
      clarifications: [
        { question: "What happens on commit/rollback with no transaction?", answer: "Return False and do nothing." },
        { question: "Does commit apply all open transactions or just one?", answer: "Just the innermost one; it merges into its parent." },
      ],
      advanceCriteria: "All tests pass; candidate can discuss memory cost of their rollback strategy.",
      referenceSolution: `from collections import Counter

_MISSING = object()

class KVStore:
    def __init__(self):
        self.data = {}
        self.counts = Counter()
        self.txns = []

    def _apply(self, key, value):
        old = self.data.get(key, _MISSING)
        if old is not _MISSING:
            self.counts[old] -= 1
        if value is _MISSING:
            self.data.pop(key, None)
        else:
            self.data[key] = value
            self.counts[value] += 1
        return old

    def _write(self, key, value):
        old = self._apply(key, value)
        if self.txns:
            self.txns[-1].append((key, old))

    def set(self, key, value):
        self._write(key, value)

    def get(self, key):
        return self.data.get(key)

    def delete(self, key):
        if key not in self.data:
            return False
        self._write(key, _MISSING)
        return True

    def count(self, value):
        return self.counts[value]

    def begin(self):
        self.txns.append([])

    def rollback(self):
        if not self.txns:
            return False
        for key, old in reversed(self.txns.pop()):
            self._apply(key, old)
        return True

    def commit(self):
        if not self.txns:
            return False
        log = self.txns.pop()
        if self.txns:
            self.txns[-1].extend(log)
        return True
`,
      tests: [
        ops("t1", [["set", ["a", "1"]], ["begin", []], ["set", ["a", "2"]], ["get", ["a"]], ["rollback", []], ["get", ["a"]]], false, "rollback restores"),
        ops("t2", [["begin", []], ["set", ["a", "1"]], ["commit", []], ["get", ["a"]], ["rollback", []]], false, "commit persists"),
        ops("t3", [["commit", []], ["rollback", []]], false, "no transaction"),
        ops("t4", [["begin", []], ["set", ["a", "1"]], ["begin", []], ["set", ["a", "2"]], ["commit", []], ["get", ["a"]], ["rollback", []], ["get", ["a"]]], true, "nested commit merges into parent"),
        ops("t5", [["set", ["a", "x"]], ["begin", []], ["delete", ["a"]], ["set", ["b", "x"]], ["count", ["x"]], ["rollback", []], ["count", ["x"]], ["get", ["b"]], ["get", ["a"]]], true, "rollback restores counts and deletes"),
      ],
    },
  ],
};
