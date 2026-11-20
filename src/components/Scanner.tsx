import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Crop, Images, Loader2, RotateCw, Trash2, X } from "lucide-react";
import {
  FULL,
  Filter,
  PageSettings,
  Pt,
  Quad,
  Rotation,
  blobToCanvas,
  canvasToBlob,
  detectPage,
  isFull,
  renderPage,
  rotate,
  toCanvas,
} from "../lib/scan";

/**
 * The homework scanner: a camera that stays open, one tap per page.
 *
 * Built the way scanner apps work, because the first version (the phone's own
 * camera through a file picker) closed after every photo and, on the staff
 * screen, sent the first page before a second could be taken.
 *
 *  - The camera stays on. Each tap of the shutter adds a page to the strip at
 *    the bottom; nothing is sent until "Done".
 *  - Every page in the strip has a cross. It asks before deleting.
 *  - Tapping a page opens it: Clean / B&W / Original, rotate, crop.
 *  - The page of paper is found and straightened automatically when it is
 *    clearly visible; otherwise the whole picture is kept. Crop always has
 *    "Whole photo", so a wrong guess never costs the student their working.
 *
 * If the browser will not give a live camera (permission refused, an old
 * phone), the same screen works with the phone's own camera, one photo at a
 * time, and with photos from the gallery. Pages still collect in the strip.
 */

interface Page extends PageSettings {
  id: string;
  /** The camera frame, kept as a JPEG so twenty pages stay small in memory. */
  source: Blob;
  thumb: string;
}

interface Props {
  open: boolean;
  title: string;
  /** Up to this many pages. */
  max?: number;
  onClose: () => void;
  onDone: (files: File[]) => void | Promise<void>;
}

const SOURCE_SIDE = 2000;
const SEND_SIDE = 1500;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "clean", label: "Clean" },
  { id: "bw", label: "B&W" },
  { id: "original", label: "Original" },
];

let counter = 0;
const newId = () => `p${Date.now()}_${counter++}`;

async function thumbOf(source: Blob, settings: PageSettings): Promise<string> {
  const c = await renderPage(source, settings, 360);
  return c.toDataURL("image/jpeg", 0.7);
}

