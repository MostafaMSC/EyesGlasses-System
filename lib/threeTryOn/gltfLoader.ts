import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * The one GLTF loader every model goes through, with the meshopt decoder
 * attached: the models in `public/assets/frames` are compressed by
 * `scripts/glb-utils.mjs` (`EXT_meshopt_compression` + WebP textures), which
 * is what makes them a few hundred KB instead of several MB. An uncompressed
 * model still loads exactly as before — the decoder only runs when the file
 * asks for it. WebP needs nothing extra; GLTFLoader handles the extension.
 */
let shared: GLTFLoader | null = null;

export function gltfLoader(): GLTFLoader {
  if (!shared) {
    shared = new GLTFLoader();
    shared.setMeshoptDecoder(MeshoptDecoder);
  }
  return shared;
}
