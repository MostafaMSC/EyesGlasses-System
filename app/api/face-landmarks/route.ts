import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies a single still image to the optional Python ML service's
 * /landmarks endpoint (see python-service/README.md). One-shot/offline use
 * only — e.g. a calibration or accuracy-check tool — never the live camera
 * loop, which stays on lib/useFaceLandmarker.ts's in-browser MediaPipe to
 * avoid a per-frame network round trip.
 */
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.set("file", file, "photo.png");

  let response: Response;
  try {
    response = await fetch(`${PYTHON_SERVICE_URL}/landmarks`, { method: "POST", body: upstream });
  } catch {
    return NextResponse.json({ error: "ML service is unreachable." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Landmark detection failed." }, { status: 502 });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
