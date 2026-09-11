"""
Frame photo processing: background removal (rembg, with alpha matting) plus
the lens-detection / front-rim-crop geometry originally implemented in
lib/processFrameImage.ts (the Next.js app's client-side pipeline). The tuned
constants and the reasoning behind each guard are carried over as-is; only
the background-removal step itself is new — rembg's isnet-general-use model
with alpha matting replaces both the small in-browser ONNX model and the
hand-rolled Lab/Sobel flood fill, which is what struggled with thin bright
bridges and reflective lenses.

Where the original used a hand-rolled flood fill for topology/connectivity,
this uses cv2.connectedComponentsWithStats instead (faster, fewer places to
get a boundary condition wrong) — same "is this region enclosed by the
frame, or reachable from the image border" idea throughout.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove

# --- Background removal ------------------------------------------------

_SESSION = new_session("isnet-general-use")


def warm_up() -> None:
    """Runs one throwaway inference at import/startup so the first real
    request doesn't pay the model's cold-start cost against a client timeout."""
    dummy = Image.new("RGB", (100, 100), (255, 255, 255))
    remove(dummy, session=_SESSION)


def remove_background(rgb: np.ndarray) -> np.ndarray:
    """RGB uint8 HxWx3 -> RGBA uint8 HxWx4, background removed with alpha matting.

    Alpha matting specifically targets the fine/thin-structure case (wire
    bridges, thin rims) that a plain binary/soft mask erodes or half-clears.
    """
    # `rgb` is typically a `rgba[:, :, :3]` slice, which is non-contiguous
    # (a stride gap from the dropped alpha channel) — PIL's Image.fromarray
    # expects contiguous memory, so this is not just a performance nicety.
    pil_img = Image.fromarray(np.ascontiguousarray(rgb))
    out = remove(
        pil_img,
        session=_SESSION,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
    )
    return np.array(out.convert("RGBA"))


# --- Tuned constants (ported 1:1 from lib/processFrameImage.ts) --------

MAX_DIMENSION = 900
LENS_ALPHA = 38
OPAQUE_THRESHOLD = 30
LAB_L_WEIGHT = 0.5
SOBEL_EDGE_THRESHOLD = 25
LENS_STEP_TOLERANCE = 16
LENS_GLOBAL_CAP = 48
FRONT_LENS_SPAN = 0.53
MAX_LENS_REGION_ASPECT = 2.4
REFLECTION_MIN_CHANNEL = 220
REFLECTION_MAX_SPREAD = 20
SPECK_FRACTION = 0.1
DETACHED_MARGIN_FRACTION = 0.6
DETACHED_MAX_SIZE_FRACTION = 0.5
GAP_ALPHA_THRESHOLD = 200
WIDEST_FRONT_ASPECT = 3.4
FINAL_CANVAS_WIDTH = 800
FINAL_CANVAS_HEIGHT = 400
FINAL_PADDING_FRACTION = 0.05
SIDE_MAX_DIMENSION = 700
SIDE_FINAL_WIDTH = 500
SIDE_FINAL_HEIGHT = 380
SIDE_PADDING_FRACTION = 0.06


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# --- Image <-> data URL -------------------------------------------------


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Any supported image bytes -> RGBA uint8 HxWx4 (alpha 255 if the source has none)."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    return np.array(img)


def decode_data_url(data_url: str) -> np.ndarray:
    header, _, b64 = data_url.partition(",")
    return decode_image(base64.b64decode(b64))


def encode_data_url(rgba: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def resize_max_dimension(rgba: np.ndarray, max_dim: int) -> np.ndarray:
    h, w = rgba.shape[:2]
    scale = min(1.0, max_dim / max(w, h))
    if scale >= 1.0:
        return rgba
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    return cv2.resize(rgba, (nw, nh), interpolation=cv2.INTER_AREA)


# --- Lab helpers ---------------------------------------------------------


def to_lab(rgb: np.ndarray) -> np.ndarray:
    """RGB uint8 HxWx3 -> Lab float32 HxWx3 in standard CIE ranges (L 0..100)."""
    f = rgb.astype(np.float32) / 255.0
    return cv2.cvtColor(f, cv2.COLOR_RGB2LAB)


def sobel_edge_magnitude(lab: np.ndarray) -> np.ndarray:
    """Same role as the hand-rolled Sobel pass: a strong luminance edge is a
    hard wall a flood fill should never cross, regardless of colour distance."""
    L = lab[:, :, 0]
    gx = cv2.Sobel(L, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(L, cv2.CV_32F, 0, 1, ksize=3)
    return np.sqrt(gx * gx + gy * gy)


def lab_weighted_distance(lab: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Vectorized |dL|*weight + |da| + |db| distance from a reference Lab colour to every pixel."""
    dL = np.abs(lab[:, :, 0] - ref[0]) * LAB_L_WEIGHT
    da = np.abs(lab[:, :, 1] - ref[1])
    db = np.abs(lab[:, :, 2] - ref[2])
    return dL + da + db


# --- Lens regions ---------------------------------------------------------


@dataclass
class LensRegion:
    cx: float
    cy: float
    area: int
    min_x: int
    max_x: int
    min_y: int
    max_y: int


def is_lens_shaped(r: LensRegion) -> bool:
    """A real lens opening is roughly as tall as it is wide, never a thin bar.
    Guards against a colour-guided fill leaking through a thin/reflective rim
    into the hinge and temple — the grown region then measures far wider
    than tall, which would otherwise inflate the front-rim crop enough to
    let the temple survive into the final image."""
    w = r.max_x - r.min_x
    h = r.max_y - r.min_y
    return h > 0 and w / h <= MAX_LENS_REGION_ASPECT


