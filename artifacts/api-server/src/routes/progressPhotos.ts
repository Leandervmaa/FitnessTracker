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
import { createRequire } from "node:module";
import { db } from "@workspace/db";
import { progressPhotosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { notifyClients } from "./sync.js";
import { getScopedClientId } from "../lib/auth.js";

const require = createRequire(import.meta.url);

// Memory storage — save directly to DB as base64, no filesystem needed
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ok =
      /^image\/(jpe?g|png|webp|heic|heif|heic-sequence|heif-sequence)$/i.test(file.mimetype) ||
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
type UploadedPhotoFile = Express.Multer.File;

class PhotoConversionError extends Error {
  constructor() {
    super("Deze foto staat in een telefoonformaat dat niet op ieder apparaat getoond kan worden. Upload de foto opnieuw als JPG of PNG.");
  }
}

function isHeicLike(mimeType?: string | null, filename?: string | null) {
  return /heic|heif/i.test(mimeType || "") || /\.(heic|heif)$/i.test(filename || "");
}

function jpegFilename(filename: string, weekNumber?: number, angle?: string) {
  const fallback = `photo-${weekNumber ?? "new"}-${angle ?? "progress"}.jpg`;
  const safe = filename?.trim() || fallback;
  return /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(safe)
    ? safe.replace(/\.(heic|heif|jpg|jpeg|png|webp)$/i, ".jpg")
    : `${safe}.jpg`;
}

async function convertToJpeg(buffer: Buffer) {
  const sharp = require("sharp") as (input: Buffer, options?: Record<string, unknown>) => {
    rotate: () => {
      jpeg: (options: Record<string, unknown>) => {
        toBuffer: () => Promise<Buffer>;
      };
    };
  };

  return sharp(buffer, { animated: false })
    .rotate()
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

async function normalizeUploadedPhoto(file: UploadedPhotoFile, weekNumber: number, angle: Angle) {
  if (!isHeicLike(file.mimetype, file.originalname)) {
    return {
      buffer: file.buffer,
      filename: file.originalname || `photo-${weekNumber}-${angle}.jpg`,
      mimeType: file.mimetype || "image/jpeg",
    };
  }

  return {
    buffer: await convertToJpeg(file.buffer).catch(() => {
      throw new PhotoConversionError();
    }),
    filename: jpegFilename(file.originalname, weekNumber, angle),
    mimeType: "image/jpeg",
  };
}

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
    const clientId = getScopedClientId(req);

    if (weekParam !== undefined) {
      const weekNumber = parseInt(String(weekParam), 10);
      if (isNaN(weekNumber)) return void res.json([]);

      const photos = await db
        .select(listColumns)
        .from(progressPhotosTable)
        .where(and(eq(progressPhotosTable.weekNumber, weekNumber), eq(progressPhotosTable.clientId, clientId)));

      return void res.json(photos);
    }

    const photos = await db.select(listColumns).from(progressPhotosTable).where(eq(progressPhotosTable.clientId, clientId));
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
  const clientId = getScopedClientId(req);

  try {
    const [photo] = await db
      .select()
      .from(progressPhotosTable)
      .where(and(eq(progressPhotosTable.id, id), eq(progressPhotosTable.clientId, clientId)));

    if (!photo) return void res.status(404).json({ error: "Foto niet gevonden" });
    if (!photo.photoData) return void res.status(404).json({ error: "Geen fotodata beschikbaar" });

    let buffer: Buffer<ArrayBufferLike> = Buffer.from(photo.photoData, "base64");
    let mimeType = photo.mimeType || "image/jpeg";

    if (isHeicLike(photo.mimeType, photo.filename)) {
      try {
        buffer = await convertToJpeg(buffer);
        mimeType = "image/jpeg";
      } catch (err) {
        req.log.error({ err, id }, "Failed to convert HEIC/HEIF photo to JPEG");
        return void res.status(415).json({
          error: "Deze foto staat in een telefoonformaat dat niet op ieder apparaat getoond kan worden. Upload de foto opnieuw als JPG of PNG.",
        });
      }
    }

    const servedFilename = mimeType === "image/jpeg"
      ? jpegFilename(photo.filename || `photo-${id}.jpg`)
      : photo.filename || `photo-${id}`;

    res.setHeader("Content-Type",   mimeType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control",  "private, max-age=86400");
    res.setHeader("Content-Disposition", `inline; filename="${servedFilename.replace(/"/g, "")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
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
  const clientId = getScopedClientId(req);
  const angle = String(req.body.angle || "").toLowerCase() as Angle;

  if (isNaN(weekNumber) || weekNumber < 1) {
    return void res.status(400).json({ error: "Ongeldig weeknummer" });
  }
  if (!VALID_ANGLES.includes(angle)) {
    return void res.status(400).json({ error: "Hoek moet 'front', 'side' of 'back' zijn" });
  }

  try {
    const normalized = await normalizeUploadedPhoto(req.file, weekNumber, angle);
    const photoData = normalized.buffer.toString("base64");

    // Replace any existing photo for this week + angle
    await db
      .delete(progressPhotosTable)
      .where(
        and(
          eq(progressPhotosTable.weekNumber, weekNumber),
          eq(progressPhotosTable.angle, angle),
          eq(progressPhotosTable.clientId, clientId)
        )
      );

    const [photo] = await db
      .insert(progressPhotosTable)
      .values({
        weekNumber,
        clientId,
        angle,
        filename:  normalized.filename,
        mimeType:  normalized.mimeType,
        photoData,
      })
      .returning(listColumns);

    notifyClients("photos_updated", { clientId, weekNumber, angle });
    return void res.status(201).json(photo);
  } catch (err) {
    if (err instanceof PhotoConversionError) {
      return void res.status(415).json({ error: err.message });
    }

    req.log.error({ err }, "Failed to save progress photo to DB");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/** DELETE /api/progress-photos/:id — remove a photo */
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });
  const clientId = getScopedClientId(req);

  try {
    const [deleted] = await db
      .delete(progressPhotosTable)
      .where(and(eq(progressPhotosTable.id, id), eq(progressPhotosTable.clientId, clientId)))
      .returning(listColumns);

    if (!deleted) return void res.status(404).json({ error: "Foto niet gevonden" });

    notifyClients("photos_updated", { clientId, id });
    return void res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete progress photo");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
