import { proxyToFrameProcessor } from "@/lib/frameProcessorProxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToFrameProcessor("/finalize-front", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
