/**
 * useRealtimeSync.ts
 *
 * Connects to the server's SSE endpoint (/api/sync/events) and automatically
 * invalidates the relevant React Query caches when data changes occur on any
 * device. This ensures all connected clients (phones, tablets, laptops) see
 * updated data within seconds without manual refresh.
 *
 * Event → Query keys mapping:
 *   photos_updated    → ["progress-photos", *]
 *   food_logs_updated → ["food-logs", *]
 *   nutrition_updated → ["nutrition", *]
 *   exercise_updated  → ["exercise-logs", *], ["week-workouts", *]
 *   feedback_updated  → ["feedback", *]
 *   weeks_updated     → ["weeks"]
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const EVENT_TO_QUERY_KEYS: Record<string, string[][]> = {
  photos_updated:    [["progress-photos"]],
  food_logs_updated: [["food-logs"]],
  nutrition_updated: [["nutrition"], ["weeks"]],
  exercise_updated:  [["exercise-logs"], ["week-workouts"], ["weeks"]],
  feedback_updated:  [["feedback"], ["weeks"]],
  weeks_updated:     [["weeks"]],
};

export function useRealtimeSync() {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let retryDelay = 2000;
    let retryTimer: ReturnType<typeof setTimeout>;
    let stopped = false;

    function connect() {
      if (stopped) return;

      const es = new EventSource("/api/sync/events");
      esRef.current = es;

      es.onopen = () => {
        retryDelay = 2000; // reset backoff on success
      };

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { event: string; data?: unknown };
          const keys = EVENT_TO_QUERY_KEYS[msg.event];
          if (keys) {
            for (const key of keys) {
              qc.invalidateQueries({ queryKey: key });
            }
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        es.close();
        if (!stopped) {
          // Exponential backoff: 2s → 4s → 8s → max 30s
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000);
            connect();
          }, retryDelay);
        }
      };
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      esRef.current?.close();
    };
  }, [qc]);
}
