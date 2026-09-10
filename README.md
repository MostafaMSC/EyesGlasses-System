# عوينات أبي ذر — Virtual Try-On MVP

Arabic-first (RTL) eyewear storefront with a browser-based virtual try-on and
direct WhatsApp ordering.

```bash
npm install
npm run dev
```

Open http://localhost:3000. To try the camera from a phone, use the
`Network:` URL that `npm run dev` prints (camera access requires `localhost`
or HTTPS — a plain `http://192.168.x.x` origin will be blocked by the browser,
so use a tunnel such as `npx localtunnel --port 3000` for phone testing).

---

## Admin panel — adding frames without touching code

Go to **`/admin`** (also linked at the bottom of every page).

Fill in brand, name, price and pick a frame style — a **live preview** updates as
you type. Save, and the frame immediately appears in the catalogue, the brand
filters, and the try-on carousel; hit **جربها بالكاميرا** to try it on straight
away.

### Uploading a real photo

You can upload an ordinary product photo — **it does not need a transparent
background**. On upload the app automatically (all in the browser,
`lib/processFrameImage.ts`):

1. removes the background by flood-filling inwards from the edges,
2. makes the lens openings translucent so the wearer's eyes show through,
3. crops away empty margins and fits the frame into one fixed 800×400 canvas
   with a consistent 5% padding, so every admin-uploaded frame occupies the
   same content-to-canvas ratio — two real photos of similarly-sized frames
   render at the same visual scale on a product card even if one photo's own
   crop happened to carry more empty margin than the other's,
4. **detects both lens centres** and sets the alignment automatically.

The only real requirement is that the photo is **shot straight on**. A 3/4
angled product shot can never sit correctly on a face.

If automatic lens detection fails (you'll get an amber warning), press
**تحديد العدسات بالنقر** and click the two lens centres directly on your
original photo — the pipeline re-runs from those exact points instead of a
guess, which fixes it in one click. The three lens sliders below are also
still there for hand-tuning the alignment afterwards. The preview sits on a
checkerboard so you can confirm the background really is transparent.

Lens detection is seeded from the lens's own colour, in CIELAB space, not the
backdrop's — real glass is glassy-grey/blue and reflective, never the exact
page-background colour, so it no longer needs to match it. A Sobel edge map
stops both background removal and lens growth from crossing a strong
structural edge (a rim), even where the rim's colour alone would be close
enough to fool it. The background tolerance itself isn't a fixed number —
it's derived per photo with Otsu's method from that image's own
distance-from-background histogram. If the *backdrop* still isn't a plain,
fairly uniform colour (a patterned surface, strong gradient, a busy scene),
you'll get a different amber warning saying so — reshoot on a plain
background, or click-to-seed the lenses instead of trusting the cutout.

**Important:** admin-added frames are stored in that browser's `localStorage`.
That means:

- they persist across reloads on that device,
- they are **not** visible on other devices or to other people,
- clearing browser data removes them.

That's fine for demoing and for trying frames out. To make a frame a permanent
part of the site, use **تصدير JSON** in the admin panel and paste the entry into
the `products` array in `data/products.ts`.

Uploaded images are embedded in `localStorage`, which has a ~5MB budget in
total — keep them under ~1.5MB each (the panel enforces this).

## Where to change things

| What | File |
| --- | --- |
| Store name, **WhatsApp number**, Instagram, delivery text, currency | `data/storeConfig.ts` |
| Products, prices, colours, availability, try-on tuning | `data/products.ts` |
| Generated demo frame artwork | `lib/frameShapes.ts` |
| Face tracking / placement math | `lib/faceGeometry.ts`, `lib/overlayPlacement.ts` |

The WhatsApp number lives in exactly one place:

```ts
// data/storeConfig.ts
whatsappNumber: "9647701234567", // digits only, country code first, no "+"
```

---

## Replacing the demo frames with real product images

The store has no transparent product PNGs yet, so every frame is currently
**generated as a transparent SVG** (`lib/frameShapes.ts`) and used for both the
catalogue photo and the live try-on overlay. Swapping in real assets does not
require touching any component.

### 1. Add the files

Put transparent PNGs here (create the folders if missing):

```
public/assets/frames/       <- try-on overlays (transparent background)
public/assets/products/     <- catalogue photos (optional)
```

### 2. Point the product at them

```ts
// data/products.ts
{
  id: "p9",
  // Catalogue photo. Leave as [] to keep using the generated artwork.
  images: ["/assets/products/dior-optic.png"],
  tryOn: {
    // Try-on overlay. When set, this replaces the generated SVG.
    overlayImage: "/assets/frames/dior-optic.png",
    frameShape: "opticalSquare", // ignored once overlayImage is set
    // ...
  },
}
```

### 3. Requirements for a try-on PNG

- The photo **must be shot front-on**. A 3/4 product shot cannot work as a
  try-on overlay — it will never sit correctly on a face.
- **Fully transparent background**, and transparent (or near-transparent)
  lenses so the wearer's eyes stay visible.
- Ideally framed like the generated frames: **2.5:1 aspect** (e.g. 1200 × 480),
  frame centred, **lens centres at 23.3% / 76.7% of the width** and on the
  vertical centre line, temples running to the edges.

**If your photo is framed differently, you don't need to re-crop it.** Tell the
app where the lens centres are and it will still land on the eyes:

```ts
tryOn: {
  overlayImage: "/assets/frames/my-frame.png",
  overlayGeometry: {
    aspect: 1600 / 500,  // the image's width / height
    lensLeftX: 0.27,     // left lens centre, as a fraction of image width
    lensRightX: 0.73,    // right lens centre
    lensY: 0.46,         // lens centre line, as a fraction of image height
  },
}
```

Then fine-tune per product if needed:

```ts
tryOn: {
  scale: 1.0,          // overall size multiplier
  offsetX: 0,          // sideways nudge, in frame-widths
  offsetY: 0.04,       // downward nudge, in frame-heights
  rotationOffset: 0,   // degrees
}
```

### 4. Tune it visually

A development harness is available at **`/try-on-debug`** (not linked from the
site). It feeds a synthetic face through the real tracking pipeline with
sliders for yaw, roll and head size, and prints the computed pose — use it to
check a new asset's alignment without needing a camera.

### How the cutout is actually made

`/admin`'s photo upload runs on **real neural segmentation**, not colour
heuristics: `lib/segmentFrame.ts` runs u2netp (a small U²-Net variant,
Apache-2.0) client-side via `onnxruntime-web`, self-hosted in
`public/onnxruntime/` and `public/models/u2netp.onnx` the same way the live
try-on self-hosts MediaPipe. It's what makes rimless wire frames, gradient
tints, gold reflections and patterned/textured backgrounds work — a trained
model has learned "this is a pair of glasses," where colour/edge matching
only ever had "this pixel resembles that other pixel" to go on. A clear/
optical lens comes back transparent automatically, since the model sees the
backdrop through it, same as a person would; a tinted lens looks like solid
material to the model, so `lib/processFrameImage.ts` still runs a
colour-seeded search for that case — just confined to an already-accurate
silhouette instead of having to fight background contamination too. If the
model can't load for any reason (offline, an unsupported browser, a missing
asset), processing automatically falls back to the previous CIELAB/Sobel/
Otsu heuristic pipeline rather than failing outright — a real accuracy
downgrade, not a crash. Runs single-threaded WASM (no COOP/COEP headers
needed on the server) — a couple of seconds per upload, which is fine for a
one-off admin action.