def is_plausible_lens_pair(a: LensRegion, b: LensRegion) -> bool:
    """Do these two regions look like the left and right lens of one frame?"""
    area_ratio = min(a.area, b.area) / max(a.area, b.area)
    height_a = a.max_y - a.min_y
    height_b = b.max_y - b.min_y
    mean_height = (height_a + height_b) / 2
    if mean_height < 4:
        return False
    height_ratio = min(height_a, height_b) / max(height_a, height_b)
    on_one_line = abs(a.cy - b.cy) < mean_height * 0.45
    return area_ratio > 0.35 and height_ratio > 0.45 and on_one_line


def _components_touching_border(labels: np.ndarray) -> set[int]:
    return (
        set(np.unique(labels[0, :]).tolist())
        | set(np.unique(labels[-1, :]).tolist())
        | set(np.unique(labels[:, 0]).tolist())
        | set(np.unique(labels[:, -1]).tolist())
    )


def find_transparent_holes(alpha: np.ndarray) -> list[LensRegion]:
    """Lens openings as enclosed low-alpha regions: real background is always
    reachable from the image border, so a low-alpha blob that ISN'T
    border-connected can only be a hole the frame encloses — a lens."""
    h, w = alpha.shape
    clear = (alpha < OPAQUE_THRESHOLD).astype(np.uint8)
    num, labels, stats, centroids = cv2.connectedComponentsWithStats(clear, connectivity=4)
    border = _components_touching_border(labels)

    regions: list[LensRegion] = []
    for i in range(1, num):
        if i in border:
            continue
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area <= (w * h) / 800:
            continue
        x, y = int(stats[i, cv2.CC_STAT_LEFT]), int(stats[i, cv2.CC_STAT_TOP])
        bw, bh = int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])
        cx, cy = centroids[i]
        regions.append(LensRegion(cx=float(cx), cy=float(cy), area=area, min_x=x, max_x=x + bw - 1, min_y=y, max_y=y + bh - 1))

    regions.sort(key=lambda r: -r.area)
    regions = regions[:2]
    regions.sort(key=lambda r: r.cx)
    return regions


def grow_lens_region(rgba: np.ndarray, lab: np.ndarray, edge: np.ndarray, seed_x: float, seed_y: float) -> Optional[tuple[LensRegion, np.ndarray]]:
    """Grows a lens region from a seed point using the seed's own colour as
    the reference (a real lens is glass-grey/tinted, essentially never the
    same shade as the backdrop), stepping neighbour-to-neighbour so it can
    follow gradients and soft shadows, capped overall by distance from the
    seed, and walled off by the Sobel edge map so it can't cross the rim."""
    h, w = lab.shape[:2]
    sx = int(clamp(round(seed_x), 0, w - 1))
    sy = int(clamp(round(seed_y), 0, h - 1))
    if rgba[sy, sx, 3] <= OPAQUE_THRESHOLD:
        return None

    seed_lab = lab[sy, sx].copy()

    # cv2.floodFill barrier: pre-mark edges and transparent pixels as
    # "already filled" (any nonzero mask value blocks the fill, regardless
    # of what it is) so the fill can never cross them, regardless of colour
    # similarity — the same role the Sobel wall plays in the original. The
    # barrier value (255) and the fill mark (1) must differ, or the two
    # become indistinguishable once both are nonzero in the same mask.
    BARRIER_MARK = 255
    FILL_MARK = 1
    barrier = (edge > SOBEL_EDGE_THRESHOLD) | (rgba[:, :, 3] <= OPAQUE_THRESHOLD)
    mask = np.zeros((h + 2, w + 2), np.uint8)
    mask[1:-1, 1:-1] = np.where(barrier, BARRIER_MARK, 0).astype(np.uint8)

    flood_src = lab.copy()
    # loDiff/upDiff are neighbour-relative by default (FIXED_RANGE unset),
    # matching the original's "step" tolerance (compared to the pixel that
    # pushed it, not the seed) — this is what lets it follow gradients.
    diff = (LENS_STEP_TOLERANCE, LENS_STEP_TOLERANCE, LENS_STEP_TOLERANCE)
    cv2.floodFill(
        flood_src,
        mask,
        (sx, sy),
        newVal=(0, 0, 0),
        loDiff=diff,
        upDiff=diff,
        flags=cv2.FLOODFILL_MASK_ONLY | (FILL_MARK << 8) | 4,
    )
    grown = mask[1:-1, 1:-1] == FILL_MARK

    # Global cap: never stray too far from the seed's own colour overall,
    # independent of how gradual each individual step looked.
    grown &= lab_weighted_distance(lab, seed_lab) <= LENS_GLOBAL_CAP

    if not grown.any():
        return None

    ys, xs = np.nonzero(grown)
    region = LensRegion(
        cx=float(xs.mean()), cy=float(ys.mean()), area=int(grown.sum()),
        min_x=int(xs.min()), max_x=int(xs.max()), min_y=int(ys.min()), max_y=int(ys.max()),
    )
    return region, grown


def is_reflection_pixel(rgb: np.ndarray) -> np.ndarray:
    """Vectorized: a pixel this bright and this low-saturation reads as a
    specular highlight/glare, not the lens's own material colour."""
    mn = rgb.min(axis=-1).astype(np.int32)
    mx = rgb.max(axis=-1).astype(np.int32)
    return (mn >= REFLECTION_MIN_CHANNEL) & (mx - mn <= REFLECTION_MAX_SPREAD)


