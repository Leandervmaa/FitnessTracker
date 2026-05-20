/**
 * progressPhotos.ts
 *
 * Stores progress photos as base64 data in PostgreSQL (photo_data column).
 * This ensures photos are persistent and available across ALL devices,
 * even after Replit server restarts or deployments.
 *
 * Photos are served via GET /api/progress-photos/image/:id (by record ID).
 */

import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { progressPhotosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { notifyClients } from "./sync.js";

// Memory storage — save directly to DB as base64, no filesystem needed
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ok =
      /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype) ||
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.originalname);
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error("Alleen afbeeldingen zijn toegestaan"));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});

const router = Router();

const VALID_ANGLES = ["front", "side", "back"] as const;
type Angle = typeof VALID_ANGLES[number];

// Columns to return in listings (exclude binary photo_data for performance)
const listColumns = {
  id:         progressPhotosTable.id,
  weekNumber: progressPhotosTable.weekNumber,
  angle:      progressPhotosTable.angle,
  filename:   progressPhotosTable.filename,
  mimeType:   progressPhotosTable.mimeType,
  uploadedAt: progressPhotosTable.uploadedAt,
};

/** GET /api/progress-photos?weekNumber=1 — list photos (metadata only, no binary) */
router.get("/", async (req, res) => {
  try {
    const weekParam = req.query.weekNumber;

    if (weekParam !== undefined) {
      const weekNumber = parseInt(String(weekParam), 10);
      if (isNaN(weekNumber)) return void res.json([]);

      const photos = await db
        .select(listColumns)
        .from(progressPhotosTable)
        .where(eq(progressPhotosTable.weekNumber, weekNumber));

      return void res.json(photos);
    }

    const photos = await db.select(listColumns).from(progressPhotosTable);
    return void res.json(photos);
  } catch (err) {
    req.log.error({ err }, "Failed to list progress photos");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/**
 * GET /api/progress-photos/image/:id
 * Serves the photo binary directly from the database.
 * Works on ALL devices — no filesystem required.
 */
router.get("/image/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });

  try {
    const [photo] = await db
      .select()
      .from(progressPhotosTable)
      .where(eq(progressPhotosTable.id, id));

    if (!photo) return void res.status(404).json({ error: "Foto niet gevonden" });
    if (!photo.photoData) return void res.status(404).json({ error: "Geen fotodata beschikbaar" });

    const buffer = Buffer.from(photo.photoData, "base64");

    res.setHeader("Content-Type",   photo.mimeType || "image/jpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control",  "public, max-age=86400, immutable");
    return void res.end(buffer);
  } catch (err) {
    req.log.error({ err }, "Failed to serve photo from DB");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/** POST /api/progress-photos — upload and store photo binary in DB */
router.post("/", upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return void res.status(400).json({ error: "Geen foto ontvangen" });
  }

  const weekNumber = parseInt(String(req.body.weekNumber), 10);
  const angle = String(req.body.angle || "").toLowerCase() as Angle;

  if (isNaN(weekNumber) || weekNumber < 1) {
    return void res.status(400).json({ error: "Ongeldig weeknummer" });
  }
  if (!VALID_ANGLES.includes(angle)) {
    return void res.status(400).json({ error: "Hoek moet 'front', 'side' of 'back' zijn" });
  }

  // Encode binary as base64 for storage
  const photoData = req.file.buffer.toString("base64");

  try {
    // Replace any existing photo for this week + angle
    await db
      .delete(progressPhotosTable)
      .where(
        and(
          eq(progressPhotosTable.weekNumber, weekNumber),
          eq(progressPhotosTable.angle, angle)
        )
      );

    const [photo] = await db
      .insert(progressPhotosTable)
      .values({
        weekNumber,
        angle,
        filename:  req.file.originalname || `photo-${weekNumber}-${angle}.jpg`,
        mimeType:  req.file.mimetype,
        photoData,
      })
      .returning(listColumns);

    notifyClients("photos_updated", { weekNumber, angle });
    return void res.status(201).json(photo);
  } catch (err) {
    req.log.error({ err }, "Failed to save progress photo to DB");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/** DELETE /api/progress-photos/:id — remove a photo */
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });

  try {
    const [deleted] = await db
      .delete(progressPhotosTable)
      .where(eq(progressPhotosTable.id, id))
      .returning(listColumns);

    if (!deleted) return void res.status(404).json({ error: "Foto niet gevonden" });

    notifyClients("photos_updated", { id });
    return void res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete progress photo");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