---

## How the try-on works

1. `lib/useFaceLandmarker.ts` lazily loads MediaPipe Face Landmarker — only
   when the try-on opens, never on normal browsing. The WASM runtime and the
   model are **self-hosted** in `public/mediapipe/`, so it works without a CDN
   after first load.
2. `lib/faceGeometry.ts` turns landmarks into a head pose: anchor point at the
   nose bridge, frame width from eye span + temple width (compensated for yaw
   foreshortening so the frame doesn't shrink when you turn), plus roll, yaw
   and pitch. Pitch is **self-calibrating** — it learns the user's neutral head
   position rather than assuming one.
3. `lib/oneEuroFilter.ts` smooths the pose with a One Euro filter, which
   adapts to movement speed: heavy smoothing when still (kills jitter), light
   when moving fast (kills lag).
4. `lib/overlayPlacement.ts` projects that pose onto the displayed video and
   produces a CSS 3D transform; `GlassesOverlay` renders it.

### Updating the MediaPipe assets

They were copied from `node_modules` at setup time. If the package is upgraded,
re-copy them so the WASM matches the JS:

```bash
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/
```

### Updating the onnxruntime-web assets

Same idea, for the admin-panel segmentation model. If `onnxruntime-web` is
upgraded, re-copy its **WASM-only** build (not the default bundle — the
default resolves to a webgl/webgpu-capable build that expects a different
set of WASM files and 404s against these self-hosted ones):

```bash
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm public/onnxruntime/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs public/onnxruntime/
cp node_modules/onnxruntime-web/dist/ort.wasm.min.mjs public/onnxruntime/
```

The model itself (`public/models/u2netp.onnx`) only needs updating if you
want to swap it for a different segmentation model.

### Optional: the Python ML service, for even sharper cutouts

`/admin` photo upload tries, in order: the Python service (`python-service/`,
if running — full u2net + alpha-matting edge refinement, see
`python-service/README.md`), then the in-browser model above, then the
CIELAB/Sobel/Otsu heuristic. Nothing else changes and nothing is required to
run it — it's a drop-in accuracy upgrade for admins who want it:

```bash
cd python-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The same service also exposes `POST /landmarks` (face landmark detection on
a single still image, reusing `public/mediapipe/face_landmarker.task`) for
offline/one-shot use — an accuracy-check or calibration tool, say. It is
**not** wired into the live camera try-on: round-tripping every video frame
through HTTP would make the real-time overlay laggy, so the live loop stays
on `lib/useFaceLandmarker.ts`'s in-browser MediaPipe.

---

## Notes

- This is a **sales/demo MVP**: no backend, no payments, no accounts. Product
  data is static and local.
- All product data, prices and imagery are **demo values** and are meant to be
  replaced with the shop's real catalogue.