// ---------------------------------------------------------------------------
// Crop: four handles on the picture
// ---------------------------------------------------------------------------
const CropView: React.FC<{
  page: Page;
  onCancel: () => void;
  onApply: (quad: Quad) => void;
}> = ({ page, onCancel, onApply }) => {
  const [url, setUrl] = useState("");
  const [quad, setQuad] = useState<Quad>(page.quad);
  const [auto, setAuto] = useState<Quad | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const turned = rotate(await blobToCanvas(page.source, 1200), page.rotation);
      if (!alive) return;
      setUrl(turned.toDataURL("image/jpeg", 0.8));
      setAuto(detectPage(turned));
    })();
    return () => {
      alive = false;
    };
  }, [page.source, page.rotation]);

  const move = (e: React.PointerEvent) => {
    if (drag.current === null || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const p: Pt = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
    setQuad((q) => q.map((old, i) => (i === drag.current ? p : old)) as Quad);
  };

  const points = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");

  return (
    <div className="absolute inset-0 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onCancel} className="text-sm font-bold px-3 py-2 cursor-pointer">Cancel</button>
        <p className="text-sm font-black">Drag the corners to the page</p>
        <button onClick={() => onApply(quad)} className="text-sm font-black px-4 py-2 rounded-xl bg-emerald-500 text-white cursor-pointer">Apply</button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-5">
        {url ? (
          <div
            ref={box}
            className="relative max-h-full max-w-full touch-none select-none"
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <img src={url} alt="" draggable={false} className="block max-h-[68vh] max-w-full" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
              <polygon points={points} fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
            </svg>
            {quad.map((p, i) => (
              <div
                key={i}
                onPointerDown={(e) => {
                  drag.current = i;
                  (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                }}
                className="absolute w-11 h-11 -ml-[22px] -mt-[22px] rounded-full border-[3px] border-white bg-emerald-500/70 shadow-lg"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              />
            ))}
          </div>
        ) : (
          <Loader2 className="w-7 h-7 text-white animate-spin" />
        )}
      </div>
      <div className="flex items-center justify-center gap-3 px-4 pb-6">
        <button onClick={() => setQuad(FULL)} className="text-sm font-bold px-4 py-2.5 rounded-xl bg-white/10 text-white cursor-pointer">Whole photo</button>
        <button
          onClick={() => auto && setQuad(auto)}
          disabled={!auto}
          className="text-sm font-bold px-4 py-2.5 rounded-xl bg-white/10 text-white disabled:opacity-40 cursor-pointer"
        >
          Find the page
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// One page, opened from the strip
// ---------------------------------------------------------------------------
const PageView: React.FC<{
  page: Page;
  number: number;
  total: number;
  onBack: () => void;
  onChange: (patch: Partial<PageSettings>) => void;
  onDelete: () => void;
}> = ({ page, number, total, onBack, onChange, onDelete }) => {
  const [url, setUrl] = useState(page.thumb);
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    void renderPage(page.source, page, 1100).then((c) => {
      if (!alive) return;
      setUrl(c.toDataURL("image/jpeg", 0.85));
      setBusy(false);
    });
    return () => {
      alive = false;
    };
  }, [page.source, page.rotation, page.quad, page.filter]);

  if (cropping) {
    return (
      <CropView
        page={page}
        onCancel={() => setCropping(false)}
        onApply={(quad) => {
          onChange({ quad });
          setCropping(false);
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onBack} className="text-sm font-black px-4 py-2 rounded-xl bg-white/10 cursor-pointer">Back</button>
        <p className="text-sm font-black">Page {number} of {total}</p>
        <button onClick={onDelete} className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300 cursor-pointer" title="Delete this page">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 relative">
        <img src={url} alt={`Page ${number}`} className="max-h-full max-w-full rounded-lg bg-white" />
        {busy && <Loader2 className="absolute w-7 h-7 text-white animate-spin" />}
      </div>
      <div className="px-4 pb-6 space-y-3">
        <div className="flex justify-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => onChange({ filter: f.id })}
              className={`text-sm font-black px-4 py-2.5 rounded-xl cursor-pointer ${
                page.filter === f.id ? "bg-white text-slate-900" : "bg-white/10 text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex justify-center gap-2">
          <button
            onClick={() => onChange({ rotation: (((page.rotation + 90) % 360) as Rotation), quad: FULL })}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl bg-white/10 text-white cursor-pointer"
          >
            <RotateCw className="w-4 h-4" /> Rotate
          </button>
          <button
            onClick={() => setCropping(true)}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl bg-white/10 text-white cursor-pointer"
          >
            <Crop className="w-4 h-4" /> Crop{isFull(page.quad) ? "" : " ✓"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------
export const Scanner: React.FC<Props> = ({ open, title, max = 20, onClose, onDone }) => {
  const [pages, setPages] = useState<Page[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [live, setLive] = useState<"starting" | "on" | "off">("starting");
  const [working, setWorking] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [filter, setFilter] = useState<Filter>("clean");

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  // Read by async work that started before a re-render.
  const filterNow = useRef<Filter>(filter);
  filterNow.current = filter;

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // The camera runs only while the scanner is open and no page is being edited.
  useEffect(() => {
    if (!open) {
      stopCamera();
      setPages([]);
      setOpenId(null);
      setFinishing(false);
      setWorking(0);
      return;
    }
    if (openId) return;
    let cancelled = false;
    setLive("starting");
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setLive("on");
      } catch {
        if (!cancelled) setLive("off");
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, openId, stopCamera]);

  // Stop the camera if the app goes to the background; a phone keeps the lamp on otherwise.
  useEffect(() => stopCamera, [stopCamera]);

  const addSource = useCallback(async (canvas: HTMLCanvasElement) => {
    setWorking((n) => n + 1);
    try {
      const source = await canvasToBlob(canvas, 0.9);
      const found = detectPage(canvas);
      const settings: PageSettings = { rotation: 0, quad: found ?? FULL, filter: filterNow.current };
      const thumb = await thumbOf(source, settings);
      setPages((list) => (list.length >= max ? list : [...list, { id: newId(), source, thumb, ...settings }]));
      window.setTimeout(() => strip.current?.scrollTo({ left: strip.current.scrollWidth, behavior: "smooth" }), 60);
    } finally {
      setWorking((n) => n - 1);
    }
  }, [max]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth || pages.length + working >= max) return;
    const frame = toCanvas(v, v.videoWidth, v.videoHeight, SOURCE_SIDE);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 120);
    if (navigator.vibrate) navigator.vibrate(20);
    void addSource(frame);
  };

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        await addSource(await blobToCanvas(file, SOURCE_SIDE));
      } catch {
        /* a file the browser cannot read is skipped */
      }
    }
    if (nativeCamera.current) nativeCamera.current.value = "";
    if (gallery.current) gallery.current.value = "";
  };

  const change = (id: string, patch: Partial<PageSettings>) => {
    setPages((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    const next = { ...page, ...patch };
    void thumbOf(next.source, next).then((thumb) =>
      setPages((list) => list.map((p) => (p.id === id ? { ...p, thumb } : p)))
    );
  };

  const remove = (id: string) => {
    const index = pages.findIndex((p) => p.id === id);
    if (index < 0) return;
    if (!window.confirm(`Do you want to delete page ${index + 1}?`)) return;
    setPages((list) => list.filter((p) => p.id !== id));
    setOpenId((cur) => (cur === id ? null : cur));
  };

  const close = () => {
    if (finishing) return;
    if (pages.length && !window.confirm(`Throw away ${pages.length} scanned page${pages.length > 1 ? "s" : ""}?`)) return;
    onClose();
  };

  const finish = async () => {
    if (!pages.length || working || finishing) return;
    setFinishing(true);
    try {
      const files: File[] = [];
      for (let i = 0; i < pages.length; i++) {
        const c = await renderPage(pages[i].source, pages[i], SEND_SIDE);
        const blob = await canvasToBlob(c, 0.72);
        files.push(new File([blob], `scan_${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
      }
      await onDone(files);
    } finally {
      setFinishing(false);
    }
  };

  if (!open) return null;

  const openPage = pages.find((p) => p.id === openId);
  const full = pages.length + working >= max;

  // Rendered on <body>, not where it is used: the screens of this app sit inside
  // animated containers, and a "fixed" box inside a transformed parent is fixed
  // to that parent, not to the phone. Found in testing: the scanner opened
  // somewhere down the page, out of sight.
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black text-white flex flex-col" role="dialog" aria-label="Scan homework">
      <input ref={nativeCamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addFiles(Array.from(e.target.files ?? []))} />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addFiles(Array.from(e.target.files ?? []))} />

      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <button onClick={close} className="p-2.5 rounded-xl bg-white/10 cursor-pointer" title="Close"><X className="w-5 h-5" /></button>
        <p className="text-sm font-black truncate">{title}</p>
        <button
          onClick={() => void finish()}
          disabled={!pages.length || working > 0 || finishing}
          className="flex items-center gap-1.5 text-sm font-black px-4 py-2.5 rounded-xl bg-emerald-500 disabled:bg-white/10 disabled:text-white/40 cursor-pointer disabled:cursor-default"
        >
          {finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Done{pages.length ? ` (${pages.length})` : ""}
        </button>
      </div>

      {/* Camera */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
        <video ref={video} playsInline muted autoPlay className={`max-h-full max-w-full ${live === "on" ? "" : "hidden"}`} />
        {live === "starting" && <Loader2 className="w-8 h-8 animate-spin text-white/70" />}
        {live === "off" && (
          <div className="text-center px-8 space-y-3">
            <p className="text-sm font-bold text-white/80">The camera did not open here.</p>
            <p className="text-xs text-white/50">Allow the camera for this site, or use the button below. Each photo is added as a page.</p>
            <button onClick={() => nativeCamera.current?.click()} disabled={full} className="text-sm font-black px-5 py-3 rounded-2xl bg-white text-slate-900 cursor-pointer">
              Take a photo
            </button>
          </div>
        )}
        {flash && <div className="absolute inset-0 bg-white/80 pointer-events-none" />}
        {live === "on" && (
          <p className="absolute top-2 left-1/2 -translate-x-1/2 text-[11px] font-bold bg-black/50 px-3 py-1 rounded-full whitespace-nowrap">
            Keep the whole page inside · {pages.length + working} page{pages.length + working === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {/* The strip: every page taken so far */}
      <div ref={strip} className="flex gap-2 overflow-x-auto px-3 py-2 min-h-[92px] items-center">
        {pages.length === 0 && working === 0 && (
          <p className="text-xs text-white/40 font-semibold w-full text-center">Pages you scan appear here. Tap one to fix it.</p>
        )}
        {pages.map((p, i) => (
          <div key={p.id} className="relative shrink-0">
            <button onClick={() => setOpenId(p.id)} className="block cursor-pointer" title={`Open page ${i + 1}`}>
              <img src={p.thumb} alt={`Page ${i + 1}`} className="h-[76px] w-[58px] object-cover rounded-lg border-2 border-white/30 bg-white" />
              <span className="absolute bottom-1 left-1 text-[10px] font-black bg-black/70 rounded px-1">{i + 1}</span>
            </button>
            <button
              onClick={() => remove(p.id)}
              title={`Delete page ${i + 1}`}
              className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center shadow cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {working > 0 && (
          <div className="shrink-0 h-[76px] w-[58px] rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-white/70" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 pb-6 pt-1 space-y-3">
        <div className="flex justify-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs font-black px-3 py-1.5 rounded-full cursor-pointer ${filter === f.id ? "bg-white text-slate-900" : "bg-white/10 text-white/80"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => gallery.current?.click()} disabled={full} className="flex flex-col items-center gap-1 w-20 text-[10px] font-bold text-white/70 cursor-pointer">
            <Images className="w-6 h-6" /> Gallery
          </button>
          <button
            onClick={live === "on" ? shoot : () => nativeCamera.current?.click()}
            disabled={full || live === "starting"}
            aria-label="Scan a page"
            className="w-[74px] h-[74px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 cursor-pointer active:scale-95 transition-transform"
          >
            <span className="w-[58px] h-[58px] rounded-full bg-white" />
          </button>
          <div className="w-20 text-center text-[10px] font-bold text-white/50">{full ? `Limit ${max}` : "One tap = one page"}</div>
        </div>
      </div>

      {openPage && (
        <PageView
          page={openPage}
          number={pages.indexOf(openPage) + 1}
          total={pages.length}
          onBack={() => setOpenId(null)}
          onChange={(patch) => change(openPage.id, patch)}
          onDelete={() => remove(openPage.id)}
        />
      )}
    </div>,
    document.body
  );
};
