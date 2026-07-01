import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { exerciseLibraryTable } from "@workspace/db";
import { requireTrainer } from "../lib/auth.js";
import { randomId } from "../services/identityService.js";

const router = Router();

function clean(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const shorts = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shorts?.[1]) return shorts[1];
  const watch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (watch?.[1]) return watch[1];
  return null;
}

function imageFromVideo(videoUrl: string | null, imageUrl: string | null): string | null {
  if (imageUrl) return imageUrl;
  const videoId = getYouTubeId(videoUrl);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

router.get("/exercises", async (req, res) => {
  try {
    const query = clean(req.query.q)?.toLowerCase() || "";
    const category = clean(req.query.category)?.toLowerCase() || "";
    const exercises = await db.select().from(exerciseLibraryTable);
    const filtered = exercises
      .filter((exercise) => {
        const matchesQuery = !query || [exercise.name, exercise.category, exercise.notes].some((value) =>
          String(value || "").toLowerCase().includes(query),
        );
        const matchesCategory = !category || String(exercise.category || "").toLowerCase() === category;
        return matchesQuery && matchesCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));

    return void res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "Failed to list exercise library");
    return void res.status(500).json({ error: "Oefenbibliotheek ophalen mislukt" });
  }
});

router.post("/exercises", requireTrainer, async (req, res) => {
  try {
    const name = clean(req.body?.name);
    if (!name) return void res.status(400).json({ error: "Naam is verplicht" });

    const videoUrl = clean(req.body?.videoUrl);
    const imageUrl = imageFromVideo(videoUrl, clean(req.body?.imageUrl));
    const [created] = await db
      .insert(exerciseLibraryTable)
      .values({
        id: randomId("ex"),
        name,
        category: clean(req.body?.category),
        videoUrl,
        imageUrl,
        notes: clean(req.body?.notes),
        source: "manual",
        sourceVideoId: getYouTubeId(videoUrl),
        isGlobal: true,
      })
      .returning();

    return void res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create exercise");
    return void res.status(500).json({ error: "Oefening aanmaken mislukt" });
  }
});

router.put("/exercises/:id", requireTrainer, async (req, res) => {
  try {
    const videoUrl = req.body?.videoUrl !== undefined ? clean(req.body.videoUrl) : undefined;
    const imageUrl =
      req.body?.imageUrl !== undefined || videoUrl !== undefined
        ? imageFromVideo(videoUrl ?? null, clean(req.body?.imageUrl))
        : undefined;

    const [updated] = await db
      .update(exerciseLibraryTable)
      .set({
        name: req.body?.name !== undefined ? clean(req.body.name) || undefined : undefined,
        category: req.body?.category !== undefined ? clean(req.body.category) : undefined,
        videoUrl,
        imageUrl,
        notes: req.body?.notes !== undefined ? clean(req.body.notes) : undefined,
        sourceVideoId: videoUrl !== undefined ? getYouTubeId(videoUrl) : undefined,
      })
      .where(eq(exerciseLibraryTable.id, param(req.params.id)))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Oefening niet gevonden" });
    return void res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update exercise");
    return void res.status(500).json({ error: "Oefening bijwerken mislukt" });
  }
});

router.delete("/exercises/:id", requireTrainer, async (req, res) => {
  try {
    await db.delete(exerciseLibraryTable).where(eq(exerciseLibraryTable.id, param(req.params.id)));
    return void res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete exercise");
    return void res.status(500).json({ error: "Oefening verwijderen mislukt" });
  }
});

export default router;
