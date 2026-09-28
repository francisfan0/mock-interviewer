"use client";

import { getLibraryProblem } from "./problems";
import type { Problem } from "./types";

const KEY = "mock-interviewer:custom-problems";

export function loadCustomProblems(): Problem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Problem[];
  } catch {
    return [];
  }
}

export function saveCustomProblem(problem: Problem) {
  const rest = loadCustomProblems().filter((p) => p.id !== problem.id);
  localStorage.setItem(KEY, JSON.stringify([problem, ...rest]));
}

export function deleteCustomProblem(id: string) {
  localStorage.setItem(KEY, JSON.stringify(loadCustomProblems().filter((p) => p.id !== id)));
}

export function findProblem(id: string): Problem | undefined {
  return getLibraryProblem(id) ?? loadCustomProblems().find((p) => p.id === id);
}
