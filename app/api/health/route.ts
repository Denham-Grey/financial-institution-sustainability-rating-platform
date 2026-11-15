import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await one<{ now: string }>("SELECT now()::text AS now");
    return Response.json({
      status: "ok",
      database: "connected",
      databaseTime: result?.now,
      authUrl: process.env.NEON_AUTH_BASE_URL ? "configured" : "missing",
      branch: process.env.NEON_BRANCH ?? null,
    });
  } catch (error) {
    return Response.json({ status: "error", message: (error as Error).message }, { status: 500 });
  }
}
