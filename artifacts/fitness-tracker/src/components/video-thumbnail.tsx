import { useState } from "react";
import { PlayCircle } from "lucide-react";

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

export function getVideoThumbnailUrl(videoUrl: string | null | undefined): string | null {
  const url = parseUrl(videoUrl);
  if (!url) return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  }

  if (host.endsWith("youtube.com")) {
    const watchId = url.searchParams.get("v");
    const pathParts = url.pathname.split("/").filter(Boolean);
    const pathId = ["embed", "shorts", "live"].includes(pathParts[0]) ? pathParts[1] : null;
    const id = watchId || pathId;
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  }

  if (host.endsWith("loom.com")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts.find((part, index) => ["share", "embed"].includes(parts[index - 1] || ""));
    return id ? `https://cdn.loom.com/sessions/thumbnails/${id}-with-play.gif` : null;
  }

  return null;
}

export function getVideoHostLabel(videoUrl: string | null | undefined): string {
  const url = parseUrl(videoUrl);
  if (!url) return "Video";
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be" || host.endsWith("youtube.com")) return "YouTube";
  if (host.endsWith("loom.com")) return "Loom";
  return host;
}

export function VideoThumbnail({
  videoUrl,
  title,
  className = "",
}: {
  videoUrl: string | null | undefined;
  title: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const thumbnailUrl = failed ? null : getVideoThumbnailUrl(videoUrl);

  return (
    <div className={`relative aspect-video overflow-hidden rounded-lg border border-border bg-muted ${className}`}>
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-secondary">
          <PlayCircle className="h-10 w-10 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/15">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 text-primary shadow-sm">
          <PlayCircle className="h-7 w-7" />
        </span>
      </div>
    </div>
  );
}
