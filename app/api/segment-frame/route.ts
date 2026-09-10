import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies a frame photo to the optional Python ML service's /segment
 * endpoint (see python-service/README.md) so the browser never needs to know
 * that service's address or deal with CORS — it just calls this route.
 *
 * Kept server-side (rather than fetched directly from the browser) so the
 * service can live on a private address in production without exposing it.
 */
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.set("file", file, "frame.png");

  let response: Response;
  try {
    response = await fetch(`${PYTHON_SERVICE_URL}/segment`, { method: "POST", body: upstream });
  } catch {
    return NextResponse.json({ error: "ML service is unreachable." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Segmentation failed." }, { status: 502 });
  }

  const bytes = await response.arrayBuffer();
  return new NextResponse(bytes, { headers: { "Content-Type": "image/png" } });
}
