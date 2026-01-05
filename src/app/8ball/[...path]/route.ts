import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getToken } from "next-auth/jwt";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path: parts } = await params;
  const safeParts = (parts && parts.length > 0 ? parts : ["index.html"]).filter(Boolean);

  // Protect the game shell (and its assets) from unauthenticated access.
  // If token decoding fails, treat as unauthenticated.
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const last = safeParts[safeParts.length - 1] || "";
    const isHtml = last.endsWith(".html") || last === "" || last === "index.html";
    if (isHtml) {
      const url = new URL("/auth/login", req.url);
      url.searchParams.set("callbackUrl", "/game");
      return NextResponse.redirect(url);
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Base directory is sibling to the Next.js app: <repo>/8ball-source
  const baseDir = path.resolve(process.cwd(), "public", "8ball");
  const requestedPath = path.resolve(baseDir, ...safeParts);

  // Prevent path traversal
  if (!requestedPath.startsWith(baseDir + path.sep) && requestedPath !== baseDir) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const stat = await fs.stat(requestedPath);
    const filePath = stat.isDirectory() ? path.join(requestedPath, "index.html") : requestedPath;
    const data = await fs.readFile(filePath);

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": getContentType(filePath),
        // Helps browser cache static assets; safe for game bundle files.
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