def clear_lens_reflections(rgba: np.ndarray, lenses: list[LensRegion]) -> None:
    """A blown specular highlight can survive growLensRegion's step tolerance
    as a solid white fleck inside an otherwise translucent lens — pull any
    such pixel within each lens's own bounding box down to the same glass
    alpha as the rest of the lens."""
    for lens in lenses:
        y0, y1 = lens.min_y, lens.max_y + 1
        x0, x1 = lens.min_x, lens.max_x + 1
        patch = rgba[y0:y1, x0:x1]
        opaque = patch[:, :, 3] > LENS_ALPHA
        reflective = is_reflection_pixel(patch[:, :, :3])
        patch[:, :, 3] = np.where(opaque & reflective, LENS_ALPHA, patch[:, :, 3])


def lens_interior_fill(region_mask: np.ndarray, region: LensRegion) -> np.ndarray:
    """Pixels a lens fill had to route around but which sit inside the lens
    opening anyway — a temple arm seen through the glass, a printed brand
    logo, a hard-edged reflection.

    Colour can't tell those apart from real frame material (a dark arm
    behind the glass and a dark browline bar above it are the same pixels to
    a colour test), but geometry can: a pixel with lens on both sides of it
    horizontally AND vertically, within that lens's own bounding box, is
    enclosed by the opening whatever is drawn on it. Requiring both axes is
    what keeps the fill inside the rim (a rim pixel has lens to one side
    only); confining it to the region's own bbox stops one lens reaching
    across the bridge into the other. An object that exits the lens rather
    than crossing it (an arm running out through the hinge) stops qualifying
    where it leaves, which is the correct place to stop.
    """
    y0, y1 = region.min_y, region.max_y + 1
    x0, x1 = region.min_x, region.max_x + 1
    sub = region_mask[y0:y1, x0:x1]
    full = np.zeros_like(region_mask)
    if sub.size == 0:
        return full

    h, w = sub.shape
    cols = np.arange(w)
    row_has = sub.any(axis=1)
    first_col = np.where(sub, np.broadcast_to(cols, sub.shape), w).min(axis=1)
    last_col = np.where(sub, np.broadcast_to(cols, sub.shape), -1).max(axis=1)
    between_row = (cols[None, :] >= first_col[:, None]) & (cols[None, :] <= last_col[:, None]) & row_has[:, None]

    rows = np.arange(h)
    col_has = sub.any(axis=0)
    rows_b = np.broadcast_to(rows[:, None], sub.shape)
    first_row = np.where(sub, rows_b, h).min(axis=0)
    last_row = np.where(sub, rows_b, -1).max(axis=0)
    between_col = (rows[:, None] >= first_row[None, :]) & (rows[:, None] <= last_row[None, :]) & col_has[None, :]

    full[y0:y1, x0:x1] = between_row & between_col & ~sub
    return full


def median_region_color(rgb: np.ndarray, region_mask: np.ndarray) -> np.ndarray:
    """Median colour of a lens's own grown pixels — the glass colour an
    occluder inside it should be repainted as."""
    pixels = rgb[region_mask]
    if pixels.size == 0:
        return np.array([128, 128, 128], dtype=np.uint8)
    return np.median(pixels, axis=0).astype(np.uint8)


def mark_lens(rgba: np.ndarray, region: LensRegion, region_mask: np.ndarray) -> None:
    """Marks a lens: its own grown pixels keep their photographed colour at
    glass alpha, while anything enclosed by them (see `lens_interior_fill`)
    is repainted to the lens's median colour first — LENS_ALPHA is
    translucent, not invisible, so a black temple arm left at its own colour
    still reads as a dark streak through the glass at 15% opacity; only
    replacing the colour makes it genuinely disappear into the lens."""
    color = median_region_color(rgba[:, :, :3], region_mask)
    fill_mask = lens_interior_fill(region_mask, region)
    rgba[:, :, :3] = np.where(fill_mask[:, :, None], color, rgba[:, :, :3])
    rgba[:, :, 3] = np.where(region_mask | fill_mask, LENS_ALPHA, rgba[:, :, 3])


def clear_occluders_inside_holes(rgba: np.ndarray, lenses: list[LensRegion]) -> None:
    """Same enclosed-occluder clearing as `mark_lens`, for lenses that
    arrived already transparent rather than colour-grown — a clear optical
    lens the ML matte saw straight through, or a source PNG that already had
    its lens openings cut out. Those paths never call `grow_lens_region`, so
    nothing has looked at what sits inside the opening: an arm folded across
    the glass stays fully opaque in the middle of an otherwise cut-out lens.
    The hole's own transparent pixels stand in for the grown region here,
    and anything they enclose is cleared outright — the surrounding lens is
    see-through, so an occluder inside it should be too, rather than being
    repainted to glass colour the way a tinted lens's is."""
    alpha = rgba[:, :, 3]
    for region in lenses:
        y0, y1 = region.min_y, region.max_y + 1
        x0, x1 = region.min_x, region.max_x + 1
        full_mask = np.zeros(alpha.shape, dtype=bool)
        full_mask[y0:y1, x0:x1] = alpha[y0:y1, x0:x1] < OPAQUE_THRESHOLD
        if not full_mask.any():
            continue
        fill_mask = lens_interior_fill(full_mask, region)
        alpha[:] = np.where(fill_mask, 0, alpha)


