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

## Running with Docker

No local Node, Python or Postgres install needed — this runs all three
services (web, the `frame-processor` microservice, and the Postgres that holds
the catalogue), wired together over Docker's internal network:

```bash
cp .env.example .env      # then fill in the two passwords
docker compose up -d --build
```

Compose refuses to start until `POSTGRES_PASSWORD` and `ADMIN_PASSWORD` are
set, rather than quietly booting with a default nobody changed.

Open http://localhost:3000. Neither `db` nor `frame-processor` is published to
the host — only `web` is, and only on `127.0.0.1`. Use
`services/frame-processor/docker-compose.yml` directly if you want that one
service reachable for `curl`/debugging. First build takes a few minutes;
`frame-processor`'s segmentation model is baked into its image at build time,
so it needs no download at startup.

`docker compose down` removes the containers but **keeps** the catalogue — it
lives in the named `db-data` volume. Only `docker compose down -v` deletes it.

Camera-based try-on needs `localhost` or HTTPS in the browser (see above) —
that's a browser rule, unaffected by Docker. See **Deploying to a server**
below for the TLS part.

## Deploying to a server

The catalogue is real server state, so a deployment needs a little care.

**1. Build and start**

```bash
git clone <repo> && cd EyesGlasses-System
cp .env.example .env
# fill in POSTGRES_PASSWORD and ADMIN_PASSWORD (openssl rand -base64 24)
docker compose up -d --build
```

**2. Put TLS in front of it.** `web` listens on `127.0.0.1:3000` only, so it
is not reachable from outside until a reverse proxy forwards to it. This is
not optional: browsers block camera access on any origin that isn't
`localhost` or HTTPS, so without a certificate the try-on — the whole point
of the site — cannot run. With Caddy the entire config is two lines:

```caddyfile
shop.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy obtains and renews the certificate itself. Point the domain's A record
at the server first, or the certificate request fails.

**3. Move the catalogue in.** Products added before this used to live in the
admin browser's IndexedDB. Open `/admin` on the new server, log in, and if
that browser still holds them you'll be offered a one-click **نقلها إلى
السيرفر** import. Otherwise add frames normally — they now save to Postgres
and every visitor sees them.

**Updating later:**

```bash
git pull && docker compose up -d --build
```

The database volume is untouched by rebuilds.

**Backups.** The catalogue is the one piece of state worth keeping:

```bash
docker compose exec -T db pg_dump -U abuthar abuthar | gzip > backup-$(date +%F).sql.gz
```

### What runs where

| Service | Exposed | Needed by |
| --- | --- | --- |
| `web` | `127.0.0.1:3000`, via the reverse proxy | everyone |
| `db` | internal only | `web` |
| `frame-processor` | internal only | `/admin` photo upload only |

`frame-processor` is only used when an admin uploads a product photo. If you
prefer, leave it out of the server entirely (`docker compose up -d web db`)
and prepare product photos on a local machine instead — the storefront and
the try-on don't touch it.

### Admin access

`/admin` is protected by `ADMIN_PASSWORD` (see `lib/adminAuth.ts`): the
password is only ever checked server-side, and the session is an httpOnly
cookie holding an expiry plus an HMAC of it keyed by the password — so there
is no session store to maintain, and changing the password immediately
invalidates every existing session. Every write endpoint checks it; reads are
public, because the catalogue is.

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

Admin-added frames are saved to **Postgres**, so they are part of the real
catalogue: visible to every visitor on every device, and unaffected by
clearing browser data. `/admin` requires the `ADMIN_PASSWORD` from `.env`.

They used to live in the admin browser's own IndexedDB, which meant nobody
else could see them — if a browser still holds frames from that era, the
admin panel offers a one-click import into the database.

**تصدير JSON** is still there for taking a backup of the catalogue, or for
pasting entries into `data/products.ts` to ship them as static defaults.

## Where to change things

| What | File |
| --- | --- |
| Store name, **WhatsApp number**, Instagram, delivery text, currency | `data/storeConfig.ts` |
| Products, prices, colours, availability, try-on tuning | `data/products.ts` |
| Generated demo frame artwork | `lib/frameShapes.ts` |
| Face tracking / placement math | `lib/faceGeometry.ts`, `lib/overlayPlacement.ts` |
| 3D try-on (Three.js scene, head mask, model fitting) | `lib/threeTryOn/` |
| Catalogue storage / API | `lib/db.ts`, `app/api/products/` |
| Admin password + session | `lib/adminAuth.ts` |
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
check a new asset's alignment without needing a camera. Tick **render in 3D**
to check a GLB the same way.

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
   produces a CSS 3D transform; `GlassesOverlay` renders it. The flat image
   is never cut: an earlier version clipped it at the ear to fake the temple
   arm going behind the head, but a front-on product photo has no arm to
   hide — the clip just removed the frame's own outer edge, which reads as
   damage rather than depth. Real occlusion needs real geometry, which is
   what the 3D path below is for.
5. If a product has left/right side-profile photos (`tryOn.leftImage` /
   `rightImage`, uploaded in `/admin`), the overlay cross-fades from the
   front image into the relevant side image as yaw increases — a real photo
   with the temple arm visible, not just an implied fade. Products without
   side photos render exactly as front-only, unchanged.

## The 3D try-on

A flat image can be tilted, faded and clipped, but it has no depth — so it
never really turns with the head, and the temple arms can only ever be
*approximated* going behind the ear. Products with a 3D model
(`tryOn.model3d`, a `.glb` uploaded in `/admin`) are rendered as real
geometry instead, in `lib/threeTryOn/`:

1. A **transparent WebGL canvas** sits over the video, positioned to cover
   exactly the rectangle the camera feed occupies (`object-fit: cover` crops
   it, so this is usually wider than the stage). Both live inside the same
   mirrored wrapper, so the render and the face stay in step — and the mirror
   is correct for a selfie view, the same way a real mirror is.
2. The **head-pose matrix** comes from MediaPipe, which fits its canonical
   metric head to the landmarks and hands back a 4x4 transform. Its rotation
   drives the scene's anchor object; its translation gives the distance to the
   head. The Three.js `PerspectiveCamera` is built with the intrinsics that
   matrix was solved against (63° vertical FOV, centimetre units) — if the
   camera disagrees, the frame drifts off the eyes as the head moves
   off-centre.
3. **Position and size stay landmark-driven.** The frame is placed on the ray
   through the same tuned anchor the 2D path uses (pupil line pulled toward
   the nose bridge) at the head's depth, and scaled every frame so the model's
   lens centres land on the measured lens-centre span. That means moving
   closer or further is tracked continuously, per-product `scale`/`offsetX`/
   `offsetY` keep working, and toggling 2D↔3D doesn't change how big the frame
   looks.
4. **Occlusion** is an invisible ellipsoid head mask — `colorWrite: false`,
   so it writes depth but paints nothing, letting the camera feed show through
   while punching away the frame's own pixels behind it. That is what makes
   the temple arms genuinely pass behind the ears instead of floating over
   hair. It is sized from the face's own measured temple width (see
   `HEAD_MASK` in `lib/threeTryOn/tryOnScene.ts`) — the constant to adjust if
   arms ever vanish too early or show through the head.

A **2D/3D toggle** in the try-on header switches between the two renderers, so
the same face can be compared side by side. Products with a `model3d` default
to 3D; everything else defaults to the 2D cutout. If MediaPipe ever stops
returning a pose matrix, 3D hands back to 2D on its own rather than showing
nothing.

Products without a GLB still render in 3D if you toggle it on, using a
**placeholder mesh** built from the product's `frameShape` and colours
(`lib/threeTryOn/proceduralFrame.ts`). It will never match a real frame's
design — it exists so tracking can be judged before anything is modelled.

`/try-on-debug` has a **render in 3D** checkbox that drives all of this from
synthetic landmarks, so placement, fitting and the arm occlusion can be
checked across yaw without a camera.

### Requirements for a try-on GLB

- Modelled **facing +Z with the temple arms running back along −Z**, so the
  front face is the lens plane and the horizontal/vertical centre is the
  lens-centre line. Any unit scale works — it is fitted to the face
  automatically.
- The arms must run at the **true width of the head** and reach past the ear.
  Arms modelled too narrow sit inside the head mask and stay hidden even
  head-on.
- Uncompressed geometry: Draco/meshopt decoders are not bundled.
- **Transparent (or deleted) lenses.** A model with solid lens geometry hides
  the customer's eyes, which defeats the point. AI generators in particular
  produce opaque lenses baked into a single material with the frame, so they
  can't be made see-through from code — the lens faces have to be deleted or
  given their own transparent material in Blender.

### Where the model file lives

Two routes, and the difference matters more than it looks:

**Served from the site (preferred).** Put the `.glb` in
`public/assets/frames/` and give the product its path
(`/assets/frames/wayfarer.glb`) in `/admin`. The product stores only that
string, so: no size limit worth worrying about, the file is gzipped over the
wire, the browser caches it, and it is fetched **only when someone opens the
try-on**. Files under `public/` are baked into the Docker image, so rebuild
`web` after adding one.

**Uploaded into the product (quick tests only).** The admin panel can also
read the file and store it inline, capped by `MAX_MODEL_BYTES` (8MB) in
`app/admin/page.tsx`. That cap is not a browser limit — it guards three real
costs:

1. It is stored as a base64 data URL, which inflates the file by a third (a
   5.96MB model becomes a 7.9MB string, and JS strings are UTF-16 in memory).
2. `lib/productStore.tsx`'s `idbGetAll` reads **every product in full on every
   page load**, storefront included — not just when the try-on opens. Embedded
   models therefore slow down pages that never render them.
3. Size tracks triangle count, and the try-on renders the model while
   MediaPipe is already using the GPU for face tracking.

Raising the cap only makes (2) worse. Use the served route instead.

### Adding a new model

AI 3D generators (Rodin/Hyper3D, Tripo, and similar) export at full density —
a pair of glasses comes out at **500,000–1,000,000 triangles and 28–38MB**,
far too heavy to render on a phone. One command does the whole job:

```bash
npm run prepare-model -- path/to/raw.glb my-frame
```

It simplifies to ~50k triangles (working out the ratio from the model's own
count), shrinks textures to 1024px, writes
`public/assets/frames/my-frame.glb`, sanity-checks the proportions, and prints
the path to paste into `/admin`. Nothing to install — `npx` fetches
gltf-transform on first use.

**Run it from the checkout you deploy.** `public/` is baked into the Docker
image, so a model prepared in a different clone will 404 at runtime however
correct it is. Then:

```bash
docker compose up -d --build web
```

The admin field checks the path as you type and says whether the file is
actually being served, so a typo or a missed rebuild shows up there rather
than as a console 404 inside the try-on.

Simplification is lossy and thin temple arms are the first thing it damages,
so check the result in `/try-on-debug` with **render in 3D** before trusting
it. Raw exports can sit anywhere in the project — `*.glb` is gitignored
outside `public/`, so a stray `git add -A` can't commit tens of megabytes.

### Updating the MediaPipe assets

They were copied from `node_modules` at setup time. If the package is upgraded,
re-copy them so the WASM matches the JS:

```bash
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/
```

---

## Notes

- No payments and no customer accounts — orders go out over WhatsApp. The
  backend is Postgres for the catalogue plus the internal Python microservice
  used by the admin panel's photo upload (`services/frame-processor`); the
  storefront and the live try-on otherwise run entirely in the browser.
- All product data, prices and imagery are **demo values** and are meant to be
  replaced with the shop's real catalogue.
