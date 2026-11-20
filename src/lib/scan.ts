/**
 * Image work behind the homework scanner: no library, plain canvas.
 *
 * A scanned page is kept as a JPEG blob of the camera frame plus three small
 * settings (rotation, crop corners, filter). The page is rendered from those
 * whenever it is shown or sent, so every edit can be undone and twenty pages
 * do not hold twenty full bitmaps in a phone's memory.
 *
 * Order of rendering: rotate -> crop and straighten (perspective) -> filter.
 */

export type Pt = { x: number; y: number };
/** Corners as fractions of the (rotated) picture: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];
export type Filter = "clean" | "bw" | "original";
export type Rotation = 0 | 90 | 180 | 270;

export const FULL: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;

/** Draws anything drawable onto a canvas no longer than `maxSide`. */
export function toCanvas(src: CanvasImageSource, sw: number, sh: number, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const c = makeCanvas(sw * scale, sh * scale);
  const g = ctx2d(c);
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function blobToCanvas(blob: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  // `from-image` applies the photo's EXIF turn, so a portrait photo stays portrait.
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const c = toCanvas(bitmap, bitmap.width, bitmap.height, maxSide);
  bitmap.close();
  return c;
}

export const canvasToBlob = (c: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the page."))), "image/jpeg", quality)
  );

export function rotate(src: HTMLCanvasElement, turn: Rotation): HTMLCanvasElement {
  if (turn === 0) return src;
  const swap = turn === 90 || turn === 270;
  const c = makeCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const g = ctx2d(c);
  g.translate(c.width / 2, c.height / 2);
  g.rotate((turn * Math.PI) / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// ---------------------------------------------------------------------------
// Crop and straighten
// ---------------------------------------------------------------------------

/** Solves the 8 unknowns of the projective map that sends the unit square to `q`. */
function squareToQuad(q: Pt[]): number[] {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  // A flat (degenerate) quad has no map; fall back to the plain affine one.
  const g = Math.abs(det) < 1e-9 ? 0 : (dx3 * dy2 - dx2 * dy3) / det;
  const h = Math.abs(det) < 1e-9 ? 0 : (dx1 * dy3 - dx3 * dy1) / det;
  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h,
  ];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export const isFull = (q: Quad): boolean =>
  q.every((p, i) => Math.abs(p.x - FULL[i].x) < 0.004 && Math.abs(p.y - FULL[i].y) < 0.004);

/** Cuts the quad out of `src` and flattens it into a rectangle. */
export function warp(src: HTMLCanvasElement, quad: Quad, maxSide: number): HTMLCanvasElement {
  if (isFull(quad)) return toCanvas(src, src.width, src.height, maxSide);
  const q = quad.map((p) => ({ x: p.x * (src.width - 1), y: p.y * (src.height - 1) }));
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(8, Math.round(w * scale));
  h = Math.max(8, Math.round(h * scale));

  const m = squareToQuad(q);
  const sdata = ctx2d(src).getImageData(0, 0, src.width, src.height);
  const s = sdata.data, sw = src.width, sh = src.height;
  const out = makeCanvas(w, h);
  const og = ctx2d(out);
  const odata = og.createImageData(w, h);
  const o = odata.data;

  for (let y = 0; y < h; y++) {
    const v = h === 1 ? 0 : y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = w === 1 ? 0 : x / (w - 1);
      const d = m[6] * u + m[7] * v + 1;
      let fx = (m[0] * u + m[1] * v + m[2]) / d;
      let fy = (m[3] * u + m[4] * v + m[5]) / d;
      if (fx < 0) fx = 0; else if (fx > sw - 1) fx = sw - 1;
      if (fy < 0) fy = 0; else if (fy > sh - 1) fy = sh - 1;
      const x0 = fx | 0, y0 = fy | 0;
      const x1 = x0 < sw - 1 ? x0 + 1 : x0, y1 = y0 < sh - 1 ? y0 + 1 : y0;
      const ax = fx - x0, ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const oi = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const top = s[i00 + k] + (s[i10 + k] - s[i00 + k]) * ax;
        const bottom = s[i01 + k] + (s[i11 + k] - s[i01 + k]) * ax;
        o[oi + k] = top + (bottom - top) * ay;
      }
      o[oi + 3] = 255;
    }
  }
  og.putImageData(odata, 0, 0);
  return out;
}

/**
 * Finds the sheet of paper: the largest bright patch in the picture, and the
 * four points of it that reach furthest into the four corners.
 *
 * Deliberately cautious. It answers null (use the whole picture) unless the
 * patch is clearly a page: big enough, not the whole frame, and four-sided.
 * A wrong crop loses a child's working; no crop loses nothing.
 */
export function detectPage(src: HTMLCanvasElement): Quad | null {
  const small = toCanvas(src, src.width, src.height, 220);
  const w = small.width, h = small.height, n = w * h;
  const d = ctx2d(small).getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
    gray[i] = v;
    hist[v]++;
  }
  // Otsu's threshold between "paper" and "everything else".
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const diff = sumB / wB - (sum - sumB) / wF;
    const between = wB * wF * diff * diff;
    if (between > best) { best = between; thr = i; }
  }
  // Paper and table too alike to tell apart: do not guess.
  let lo = 0, hi = 0, nLo = 0, nHi = 0;
  for (let i = 0; i < n; i++) { if (gray[i] > thr) { hi += gray[i]; nHi++; } else { lo += gray[i]; nLo++; } }
  if (!nLo || !nHi || hi / nHi - lo / nLo < 45) return null;

  // Largest connected bright patch.
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let bestSize = 0, bestLabel = 0, next = 0;
  for (let start = 0; start < n; start++) {
    if (gray[start] <= thr || label[start]) continue;
    next++;
    let top = 0, size = 0;
    stack[top++] = start;
    label[start] = next;
    while (top) {
      const p = stack[--top];
      size++;
      const px = p % w;
      if (px > 0 && gray[p - 1] > thr && !label[p - 1]) { label[p - 1] = next; stack[top++] = p - 1; }
      if (px < w - 1 && gray[p + 1] > thr && !label[p + 1]) { label[p + 1] = next; stack[top++] = p + 1; }
      if (p >= w && gray[p - w] > thr && !label[p - w]) { label[p - w] = next; stack[top++] = p - w; }
      if (p < n - w && gray[p + w] > thr && !label[p + w]) { label[p + w] = next; stack[top++] = p + w; }
    }
    if (size > bestSize) { bestSize = size; bestLabel = next; }
  }
  const share = bestSize / n;
  if (share < 0.25 || share > 0.92) return null;

  let tl = { x: 0, y: 0 }, tr = { x: 0, y: 0 }, br = { x: 0, y: 0 }, bl = { x: 0, y: 0 };
  let mTl = Infinity, mTr = -Infinity, mBr = -Infinity, mBl = -Infinity;
  for (let i = 0; i < n; i++) {
    if (label[i] !== bestLabel) continue;
    const x = i % w, y = (i / w) | 0;
    if (x + y < mTl) { mTl = x + y; tl = { x, y }; }
    if (x + y > mBr) { mBr = x + y; br = { x, y }; }
    if (x - y > mTr) { mTr = x - y; tr = { x, y }; }
    if (y - x > mBl) { mBl = y - x; bl = { x, y }; }
  }
  const quad = [tl, tr, br, bl].map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) })) as Quad;
  // The four points must enclose most of the patch, or it was not a rectangle.
  const area = Math.abs(
    quad.reduce((a, p, i) => a + p.x * quad[(i + 1) % 4].y - quad[(i + 1) % 4].x * p.y, 0) / 2
  );
  if (area < share * 0.85 || area > share * 1.35) return null;
  if (dist(quad[0], quad[1]) < 0.3 || dist(quad[0], quad[3]) < 0.3) return null;
  return quad;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * "Clean": the paper is made white and the ink dark, whatever the lamp or the
 * shadow of the phone. The light falling on the page is estimated from a very
 * blurred, brightest-nearby copy of the picture and divided out, channel by
 * channel, so blue ink stays blue. "bw" does the same and drops the colour.
 */
