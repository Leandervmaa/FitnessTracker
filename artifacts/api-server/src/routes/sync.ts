/**
 * sync.ts – Server-Sent Events endpoint for real-time data sync
 * 
 * Clients connect to /api/sync/events and receive a push notification
 * whenever any data changes (photos, food logs, nutrition, exercise logs, feedback).
 * 
 * Usage: call `notifyClients(event)` from any mutation route to broadcast to all connected clients.
 */

import { Router, Request, Response } from "express";

const router = Router();

// ─── Connected clients registry ───────────────────────────────────────────────

interface SseClient {
  id:  string;
  res: Response;
}

const clients = new Map<string, SseClient>();

/** Broadcast a change event to all connected SSE clients. */
export function notifyClients(event: string, data?: Record<string, unknown>) {
  const payload = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of clients.values()) {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(client.id);
    }
  }
}

// ─── SSE endpoint ─────────────────────────────────────────────────────────────

router.get("/events", (req: Request, res: Response) => {
  // SSE headers
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering on Replit
  res.flushHeaders();

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  clients.set(id, { id, res });

  // Send initial ping to confirm connection
  res.write(`data: ${JSON.stringify({ event: "connected", clientId: id, ts: Date.now() })}\n\n`);

  // Heartbeat every 25 seconds to keep the connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(id);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(id);
  });
});

router.get("/trigger", async (req, res) => {
  try {
    const { syncAllLogs } = await import("../services/syncService.js");
    await syncAllLogs();
    res.json({ success: true, message: "Sync triggered" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
