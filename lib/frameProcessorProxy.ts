/**
 * Shared plumbing for the app/api/frame/* routes, which forward frame-photo
 * processing requests to the internal Python microservice
 * (services/frame-processor) — never exposed publicly, only reachable from
 * this same Next.js server.
 */

const FRAME_PROCESSOR_URL = process.env.FRAME_PROCESSOR_URL ?? "http://127.0.0.1:8001";
const TIMEOUT_MS = 15_000;

export async function proxyToFrameProcessor(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(`${FRAME_PROCESSOR_URL}${path}`, { ...init, signal: controller.signal });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return Response.json(
      {
        detail: aborted
          ? "انتهت مهلة خدمة معالجة الصور."
          : "خدمة معالجة الصور غير متاحة حالياً — تأكد أنها تعمل (services/frame-processor).",
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