export function applyFilter(c: HTMLCanvasElement, filter: Filter): void {
  if (filter === "original") return;
  const w = c.width, h = c.height;
  const g = ctx2d(c);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;

  // 1. A small copy: each cell is the average of a block of the page.
  const cell = Math.max(8, Math.round(Math.max(w, h) / 48));
  const sw = Math.max(2, Math.ceil(w / cell)), sh = Math.max(2, Math.ceil(h / cell));
  const small = makeCanvas(sw, sh);
  const sg = ctx2d(small);
  sg.imageSmoothingQuality = "high";
  sg.drawImage(c, 0, 0, sw, sh);
  const sd = sg.getImageData(0, 0, sw, sh);
  const s = sd.data;

  // 2. Brightest value nearby (ink is small, paper wins), then a blur.
  const pass = (srcArr: Float32Array, pick: (a: number, b: number) => number, radius: number): Float32Array => {
    const tmp = new Float32Array(srcArr.length), out = new Float32Array(srcArr.length);
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++)
        for (let k = 0; k < 3; k++) {
          let acc = srcArr[(y * sw + x) * 3 + k], count = 1;
          for (let r = 1; r <= radius; r++) {
            if (x - r >= 0) { acc = pick(acc, srcArr[(y * sw + x - r) * 3 + k]); count++; }
            if (x + r < sw) { acc = pick(acc, srcArr[(y * sw + x + r) * 3 + k]); count++; }
          }
          tmp[(y * sw + x) * 3 + k] = pick === add ? acc / count : acc;
        }
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++)
        for (let k = 0; k < 3; k++) {
          let acc = tmp[(y * sw + x) * 3 + k], count = 1;
          for (let r = 1; r <= radius; r++) {
            if (y - r >= 0) { acc = pick(acc, tmp[((y - r) * sw + x) * 3 + k]); count++; }
            if (y + r < sh) { acc = pick(acc, tmp[((y + r) * sw + x) * 3 + k]); count++; }
          }
          out[(y * sw + x) * 3 + k] = pick === add ? acc / count : acc;
        }
    return out;
  };
  const add = (a: number, b: number) => a + b;
  let light = new Float32Array(sw * sh * 3);
  for (let i = 0; i < sw * sh; i++) for (let k = 0; k < 3; k++) light[i * 3 + k] = s[i * 4 + k];
  light = pass(light, Math.max, 2);
  light = pass(light, add, 2);
  for (let i = 0; i < sw * sh; i++) {
    for (let k = 0; k < 3; k++) s[i * 4 + k] = Math.max(40, Math.min(255, light[i * 3 + k]));
    s[i * 4 + 3] = 255;
  }
  sg.putImageData(sd, 0, 0);

  // 3. Stretch the light map back to full size (the browser smooths it).
  const big = makeCanvas(w, h);
  const bg = ctx2d(big);
  bg.imageSmoothingQuality = "high";
  bg.drawImage(small, 0, 0, w, h);
  const l = bg.getImageData(0, 0, w, h).data;

  // 4. Divide the light out, then set where black and white sit.
  const black = filter === "bw" ? 0.55 : 0.42, white = filter === "bw" ? 0.86 : 0.92;
  const span = white - black;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / l[i], gr = d[i + 1] / l[i + 1], b = d[i + 2] / l[i + 2];
    if (filter === "bw") r = gr = b = r * 0.3 + gr * 0.59 + b * 0.11;
    r = (r - black) / span; gr = (gr - black) / span; b = (b - black) / span;
    d[i] = r <= 0 ? 0 : r >= 1 ? 255 : r * 255;
    d[i + 1] = gr <= 0 ? 0 : gr >= 1 ? 255 : gr * 255;
    d[i + 2] = b <= 0 ? 0 : b >= 1 ? 255 : b * 255;
  }
  g.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// One page, start to finish
// ---------------------------------------------------------------------------

export interface PageSettings {
  rotation: Rotation;
  quad: Quad;
  filter: Filter;
}

/** Renders a page from its camera frame and settings. `maxSide` 1500 to send, 360 for a thumbnail. */
export async function renderPage(source: Blob, settings: PageSettings, maxSide: number): Promise<HTMLCanvasElement> {
  // Work from a copy no larger than needed: a thumbnail does not need 2000 px.
  const base = await blobToCanvas(source, Math.max(maxSide * 1.4, 480));
  const turned = rotate(base, settings.rotation);
  const flat = warp(turned, settings.quad, maxSide);
  applyFilter(flat, settings.filter);
  return flat;
}
