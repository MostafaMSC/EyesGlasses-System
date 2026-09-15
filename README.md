# عوينات أبي ذر — Eyewear shop with virtual try-on

Arabic-first (RTL) eyewear storefront with a browser-based virtual try-on and
direct WhatsApp ordering.

```bash
npm install
npm run dev
```

The catalogue lives in Postgres, so `npm run dev` needs one. Easiest is a
throwaway container plus a `.env.local` (gitignored):

```bash
docker run -d --name abuthar-devdb -p 55432:5432 \
  -e POSTGRES_USER=abuthar -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=abuthar \
  postgres:17-alpine
```

```bash
printf 'DATABASE_URL=postgres://abuthar:devpass@127.0.0.1:55432/abuthar\nADMIN_PASSWORD=dev-password-1234\n' > .env.local
```

Or skip all of it and use `docker compose up` below, which wires the database
up for you.

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

## The shop

Beyond the try-on, the site is a complete storefront: product pages
(`/products/<slug>`), site search with suggestions, catalogue filters and
sorting, a persisted cart, checkout with Iraqi governorates and configurable
payment methods, order numbers and tracking (`/track`), wishlist, coupons,
product reviews (published after moderation), and CMS pages
(`/pages/<slug>`). The admin panel has a section for each:

| Admin page | What the owner does there |
| --- | --- |
| `/admin/dashboard` | Sales, orders by status, low stock, top sellers, and which frames are tried on most vs. bought |
| `/admin` | Products: pictures by view, price/sale price, stock, SKU, frame specs and dimensions, try-on setup, SEO |
| `/admin/orders` | Search/filter orders, change order and payment status, internal notes, WhatsApp the customer |
| `/admin/customers` | Customers as revealed by their orders, with history |
| `/admin/reviews` | Approve, reject or delete customer reviews |
| `/admin/content` | Hero, stats, trust badges, banners, homepage sections, header/footer menus, information pages |
| `/admin/settings` | Store identity and logo, contact and social links, working hours, SEO, delivery zones and fees, payment methods, categories, brands, coupons |

Everything the owner edits lives in the `settings` table (one JSON document
per section, defaults in `data/siteSettings.ts` so a fresh database is a
complete site). Orders are in `orders`, analytics events in `events`,
reviews in `reviews` — all created on first request, no migrations. Money is
never trusted from the browser: `lib/checkout.ts` re-prices every order from
the catalogue rows, the configured zone and the coupon.

The public API (`/api/products`, `/api/settings`) sends pictures as small
versioned URLs rather than inline data, with ETags, so the storefront stays
fast; see `lib/productAssets.ts` and `lib/settingsDb.ts`.

