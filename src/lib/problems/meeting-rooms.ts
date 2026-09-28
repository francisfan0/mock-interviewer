import type { Problem, TestCase } from "../types";

const call = (id: string, intervals: number[][], hidden = false, description?: string): TestCase => ({
  id,
  input: [intervals],
  hidden,
  description,
  source: "builtin",
});

export const meetingRooms: Problem = {
  id: "meeting-rooms",
  title: "Meeting Room Scheduler",
  difficulty: "medium",
  language: "python",
  summary: "Detect conflicts, count rooms needed, then assign concrete rooms.",
  tags: ["intervals", "sorting", "heap"],
  origin: "library",
  starterCode: `def can_attend(intervals: list[list[int]]) -> bool:
    pass
`,
  parts: [
    {
      id: "conflicts",
      title: "Any conflicts?",
      prompt: `You're given a list of meetings, each as \`[start, end]\`. Write \`can_attend(intervals)\` that returns whether one person could attend all of them.`,
      signature: "def can_attend(intervals: list[list[int]]) -> bool",
      entry: { kind: "function", name: "can_attend" },
      hiddenSpec: [
        "A meeting ending at time t does not conflict with one starting at t (half-open intervals).",
        "Input is not sorted.",
        "Empty list returns True.",
        "start < end always; times are non-negative integers.",
        "Target O(n log n).",
      ],
      clarifications: [
        { question: "Does [1,2] conflict with [2,3]?", answer: "No, a meeting can start exactly when another ends." },
        { question: "Is the input sorted?", answer: "No." },
      ],
      advanceCriteria: "All tests pass with an O(n log n) approach.",
      referenceSolution: `def can_attend(intervals):
    intervals = sorted(intervals)
    for i in range(1, len(intervals)):
        if intervals[i][0] < intervals[i - 1][1]:
            return False
    return True
`,
      tests: [
        call("a1", [[0, 30], [5, 10], [15, 20]], false, "overlap"),
        call("a2", [[7, 10], [2, 4]], false, "no overlap, unsorted"),
        call("a3", [], false, "empty"),
        call("a4", [[1, 2], [2, 3]], true, "touching endpoints"),
        call("a5", [[5, 8], [1, 3], [3, 5], [8, 9]], true, "chain of touching"),
        call("a6", [[1, 10], [2, 3]], true, "nested"),
      ],
    },
    {
      id: "min-rooms",
      title: "Minimum rooms",
      prompt: `Now write \`min_rooms(intervals)\` returning the minimum number of rooms needed so all meetings can happen.`,
      signature: "def min_rooms(intervals: list[list[int]]) -> int",
      entry: { kind: "function", name: "min_rooms" },
      hiddenSpec: [
        "Same half-open semantics as before.",
        "Empty list returns 0.",
        "Target O(n log n) using a min-heap of end times or sorted start/end sweeps.",
      ],
      clarifications: [{ question: "What about no meetings?", answer: "0 rooms." }],
      advanceCriteria: "All tests pass and candidate explains why the heap/sweep approach is correct.",
      referenceSolution: `import heapq

def min_rooms(intervals):
    ends = []
    best = 0
    for s, e in sorted(intervals):
        while ends and ends[0] <= s:
            heapq.heappop(ends)
        heapq.heappush(ends, e)
        best = max(best, len(ends))
    return best
`,
      tests: [
        call("r1", [[0, 30], [5, 10], [15, 20]], false, "classic"),
        call("r2", [[7, 10], [2, 4]], false, "one room"),
        call("r3", [], false, "empty"),
        call("r4", [[1, 5], [2, 6], [3, 7], [4, 8]], true, "all overlap"),
        call("r5", [[1, 2], [2, 3], [3, 4]], true, "touching"),
        call("r6", [[1, 10], [2, 3], [3, 4], [4, 5], [9, 12]], true, "mixed"),
      ],
    },
    {
      id: "assign",
      title: "Assign rooms",
      prompt: `Rooms are numbered \`0, 1, 2, ...\`. Write \`assign_rooms(intervals)\` that returns a list where element \`i\` is the room assigned to meeting \`i\`. Use as few rooms as possible, and always give a meeting the lowest-numbered free room.`,
      signature: "def assign_rooms(intervals: list[list[int]]) -> list[int]",
      entry: { kind: "function", name: "assign_rooms" },
      hiddenSpec: [
        "Process meetings in order of start time; ties broken by original index.",
        "A room is free for a meeting if its previous meeting ended at or before the new start.",
        "Output is indexed by the original input order.",
        "Target O(n log n) with two heaps: one of (end, room) for busy rooms and one of free room numbers.",
      ],
      clarifications: [
        { question: "What order do I process ties in start time?", answer: "By original index." },
        { question: "Is the output in input order or sorted order?", answer: "Input order." },
      ],
      advanceCriteria: "All tests pass; candidate handles the 'lowest free room' requirement with a heap rather than a linear scan.",
      referenceSolution: `import heapq

def assign_rooms(intervals):
    order = sorted(range(len(intervals)), key=lambda i: (intervals[i][0], i))
    free, busy = [], []
    res = [0] * len(intervals)
    next_room = 0
    for i in order:
        s, e = intervals[i]
        while busy and busy[0][0] <= s:
            _, r = heapq.heappop(busy)
            heapq.heappush(free, r)
        if free:
            r = heapq.heappop(free)
        else:
            r = next_room
            next_room += 1
        res[i] = r
        heapq.heappush(busy, (e, r))
    return res
`,
      tests: [
        call("s1", [[0, 30], [5, 10], [15, 20]], false, "classic"),
        call("s2", [[1, 2], [2, 3]], false, "reuse room"),
        call("s3", [], false, "empty"),
        call("s4", [[1, 10], [2, 5], [3, 4], [5, 8], [4, 6]], true, "lowest free room"),
        call("s5", [[5, 6], [1, 2], [1, 3], [2, 4]], true, "ties and unsorted"),
      ],
    },
  ],
};
