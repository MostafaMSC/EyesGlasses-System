import { proxyToFrameProcessor } from "@/lib/frameProcessorProxy";

export async function POST(request: Request) {
  const formData = await request.formData();
  return proxyToFrameProcessor("/prepare-front", { method: "POST", body: formData });
}
