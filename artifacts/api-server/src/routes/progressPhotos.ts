import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { progressPhotosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Store photos in a dedicated directory under the server's data folder
const PHOTOS_DIR = path.resolve(__dirname, "../data/progress-photos");
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PHOTOS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype) ||
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.originalname);
    cb(null, ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max per photo
});

const router = Router();

const VALID_ANGLES = ["front", "side", "back"] as const;
type Angle = typeof VALID_ANGLES[number];

/** GET /api/progress-photos?weekNumber=1 — list photos, optionally filtered by week */
router.get("/", async (req, res) => {
  try {
    let query = db.select().from(progressPhotosTable).$dynamic();

    const weekParam = req.query.weekNumber;
    if (weekParam !== undefined) {
      const weekNumber = parseInt(String(weekParam), 10);
      if (!isNaN(weekNumber)) {
        query = query.where(eq(progressPhotosTable.weekNumber, weekNumber));
      }
    }

    const photos = await query;
    return void res.json(photos);
  } catch (err) {
    req.log.error({ err }, "Failed to list progress photos");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/** GET /api/progress-photos/file/:filename — serve photo file */
router.get("/file/:filename", (req, res) => {
  const filename = path.basename(req.params.filename); // sanitize
  const filePath = path.join(PHOTOS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return void res.status(404).json({ error: "Foto niet gevonden" });
  }

  res.setHeader("Cache-Control", "public, max-age=86400");
  return void res.sendFile(filePath);
});

/** POST /api/progress-photos — upload a photo for a specific week + angle */
router.post("/", upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return void res.status(400).json({ error: "Geen foto ontvangen" });
  }

  const weekNumber = parseInt(String(req.body.weekNumber), 10);
  const angle = String(req.body.angle || "").toLowerCase() as Angle;

  if (isNaN(weekNumber) || weekNumber < 1) {
    fs.unlinkSync(req.file.path);
    return void res.status(400).json({ error: "Ongeldig weeknummer" });
  }

  if (!VALID_ANGLES.includes(angle)) {
    fs.unlinkSync(req.file.path);
    return void res.status(400).json({ error: "Hoek moet 'front', 'side' of 'back' zijn" });
  }

  try {
    // If there's already a photo for this week+angle, delete the old file + record
    const existing = await db
      .select()
      .from(progressPhotosTable)
      .where(
        and(
          eq(progressPhotosTable.weekNumber, weekNumber),
          eq(progressPhotosTable.angle, angle)
        )
      );

    for (const old of existing) {
      const oldPath = path.join(PHOTOS_DIR, old.filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      await db.delete(progressPhotosTable).where(eq(progressPhotosTable.id, old.id));
    }

    const [photo] = await db
      .insert(progressPhotosTable)
      .values({
        weekNumber,
        angle,
        filename: req.file.filename,
        mimeType: req.file.mimetype,
      })
      .returning();

    return void res.status(201).json(photo);
  } catch (err) {
    // Clean up uploaded file on DB error
    fs.unlinkSync(req.file.path);
    req.log.error({ err }, "Failed to save progress photo");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

/** DELETE /api/progress-photos/:id — remove a photo */
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });

  try {
    const [photo] = await db
      .delete(progressPhotosTable)
      .where(eq(progressPhotosTable.id, id))
      .returning();

    if (!photo) return void res.status(404).json({ error: "Foto niet gevonden" });

    const filePath = path.join(PHOTOS_DIR, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return void res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete progress photo");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
