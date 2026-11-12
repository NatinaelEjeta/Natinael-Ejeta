import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 403 });
  }
  const data = await req.json();
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (typeof v === "number" && [90, 180, 270].includes(v)) clean[String(k)] = v;
  }
  const dir = path.join(process.cwd(), "public", "locked");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "rotations.json"), JSON.stringify(clean, null, 2));
  return NextResponse.json({ ok: true });
}
