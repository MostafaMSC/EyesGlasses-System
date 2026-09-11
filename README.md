# عوينات أبي ذر — Virtual Try-On MVP

Arabic-first (RTL) eyewear storefront with a browser-based virtual try-on and
direct WhatsApp ordering.

```bash
npm install
npm run dev
```

The admin panel's photo-upload pipeline (background removal + lens
detection) needs the Python microservice running too — see
`services/frame-processor/README.md` (Docker or plain Python, either works):

```bash
cd services/frame-processor
docker compose up -d --build
```

Everything else (the storefront, the live camera try-on) works without it —
only uploading a new product photo in `/admin` needs it running.

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
background**. On upload the app sends it to the Python microservice
(`services/frame-processor`, reached through `app/api/frame/*`), which:

1. removes the background with a real segmentation model (`rembg`,
   `isnet-general-use`, with alpha matting — built specifically for fine
   detail like thin wire bridges and rims, not just a flat cutout),
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
guess, which fixes it in one click. There's also **قص الأذرع يدوياً**
(manual crop) for when the auto-suggested front-rim crop itself needs
adjusting — drag a box around just the front on the pre-crop image. The
three lens sliders below are also still there for hand-tuning the alignment
afterwards. The preview sits on a checkerboard so you can confirm the
background really is transparent.

Lens detection is seeded from the lens's own colour (CIELAB space), not the
backdrop's — real glass is glassy-grey/blue and reflective, never the exact
page-background colour. A Sobel edge map stops lens-region growth from
crossing a strong structural edge (a rim), even where the rim's colour alone
would be close enough to fool it — see `services/frame-processor/processing.py`
for the full pipeline (a Python port of the original client-side logic, with
`rembg` replacing what used to be a hand-rolled/ONNX background removal
step).

**Important:** admin-added frames are stored in that browser's IndexedDB
(`lib/idbProductStore.ts`) — moved off `localStorage` once products could
carry up to three overlay images (front + left/right side). That means:

- they persist across reloads on that device,
- they are **not** visible on other devices or to other people,
- clearing browser data removes them.

That's fine for demoing and for trying frames out. To make a frame a permanent
part of the site, use **تصدير JSON** in the admin panel and paste the entry into
the `products` array in `data/products.ts`.

## Where to change things

| What | File |
| --- | --- |
| Store name, **WhatsApp number**, Instagram, delivery text, currency | `data/storeConfig.ts` |
| Products, prices, colours, availability, try-on tuning | `data/products.ts` |
| Generated demo frame artwork | `lib/frameShapes.ts` |
| Face tracking / placement math | `lib/faceGeometry.ts`, `lib/overlayPlacement.ts` |
| Admin photo processing (background removal, lens detection) | `services/frame-processor/` (Python) |

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

`/admin`'s photo upload runs on **real neural segmentation**, server-side, in
the Python microservice at `services/frame-processor` — reached through
`app/api/frame/prepare`, `.../finalize` and `.../side` (see
`lib/frameProcessorProxy.ts`), never called directly from the browser. It
uses `rembg`'s `isnet-general-use` model with alpha matting enabled, which is
what makes rimless wire frames, gradient tints, gold reflections and
patterned/textured backgrounds work well — matting in particular is built
for exactly the fine/thin-structure case (a wire bridge, a thin rim) that a
plain binary mask erodes or half-clears. A clear/optical lens comes back
transparent automatically, since the model sees the backdrop through it,
same as a person would; a tinted lens looks like solid material to the
model, so `services/frame-processor/processing.py` still runs a
colour-seeded search for that case, confined to an already-accurate
silhouette instead of having to fight background contamination too.

This used to run entirely client-side (first a hand-rolled CIELAB/Sobel
heuristic, later a small ONNX model loaded via `onnxruntime-web`) — moved
server-side because neither browser approach matched a real segmentation
model's accuracy, and the ONNX model's ~13MB WASM runtime download could
hang the page on a slow connection. See
`services/frame-processor/README.md` for running/deploying it.

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
   produces a CSS 3D transform; `GlassesOverlay` renders it. It also
   computes an **ear clip** (`computeEarClip`) once yaw passes ~8°: the
   temple arm gets clipped at roughly the ear/jaw (a face-oval landmark
   point) via CSS `clip-path`, easing in over a small band, so it reads as
   tucking behind the head as the customer turns instead of floating over
   hair/skin at a flat, un-occluded depth. The same clip is reproduced with
   canvas `ctx.clip()` when capturing a photo, so the saved image matches
   the live preview.
5. If a product has left/right side-profile photos (`tryOn.leftImage` /
   `rightImage`, uploaded in `/admin`), the overlay cross-fades from the
   front image into the relevant side image as yaw increases — a real photo
   with the temple arm visible, not just an implied fade. Products without
   side photos render exactly as front-only, unchanged.

### Updating the MediaPipe assets

They were copied from `node_modules` at setup time. If the package is upgraded,
re-copy them so the WASM matches the JS:

```bash
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/
```

---

## Notes

- This is a **sales/demo MVP**: no payments, no accounts. Product data is
  static and local. The only backend is the internal Python microservice
  used by the admin panel's photo upload (`services/frame-processor`) —
  everything else (storefront, live try-on) is fully client-side.
- All product data, prices and imagery are **demo values** and are meant to be
  replaced with the shop's real catalogue.
