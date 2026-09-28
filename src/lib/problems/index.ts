import type { Problem } from "../types";
import { kvStore } from "./kv-store";
import { meetingRooms } from "./meeting-rooms";

export const LIBRARY: Problem[] = [kvStore, meetingRooms];

export function getLibraryProblem(id: string): Problem | undefined {
  return LIBRARY.find((p) => p.id === id);
}