**Access control.** One shared `ADMIN_PASSWORD` (see below) guards every
admin page and every write endpoint through `requireAdmin()` in
`lib/adminAuth.ts` — the single place to grow into per-user roles later.
Customer accounts, online payment and prescription entry are not built yet;
the order document (`data/orders.ts`) is where prescription fields would go.

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
| Product pictures served separately from the listing, and cached | `lib/productAssets.ts`, `app/api/products/[id]/asset/` |
| 3D model preloading and in-memory cache | `lib/threeTryOn/glassesModel.ts` |
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
3. **The frame is rigidly attached to that head** (`lib/threeTryOn/headFrame.ts`).
   Where glasses rest on a head — at the nose bridge, a few centimetres in
   front of the skull's centre — and how wide the frame is do not change when
   the head turns, so neither of them is measured per frame. They are
   *calibrated*: on frames where the head is close to frontal (within ~22° of
   yaw, where 2D measurements are honest), the bridge's position is read off
   the landmarks — including its depth, from the landmark's own z — expressed
   in head space and averaged; likewise the lens-centre span in centimetres.
   After that every frame is `anchor = T + R · N`: the matrix's translation
   plus the calibrated offset carried by the matrix's rotation. One uniform
   scale (span in cm ÷ the model's span) and the perspective camera do the
   rest — moving closer or further, turning, tilting, all fall out of the
   same rigid transform, and the frame cannot stretch. Per-product
   `scale`/`offsetX`/`offsetY`/`rotationOffset` are applied inside that
   frame, so they follow the head too.
4. **Occlusion** is an invisible ellipsoid head mask — `colorWrite: false`,
   so it writes depth but paints nothing, letting the camera feed show through
   while punching away the frame's own pixels behind it. That is what makes
   the temple arms genuinely pass behind the ears instead of floating over
   hair. It is a skull-sized ellipsoid behind the bridge, in real-head
   proportions of the measured temple width, and it is clipped at a plane
   just behind the lenses so it can reach the face without ever hiding the
   rims (`HEAD_MASK` in `lib/threeTryOn/headFrame.ts` — the constants to
   adjust if arms ever vanish too early or show through the head).
5. **Per-model calibration** (`tryOn.model3dCalibration`, "معايرة المجسم" in
   `/admin`): a rotation, a translation (as fractions of the model's width)
   and the lens-centre fraction, applied once when the GLB loads, for a
   model that didn't come out exactly on the convention.

To see the maths on a real face, open any page with `?tryOnDebug=1` (or set
`localStorage.tryOnDebug = "1"`) and start the 3D try-on: the landmarks the
head frame is built from (168, 6, 33, 263, 234, 454), the face and eye
centres, the anchor, the head's right/up/forward axes, and the live
yaw/pitch/roll, IPD, frame width, scale, position and rotation are drawn over
the camera. Smoothing: the pose matrix is One-Euro filtered per channel in
`FaceMatrixSmoother` (`lib/threeTryOn/faceMatrix.ts`, position looser than
rotation); the calibrated constants use `HEAD_CALIBRATION` (a short plain
average, then a slow follow rate).

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
- Geometry may be plain or **meshopt-compressed** (`EXT_meshopt_compression`,
  with `KHR_mesh_quantization`); textures may be PNG/JPEG or **WebP**. That is
  what `prepare-model` produces, and it is why a served model is a few hundred
  KB rather than several MB. Draco and KTX2/Basis are *not* supported.
- **Lenses: always replaced.** AI generators produce a solid, opaque lens
  baked into the same mesh and material as the frame (every Hyper3D export
  in this project is one node, one mesh, one material), which hides the
  customer's eyes — the opposite of what a try-on is for. The generator's
  lens is always taken out; the admin panel's **معالجة العدسات** section
  decides what replaces it, stored as `tryOn.lens` (`data/products.ts`,
  `LensConfiguration`):
  - **اللون الأصلي** (default) — a light transparent lens in the real
    product's lens colour. The colour is read from the product photo (the
    one given to Hyper3D — drop it into the section, it is kept as the
    product's front photo) by `lib/lensColorDetection.ts`: it finds the front
    of the frame, grows one region per lens that stops at the rim, then
    samples only the *interior* — an ellipse eroded ~18% in from the region's
    own edge, centred on its measured centroid, which is where rim bleed,
    hinge shadows and flood-fill fringing all live — discarding glare
    (bright, desaturated pixels) and near-black edge pixels along the way.
    The representative colour is a median taken in HSV, not RGB: hue as a
    circular mean (immune to the wraparound a plain numeric average of
    degrees gets wrong) with saturation/value as plain medians, and the same
    for combining the two lenses' colours — an RGB average of a warm-lit left
    lens and a cool-lit right one can drift toward a hue neither side has.
    Without a photo the same detector runs on a render of the model, which
    is only ever offered as a hint (the generator's lens colour is the thing
    in doubt) — below the trust threshold the colour has to be picked by hand,
    and a lens whose two sides disagree past a set margin is also held back
    rather than averaged into something neither side actually is.
  - **شفافة** — near-invisible, just enough surface to catch a highlight.
  - **بدون عدسة** — open rims (what the old **إخفاء العدسات** toggle did;
    rows saved with it still resolve, see `resolveLensConfig`).

  Geometry (`lib/threeTryOn/lensGeometry.ts`): a face is lens if it sits
  inside one of the two lens openings, faces the viewer or away, and lies at
  lens depth rather than out on the rim's front. The region is set just
  inside a typical lens so the rim can never be taken. The classification is
  scored (symmetry, how much of the opening it fills, flatness) and applied
  only when confident; otherwise the model is shown as exported and the
  panel says why. For the tinted and clear modes the lens's own *front*
  surface is rebuilt as a separate mesh — the generator's exact lens shape,
  not a generic disc — with a `MeshPhysicalMaterial`: plain alpha
  transparency for the tint itself (the try-on's canvas is a transparent
  WebGL layer sitting *over* a separate `<video>` element, composited by the
  browser, not by WebGL — a multiply/overlay blend mode would have nothing
  of the video to blend against and can't be used here), plus a `clearcoat`
  layer for the sharp secondary specular highlight that reads as glass
  rather than flat tinted plastic. Classification (`classify()`, the
  expensive per-face pass) runs once per model at load and is cached
  separately from the lens config, so trying different modes/colours on the
  same model — the admin's three-mode preview, a colour slider being dragged
  — never re-fetches or re-parses the `.glb` or re-classifies it, only
  rebuilds the small lens mesh and its material; nothing happens per camera
  frame either way, and the served `.glb` itself is never modified. The three
  modes can be compared on every model in `/try-on-debug` ("lens (3D)").

### Where the model file lives

Two routes, and the difference matters more than it looks:

**Served from the site (preferred).** Put the `.glb` in
`public/assets/frames/` and give the product its path
(`/assets/frames/wayfarer.glb`) in `/admin`. The product stores only that
string, so: no size limit worth worrying about, the file is gzipped over the
wire, the browser caches it, and it is fetched **only when someone opens the
try-on**. That folder is bind-mounted into the container, so adding a model
needs `docker compose restart web` — a second — not an image rebuild.

**Uploaded into the product (quick tests only).** The admin panel can also
read the file and store it inline, capped by `MAX_MODEL_BYTES` (8MB) in
`app/admin/page.tsx`. That cap is not a browser limit — it guards three real
costs:

1. It is stored as a base64 data URL, which inflates the file by a third (a
   5.96MB model becomes a 7.9MB string, and JS strings are UTF-16 in memory).
2. It sits in the product's database row, so every admin save and JSON
   export carries it. (The storefront no longer does: the catalogue listing
   replaces embedded pictures and models with links to
   `/api/products/{id}/asset/…`, fetched only by whatever shows them.)
3. Size tracks triangle count, and the try-on renders the model while
   MediaPipe is already using the GPU for face tracking.

Use the served route instead.

### Adding a new model

AI 3D generators (Rodin/Hyper3D, Tripo, and similar) export at full density —
a pair of glasses comes out at **500,000–1,000,000 triangles and 28–38MB**,
far too heavy to render on a phone. One command does the whole job:

```bash
npm run prepare-model -- path/to/raw.glb my-frame
```

It simplifies to ~50k triangles (working out the ratio from the model's own
count), shrinks textures to 1024px, compresses the result for download (WebP
textures, meshopt-coded geometry — typically ~5 MB → under 1 MB with no
visible change), writes `public/assets/frames/my-frame.glb`, sanity-checks
the proportions, and prints the path to paste into `/admin`. Nothing to
install — `npx` fetches gltf-transform on first use.

Models added before the compression step existed can be shrunk in place, all
at once:

```bash
npm run optimize-models
```

It skips anything already compressed and keeps the originals in
`frames-original/` (outside `public/`, so they are never served). Follow it
with the same `docker compose restart web`.

**Run it from the checkout you deploy** — a model prepared in a different
clone isn't on the server at all. Then make the running app notice it:

```bash
docker compose restart web
```

About a second, and no rebuild: `public/assets/frames` is bind-mounted into
the web container, so the file itself needs no image build. The restart is
still required — Next's standalone server decides which static paths exist
when it starts, so a file appearing underneath it is a 404 until then.

If the model was prepared somewhere else, copy it over first:

```bash
scp my-frame.glb user@server:~/EyesGlasses-System/public/assets/frames/
```

The admin field checks the path as you type and says whether the file is
actually being served, so a typo or a missed rebuild shows up there rather
than as a console 404 inside the try-on.

Simplification is lossy and thin temple arms are the first thing it damages,
so check the result in `/try-on-debug` with **render in 3D** before trusting
it. Raw exports can sit anywhere in the project — `*.glb` is gitignored
outside `public/`, so a stray `git add -A` can't commit tens of megabytes.

### The picture on the product card

A product whose only asset is a `.glb` has nothing 2D to show, so `/admin`
renders one: the first time a model path resolves it draws the frame front-on
into a transparent PNG and stores it as the product's image, which is what the
catalogue cards, the details modal and the 2D try-on then display. It never
overwrites an uploaded photo — a real product shot beats a render — and there
is a button to regenerate it deliberately.

The framing and the lens line are measured from the pixels that came out, not
from the model's geometry, because the geometry lies: these models routinely
carry nodes that inflate the bounding box while drawing nothing. So the
renderer draws generously first — twice the bounding box each way — then
crops to what actually appeared, with even margins, and reads the lens line
off the same pixels (`lib/threeTryOn/renderModelThumbnail.ts`).

It looks straight down -Z, i.e. it assumes the documented convention (facing
+Z, arms running back along -Z) — deliberately the same assumption the
try-on makes, so the picture and the live render agree: a model that comes
out sideways or upside down in the picture will be wrong on the face too,
and needs re-exporting. An earlier version tried to detect the orientation
from the silhouette instead; it read a browline frame upside down, and a
picture that auto-corrects what the try-on can't would only hide that.
`npm run prepare-model` reports the proportions, and `/try-on-debug` is
where to confirm it.

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