def detect_and_mark_lenses(
    rgba: np.ndarray, lab: np.ndarray, edge: np.ndarray,
    seeds: tuple[tuple[float, float], tuple[float, float]], trust_seeds: bool,
) -> list[LensRegion]:
    left = grow_lens_region(rgba, lab, edge, *seeds[0])
    right = grow_lens_region(rgba, lab, edge, *seeds[1])
    if left is None or right is None:
        return []
    left_region, left_mask = left
    right_region, right_mask = right
    if not is_lens_shaped(left_region) or not is_lens_shaped(right_region):
        return []
    if not trust_seeds and not is_plausible_lens_pair(left_region, right_region):
        return []

    mark_lens(rgba, left_region, left_mask)
    mark_lens(rgba, right_region, right_mask)
    return [left_region, right_region]


def auto_seeds(rgba: np.ndarray) -> tuple[tuple[float, float], tuple[float, float]]:
    content = bounding_box(rgba[:, :, 3])
    x, y, w, h = content
    return (
        (x + w * (0.5 - FRONT_LENS_SPAN / 2), y + h * 0.5),
        (x + w * (0.5 + FRONT_LENS_SPAN / 2), y + h * 0.5),
    )


# --- Cleanup passes --------------------------------------------------------


def drop_detached_specks(alpha: np.ndarray) -> None:
    """Clears opaque islands too small, or too far away and too small, to be
    part of the frame (a printed logo elsewhere on the backdrop, a corner
    watermark) — a real frame is one connected object."""
    opaque = (alpha > OPAQUE_THRESHOLD).astype(np.uint8)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(opaque, connectivity=4)
    if num < 3:  # background label + at most one real component
        return
    areas = stats[1:, cv2.CC_STAT_AREA]
    main_id = int(np.argmax(areas)) + 1
    largest = int(stats[main_id, cv2.CC_STAT_AREA])
    main_x, main_y = int(stats[main_id, cv2.CC_STAT_LEFT]), int(stats[main_id, cv2.CC_STAT_TOP])
    main_w, main_h = int(stats[main_id, cv2.CC_STAT_WIDTH]), int(stats[main_id, cv2.CC_STAT_HEIGHT])
    margin = max(main_w, main_h) * DETACHED_MARGIN_FRACTION
    exp_x0, exp_y0 = main_x - margin, main_y - margin
    exp_x1, exp_y1 = main_x + main_w + margin, main_y + main_h + margin
    min_area = largest * SPECK_FRACTION

    for i in range(1, num):
        if i == main_id:
            continue
        area = int(stats[i, cv2.CC_STAT_AREA])
        x, y = int(stats[i, cv2.CC_STAT_LEFT]), int(stats[i, cv2.CC_STAT_TOP])
        w, h = int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])
        overlaps_main = x + w >= exp_x0 and x <= exp_x1 and y + h >= exp_y0 and y <= exp_y1
        too_small = area < min_area
        detached = (not overlaps_main) and area < largest * DETACHED_MAX_SIZE_FRACTION
        if too_small or detached:
            alpha[labels == i] = 0


def close_enclosed_alpha_gaps(rgba: np.ndarray, lenses: list[LensRegion]) -> None:
    """Restores any enclosed, not-fully-opaque pocket that isn't one of the
    real lenses back to solid. A thin bright bridge wire is exactly the
    low-contrast case matting can leave partially cleared instead of solid —
    real background can never be trapped in a pocket fully enclosed by
    opaque frame pixels, so anything enclosed here that isn't a lens is an
    artifact of removal, not real content."""
    alpha = rgba[:, :, 3]
    gap = (alpha < GAP_ALPHA_THRESHOLD).astype(np.uint8)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(gap, connectivity=4)
    border = _components_touching_border(labels)

    for i in range(1, num):
        if i in border:
            continue
        x, y = int(stats[i, cv2.CC_STAT_LEFT]), int(stats[i, cv2.CC_STAT_TOP])
        w, h = int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])
        overlaps_lens = any(
            x <= lens.max_x and x + w - 1 >= lens.min_x and y <= lens.max_y and y + h - 1 >= lens.min_y
            for lens in lenses
        )
        if overlaps_lens:
            continue
        alpha[labels == i] = 255


