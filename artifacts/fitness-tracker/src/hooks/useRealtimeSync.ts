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
 *   food_logs_updated → ["food-logs", *], week status
 *   nutrition_updated → ["nutrition", *], week status
 *   exercise_updated  → ["exercise-logs", *], ["week-workouts", *], week status
 *   feedback_updated  → ["feedback", *], week status
 *   trainer_feedback_updated → ["trainer-feedback", *]
 *   weeks_updated     → week status
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/components/client-context";

const EVENT_TO_QUERY_KEYS: Record<string, string[][]> = {
  photos_updated:    [["progress-photos"], ["weeks"], ["current-week"], ["/api/weeks"], ["/api/weeks/current"]],
  food_logs_updated: [["food-logs"], ["weeks"], ["current-week"], ["/api/weeks"], ["/api/weeks/current"]],
  nutrition_updated: [["nutrition"], ["weeks"], ["current-week"], ["/api/weeks"], ["/api/weeks/current"]],
  exercise_updated:  [["exercise-logs"], ["week-workouts"], ["weeks"], ["current-week"], ["/api/weeks"], ["/api/weeks/current"]],
  feedback_updated:  [["feedback"], ["weeks"], ["current-week"], ["/api/weeks"], ["/api/weeks/current"]],
  trainer_feedback_updated: [["trainer-feedback"]],
  weeks_updated:     [["weeks"], ["current-week"], ["/api/weeks"], ["/api/weeks/current"]],
};

export function useRealtimeSync() {
  const qc = useQueryClient();
  const { activeClientId } = useClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let retryDelay = 2000;
    let retryTimer: ReturnType<typeof setTimeout>;
    let stopped = false;

    function connect() {
      if (stopped) return;

      const url = activeClientId ? `/api/sync/events?clientId=${encodeURIComponent(activeClientId)}` : "/api/sync/events";
      const es = new EventSource(url);
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
  }, [qc, activeClientId]);
}