def sample_background_rgb(rgb: np.ndarray) -> np.ndarray:
    """Median RGB from many border points — same sampling pattern as the
    background-colour sampling used elsewhere, kept in plain RGB since
    decontamination below works in the same space the source photo and
    canvas compositing already use."""
    h, w = rgb.shape[:2]
    step = max(1, min(w, h) // 40)
    samples = np.concatenate(
        [rgb[0, ::step], rgb[h - 1, ::step], rgb[::step, 0], rgb[::step, w - 1]], axis=0
    )
    return np.median(samples.astype(np.float32), axis=0)


def decontaminate_edge_color(rgba: np.ndarray, bg: np.ndarray) -> None:
    """Removes background-colour bleed ("halo") left at partially-transparent
    edge pixels after segmentation.

    A photographed edge is rarely a clean step from frame to backdrop
    (camera anti-aliasing, JPEG blending), so a pixel the matte correctly
    marks e.g. 40% opaque still holds close to its ORIGINAL blended colour,
    which sits far closer to the backdrop than to the frame — composited
    over a face, that leftover tint reads as a thin light ring around the
    frame. Unmixes each partially-transparent pixel against the assumed
    over-compositing model (observed = alpha*fg + (1-alpha)*bg) to recover
    the frame's own colour. Solid (alpha ~255) and fully-cleared (alpha 0)
    pixels are left untouched — nothing to unmix at either extreme.
    """
    alpha = rgba[:, :, 3].astype(np.float32)
    mask = (alpha > 0) & (alpha < 250)
    af = np.clip(alpha / 255.0, 1e-6, 1.0)[:, :, None]
    rgb = rgba[:, :, :3].astype(np.float32)
    fg = (rgb - (1 - af) * bg[None, None, :]) / af
    fg = np.clip(np.round(fg), 0, 255)
    rgba[:, :, :3] = np.where(mask[:, :, None], fg, rgba[:, :, :3]).astype(np.uint8)


def extend_opaque_color_into_transparency(rgba: np.ndarray, passes: int) -> None:
    """Overwrites fully-transparent pixels' colour with nearby frame colour,
    spreading outward a few pixels.

    Alpha 0 doesn't mean a pixel's RGB is never seen: `finalize_front` crops
    and rescales every photo into one shared canvas size, and that
    resampling blends neighbouring pixels' colour together before alpha is
    applied. Left as whatever the original backdrop colour was, that blend
    can reintroduce the exact background-tinted fringe
    `decontaminate_edge_color` just removed — this leaves nothing
    background-coloured nearby for a later resize to blend in.
    """
    for _ in range(passes):
        alpha = rgba[:, :, 3]
        has_color = alpha > 10
        rgb = rgba[:, :, :3].astype(np.float32)
        rgb_masked = np.where(has_color[:, :, None], rgb, 0.0)
        count = has_color.astype(np.float32)

        sum_rgb = np.zeros_like(rgb_masked)
        sum_count = np.zeros_like(count)
        sum_rgb[1:, :] += rgb_masked[:-1, :]
        sum_count[1:, :] += count[:-1, :]
        sum_rgb[:-1, :] += rgb_masked[1:, :]
        sum_count[:-1, :] += count[1:, :]
        sum_rgb[:, 1:] += rgb_masked[:, :-1]
        sum_count[:, 1:] += count[:, :-1]
        sum_rgb[:, :-1] += rgb_masked[:, 1:]
        sum_count[:, :-1] += count[:, 1:]

        need_fill = ~has_color & (sum_count > 0)
        avg = np.divide(sum_rgb, sum_count[:, :, None], out=np.zeros_like(sum_rgb), where=sum_count[:, :, None] > 0)
        new_rgb = np.where(need_fill[:, :, None], np.round(avg), rgb)
        rgba[:, :, :3] = np.clip(new_rgb, 0, 255).astype(np.uint8)


OPAQUE_FOR_CONTRAST = 250


def normalize_contrast(rgba: np.ndarray) -> None:
    """Mild linear contrast stretch on the final assembled canvas — a photo
    shot in flat/low-contrast light can otherwise render duller than the
    catalogue photos next to it. Only touches fully-opaque pixels
    (translucent lens interiors and the feathered/decontaminated edge ring
    are left exactly as those earlier passes produced them), and skips a
    photo that's already well-exposed or a degenerate near-solid-colour
    selection either way.
    """
    alpha = rgba[:, :, 3]
    opaque = alpha >= OPAQUE_FOR_CONTRAST
    if not opaque.any():
        return
    rgb = rgba[:, :, :3].astype(np.float32)
    luminance = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    vals = luminance[opaque]
    lo, hi = float(vals.min()), float(vals.max())
    rng = hi - lo
    if not (5 < rng < 180):
        return
    target_lo, target_hi = 10.0, 245.0
    scale = (target_hi - target_lo) / rng
    new_rgb = np.clip(np.round(target_lo + (rgb - lo) * scale), 0, 255)
    rgba[:, :, :3] = np.where(opaque[:, :, None], new_rgb, rgba[:, :, :3]).astype(np.uint8)


def feather_alpha(alpha: np.ndarray) -> None:
    """Softens the alpha channel with a small box blur only at edges, so a
    hard cut-out doesn't read as a pasted sticker."""
    alpha_f = alpha.astype(np.float32)
    avg = cv2.blur(alpha_f, (3, 3))
    edge_mask = (np.abs(avg - alpha_f) > 40) & (alpha_f > 0)
    blended = alpha_f * 0.35 + avg * 0.65
    alpha[:] = np.where(edge_mask, blended, alpha_f).astype(np.uint8)


# --- Geometry / cropping ---------------------------------------------------


def bounding_box(alpha: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(alpha > OPAQUE_THRESHOLD)
    if xs.size == 0:
        h, w = alpha.shape
        return (0, 0, w, h)
    return (int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))


def tight_box_within(alpha: np.ndarray, bounds: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    bx, by, bw, bh = bounds
    region = alpha[by : by + bh, bx : bx + bw]
    ys, xs = np.nonzero(region > OPAQUE_THRESHOLD)
    if xs.size == 0:
        return bounds
    return (bx + int(xs.min()), by + int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))


def front_rim_box(lenses: list[LensRegion], content: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """Crop covering just the front of the frame: both lens openings plus the
    rim around them, excluding the temple arms."""
    left, right = lenses
    lens_w = max(left.max_x - left.min_x, right.max_x - right.min_x)
    lens_h = max(left.max_y - left.min_y, right.max_y - right.min_y)

    pad_x = lens_w * 0.22
    pad_top = lens_h * 0.55  # browline frames carry a thick top bar
    pad_bottom = lens_h * 0.3

    cx, cy, cw, ch = content
    x0 = max(cx, round(left.min_x - pad_x))
    x1 = min(cx + cw, round(right.max_x + pad_x))
    y0 = max(cy, round(min(left.min_y, right.min_y) - pad_top))
    y1 = min(cy + ch, round(max(left.max_y, right.max_y) + pad_bottom))

    if x1 - x0 < 8 or y1 - y0 < 8:
        return content
    return (x0, y0, x1 - x0, y1 - y0)


def column_profile_crop(alpha: np.ndarray, content: tuple[int, int, int, int]) -> tuple[tuple[int, int, int, int], int]:
    """Fallback temple removal when lens openings can't be found. The front of
    a frame is tall (a full lens height per column); temple arms are thin
    bars. Keeping only columns reaching a good fraction of the tallest column
    isolates the front. Returns (box, front_width); front_width is 0 when the
    front couldn't be told apart from the arms."""
    opaque = alpha > OPAQUE_THRESHOLD
    col_any = opaque.any(axis=0)
    if not col_any.any():
        return content, 0

    # Height (max_y - min_y + 1) per column, 0 where the column is empty.
    h, w = alpha.shape
    heights = np.zeros(w, dtype=np.int32)
    ys_by_col_top = np.where(col_any, np.argmax(opaque, axis=0), 0)
    ys_by_col_bottom = np.where(col_any, h - 1 - np.argmax(opaque[::-1, :], axis=0), 0)
    heights[col_any] = (ys_by_col_bottom - ys_by_col_top + 1)[col_any]

    ref_height = int(heights.max())
    if ref_height < 8:
        return content, 0

    threshold = ref_height * 0.4
    tall_cols = np.nonzero(heights >= threshold)[0]
    if tall_cols.size == 0 or tall_cols.max() - tall_cols.min() < 8:
        return content, 0

    x_min, x_max = int(tall_cols.min()), int(tall_cols.max())
    pad_x = round((x_max - x_min) * 0.05)
    cx, cy, cw, ch = content
    x0 = max(cx, x_min - pad_x)
    x1 = min(cx + cw, x_max + pad_x)

    col_slice = opaque[:, x0 : x1 + 1]
    row_any = col_slice.any(axis=1)
    if not row_any.any():
        return content, 0
    rows = np.nonzero(row_any)[0]
    y0, y1 = int(rows.min()), int(rows.max())

    return (x0, y0, x1 - x0 + 1, y1 - y0 + 1), x_max - x_min + 1


def enforce_lens_symmetry(lens_left_x: float, lens_right_x: float) -> tuple[float, float]:
    """Auto-detection can land the two lenses at genuinely different
    distances from the frame's own centre line — glare eating into one
    lens, a hinge shadow biasing the other's seed growth — while still
    passing both `is_plausible_lens_pair` and `is_plausible_geometry`:
    their tolerances exist for real, mildly-imperfect photos, not to catch
    every asymmetry. The visible result is the overlay rendering off-centre
    or hugging one eye instead of both. Recentering the reported span
    around the exact midpoint (0.5) removes that failure mode outright — it
    changes only the normalized alignment metadata used to place the
    overlay, never the crop itself, and is never applied to manual seeds: a
    human's own two clicks are trusted as-is (see the call site)."""
    span = lens_right_x - lens_left_x
    return 0.5 - span / 2, 0.5 + span / 2


def is_plausible_geometry(aspect: float, lens_left_x: float, lens_right_x: float, lens_y: float) -> bool:
    """Rejects lens measurements that cannot describe a real pair of glasses
    — the on-screen size is derived by dividing by the lens span, so a bogus
    span blows the frame up by many times across the wearer's face."""
    span = lens_right_x - lens_left_x
    midpoint = (lens_left_x + lens_right_x) / 2
    return (
        np.isfinite(span)
        and 0.28 <= span <= 0.72
        and abs(midpoint - 0.5) <= 0.15
        and 0.2 <= lens_y <= 0.8
        and np.isfinite(aspect)
        and 1.2 <= aspect <= WIDEST_FRONT_ASPECT
    )


def _box_dict(box: tuple[int, int, int, int]) -> dict:
    x, y, w, h = box
    return {"x": x, "y": y, "w": w, "h": h}


# --- Top-level operations, matching WorkingFrame/ProcessedFrame/ProcessedSideFrame ----


def prepare_front(image_bytes: bytes, manual_seeds: Optional[dict] = None) -> dict:
    """Background removal + lens detection, stopping short of the temple-arm
    crop — mirrors prepareWorkingFrame in lib/processFrameImage.ts. The
    result is the WorkingFrame shape the admin UI already knows how to
    render (including into the manual crop tool when auto-detection misses)."""
    rgba = decode_image(image_bytes)
    rgba = resize_max_dimension(rgba, MAX_DIMENSION)
    h, w = rgba.shape[:2]

    already_transparent = bool((rgba[:, :, 3] < 200).any())
    lenses: list[LensRegion] = []

    if already_transparent:
        lenses = find_transparent_holes(rgba[:, :, 3])
        if len(lenses) == 2:
            clear_lens_reflections(rgba, lenses)
        clear_occluders_inside_holes(rgba, lenses)
        drop_detached_specks(rgba[:, :, 3])
        close_enclosed_alpha_gaps(rgba, lenses)
    else:
        rgba = remove_background(rgba[:, :, :3])
        lab = to_lab(rgba[:, :, :3])
        edge = sobel_edge_magnitude(lab)

        if manual_seeds:
            seeds = (
                (manual_seeds["leftX"] * w, manual_seeds["leftY"] * h),
                (manual_seeds["rightX"] * w, manual_seeds["rightY"] * h),
            )
            lenses = detect_and_mark_lenses(rgba, lab, edge, seeds, trust_seeds=True)
        else:
            # A genuinely clear/optical lens can already come back transparent
            # from matting — try that first, purely topologically, before
            # assuming anything about colour.
            lenses = find_transparent_holes(rgba[:, :, 3])
            plausible = len(lenses) == 2 and is_plausible_lens_pair(lenses[0], lenses[1])
            if plausible:
                clear_occluders_inside_holes(rgba, lenses)
            else:
                # A tinted/sunglasses lens looks like solid material to the
                # model (no notion of "glass"), so it comes back opaque
                # along with the rim — falls through to the colour-seeded
                # search, confined to an already-accurate silhouette.
                lenses = detect_and_mark_lenses(rgba, lab, edge, auto_seeds(rgba), trust_seeds=False)

        if len(lenses) == 2:
            clear_lens_reflections(rgba, lenses)
        drop_detached_specks(rgba[:, :, 3])
        close_enclosed_alpha_gaps(rgba, lenses)
        feather_alpha(rgba[:, :, 3])
        decontaminate_edge_color(rgba, sample_background_rgb(rgba[:, :, :3]))
        extend_opaque_color_into_transparency(rgba, 3)

    content_box = bounding_box(rgba[:, :, 3])
    box = content_box
    geometry: Optional[dict] = None
    lenses_detected = False
    lens_centers = None

    # A human's two clicks already say "these are the lenses" — re-applying
    # the auto-pairing plausibility gate on top would let a merely-asymmetric
    # real pair get silently discarded despite being exactly what was
    # pointed at. is_lens_shaped, applied earlier, still guards against a
    # leaked/malformed region regardless of who supplied the seed.
    manual_trusted = manual_seeds is not None
    if len(lenses) == 2 and (manual_trusted or is_plausible_lens_pair(lenses[0], lenses[1])):
        candidate_box = front_rim_box(lenses, content_box)
        bx, by, bw, bh = candidate_box
        candidate_left_x = (lenses[0].cx - bx) / bw
        candidate_right_x = (lenses[1].cx - bx) / bw
        candidate_lens_y = ((lenses[0].cy + lenses[1].cy) / 2 - by) / bh
        candidate_aspect = bw / bh
        # A human's two clicks already say "these are the lenses" — forcing
        # symmetry on top would override a deliberate, trusted correction.
        if not manual_trusted:
            candidate_left_x, candidate_right_x = enforce_lens_symmetry(candidate_left_x, candidate_right_x)
        if is_plausible_geometry(candidate_aspect, candidate_left_x, candidate_right_x, candidate_lens_y) or manual_trusted:
            box = candidate_box
            geometry = {
                "aspect": candidate_aspect,
                "lensLeftX": candidate_left_x,
                "lensRightX": candidate_right_x,
                "lensY": candidate_lens_y,
            }
            lenses_detected = True
            lens_centers = {
                "left": {"x": lenses[0].cx, "y": lenses[0].cy},
                "right": {"x": lenses[1].cx, "y": lenses[1].cy},
            }

    # Detection failed or produced nonsense (angled photos, logos printed on
    # the lens). Fall back to a profile-based crop and neutral geometry
    # rather than trusting a bad measurement.
    if geometry is None:
        crop, front_width = column_profile_crop(rgba[:, :, 3], content_box)
        box = crop
        bw, bh = crop[2], crop[3]
        aspect = bw / bh
        measured = (front_width / bw) if front_width > 0 else 1
        front_fraction = min(measured, WIDEST_FRONT_ASPECT / aspect, 1)
        span = clamp(FRONT_LENS_SPAN * front_fraction, 0.18, 0.6)
        geometry = {"aspect": aspect, "lensLeftX": 0.5 - span / 2, "lensRightX": 0.5 + span / 2, "lensY": 0.5}

    return {
        "dataUrl": encode_data_url(rgba),
        "width": w,
        "height": h,
        "autoBox": _box_dict(box),
        "contentBox": _box_dict(content_box),
        "lensCenters": lens_centers,
        "autoGeometry": geometry,
        "alreadyTransparent": already_transparent,
        "lensesDetected": lenses_detected,
        "warning": None,
    }


def _geometry_for_box(working: dict, box: tuple[int, int, int, int]) -> dict:
    bx, by, bw, bh = box
    lens_centers = working.get("lensCenters")
    if lens_centers:
        return {
            "aspect": bw / bh,
            "lensLeftX": (lens_centers["left"]["x"] - bx) / bw,
            "lensRightX": (lens_centers["right"]["x"] - bx) / bw,
            "lensY": ((lens_centers["left"]["y"] + lens_centers["right"]["y"]) / 2 - by) / bh,
        }
    auto_box = working["autoBox"]
    if (auto_box["x"], auto_box["y"], auto_box["w"], auto_box["h"]) == box:
        return working["autoGeometry"]
    # No detected centres and this isn't the box already reasoned about:
    # assume a manual crop was trimmed tight to the front already.
    span = clamp(FRONT_LENS_SPAN, 0.18, 0.6)
    return {"aspect": bw / bh, "lensLeftX": 0.5 - span / 2, "lensRightX": 0.5 + span / 2, "lensY": 0.5}


def finalize_front(working: dict, box: dict) -> dict:
    """Crops a working frame to `box`, fits it into the shared final canvas,
    and re-expresses lens geometry against it — mirrors finalizeFrame. Fully
    stateless: `working` carries everything (including the image itself as a
    data URL) that /prepare-front already returned to the browser."""
    rgba = decode_data_url(working["dataUrl"])
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3]

    bx = int(clamp(box["x"], 0, w - 1))
    by = int(clamp(box["y"], 0, h - 1))
    bw = int(clamp(box["w"], 1, w - bx))
    bh = int(clamp(box["h"], 1, h - by))
    clamped_box = (bx, by, bw, bh)

    geometry = _geometry_for_box(working, clamped_box)

    # Re-tighten within the box, then pad by a fixed fraction and fit into
    # the shared canvas size.
    tx, ty, tw, th = tight_box_within(alpha, clamped_box)
    pad_x = round(tw * FINAL_PADDING_FRACTION)
    pad_y = round(th * FINAL_PADDING_FRACTION)
    px0 = int(clamp(tx - pad_x, bx, bx + bw))
    py0 = int(clamp(ty - pad_y, by, by + bh))
    px1 = int(clamp(tx + tw + pad_x, bx, bx + bw))
    py1 = int(clamp(ty + th + pad_y, by, by + bh))
    padded_w = max(1, px1 - px0)
    padded_h = max(1, py1 - py0)

    fit_scale = min(FINAL_CANVAS_WIDTH / padded_w, FINAL_CANVAS_HEIGHT / padded_h)
    draw_w = max(1, round(padded_w * fit_scale))
    draw_h = max(1, round(padded_h * fit_scale))
    offset_x = round((FINAL_CANVAS_WIDTH - draw_w) / 2)
    offset_y = round((FINAL_CANVAS_HEIGHT - draw_h) / 2)

    cropped = rgba[py0 : py0 + padded_h, px0 : px0 + padded_w]
    interp = cv2.INTER_AREA if fit_scale < 1 else cv2.INTER_LINEAR
    resized = cv2.resize(cropped, (draw_w, draw_h), interpolation=interp)

    canvas = np.zeros((FINAL_CANVAS_HEIGHT, FINAL_CANVAS_WIDTH, 4), dtype=np.uint8)
    ry1 = min(FINAL_CANVAS_HEIGHT, offset_y + draw_h)
    rx1 = min(FINAL_CANVAS_WIDTH, offset_x + draw_w)
    canvas[offset_y:ry1, offset_x:rx1] = resized[: ry1 - offset_y, : rx1 - offset_x]
    normalize_contrast(canvas)

    def to_final_x(frac_of_box: float) -> float:
        return (bx + frac_of_box * bw - px0) * fit_scale + offset_x

    def to_final_y(frac_of_box: float) -> float:
        return (by + frac_of_box * bh - py0) * fit_scale + offset_y

    final_geometry = {
        "aspect": FINAL_CANVAS_WIDTH / FINAL_CANVAS_HEIGHT,
        "lensLeftX": to_final_x(geometry["lensLeftX"]) / FINAL_CANVAS_WIDTH,
        "lensRightX": to_final_x(geometry["lensRightX"]) / FINAL_CANVAS_WIDTH,
        "lensY": to_final_y(geometry["lensY"]) / FINAL_CANVAS_HEIGHT,
    }

    content_box = working["contentBox"]
    temples_cropped = bw < content_box["w"] - 2 or bh < content_box["h"] - 2

    return {
        "dataUrl": encode_data_url(canvas),
        "geometry": final_geometry,
        "alreadyTransparent": working["alreadyTransparent"],
        "lensesDetected": working["lensesDetected"],
        "templesCropped": temples_cropped,
        "warning": working.get("warning"),
        "width": FINAL_CANVAS_WIDTH,
        "height": FINAL_CANVAS_HEIGHT,
    }


def process_side(image_bytes: bytes) -> dict:
    """Background removal + plain content crop, no lens detection — keeping
    the temple arm is the whole point of a side photo. Mirrors
    processSideFrameImage."""
    rgba = decode_image(image_bytes)
    rgba = resize_max_dimension(rgba, SIDE_MAX_DIMENSION)

    already_transparent = bool((rgba[:, :, 3] < 200).any())
    if not already_transparent:
        rgba = remove_background(rgba[:, :, :3])
        drop_detached_specks(rgba[:, :, 3])
        # No lens regions to protect — any enclosed haze here is always an
        # artifact, never intentional translucency, for a side photo.
        close_enclosed_alpha_gaps(rgba, [])
        feather_alpha(rgba[:, :, 3])
        decontaminate_edge_color(rgba, sample_background_rgb(rgba[:, :, :3]))
        extend_opaque_color_into_transparency(rgba, 3)

    cx, cy, cw, ch = bounding_box(rgba[:, :, 3])
    pad_x = round(cw * SIDE_PADDING_FRACTION)
    pad_y = round(ch * SIDE_PADDING_FRACTION)
    h, w = rgba.shape[:2]
    x0 = max(0, cx - pad_x)
    y0 = max(0, cy - pad_y)
    x1 = min(w, cx + cw + pad_x)
    y1 = min(h, cy + ch + pad_y)
    box_w, box_h = max(1, x1 - x0), max(1, y1 - y0)

    fit_scale = min(SIDE_FINAL_WIDTH / box_w, SIDE_FINAL_HEIGHT / box_h)
    draw_w = max(1, round(box_w * fit_scale))
    draw_h = max(1, round(box_h * fit_scale))
    offset_x = round((SIDE_FINAL_WIDTH - draw_w) / 2)
    offset_y = round((SIDE_FINAL_HEIGHT - draw_h) / 2)

    cropped = rgba[y0:y1, x0:x1]
    interp = cv2.INTER_AREA if fit_scale < 1 else cv2.INTER_LINEAR
    resized = cv2.resize(cropped, (draw_w, draw_h), interpolation=interp)

    canvas = np.zeros((SIDE_FINAL_HEIGHT, SIDE_FINAL_WIDTH, 4), dtype=np.uint8)
    ry1 = min(SIDE_FINAL_HEIGHT, offset_y + draw_h)
    rx1 = min(SIDE_FINAL_WIDTH, offset_x + draw_w)
    canvas[offset_y:ry1, offset_x:rx1] = resized[: ry1 - offset_y, : rx1 - offset_x]
    normalize_contrast(canvas)

    return {
        "dataUrl": encode_data_url(canvas),
        "width": SIDE_FINAL_WIDTH,
        "height": SIDE_FINAL_HEIGHT,
        "alreadyTransparent": already_transparent,
        "warning": None,
    }
