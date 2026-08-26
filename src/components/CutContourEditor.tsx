import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addCutContour,
  CUT_LAYER_COLORS,
  DEFAULT_CUT_LAYERS,
  DEFAULT_CUT_LAYER_ID,
  layerPreviewColor,
  type CutLayer,
  type CutShape,
  type ShapeType,
} from "@/lib/cutcontour";
import { Trash2, Square, Circle, Upload, Download, ChevronLeft, ChevronRight, Layers, Save, Plus, Ruler, Loader2, Check, Search, Pencil, X, Move } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { PDFDocument } from "pdf-lib";

// pdf.js
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = pdfWorker;

interface PageDims {
  width: number;
  height: number;
}

const PT_PER_MM = 72 / 25.4;

function MmInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string>(Number(value.toFixed(2)).toString());
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(Number(value.toFixed(2)).toString());
  }, [value]);
  return (
    <Input
      type="number"
      step="0.1"
      value={draft}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        const n = parseFloat(draft);
        if (Number.isFinite(n)) onCommit(n);
        setDraft(Number((Number.isFinite(n) ? n : value).toFixed(2)).toString());
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onCommit(n);
      }}
    />
  );
}

import {
  listPresets,
  createPresets,
  updatePreset,
  deletePresetById,
  type Preset,
  type PresetShape,
} from "@/lib/data";

export function CutContourEditor() {
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pageDims, setPageDims] = useState<PageDims>({ width: 0, height: 0 });
  // Page size in PDF points (per page index)
  const [pageSizesPt, setPageSizesPt] = useState<Record<number, PageDims>>({});
  const [shapes, setShapes] = useState<CutShape[]>([]);
  const [tool, setTool] = useState<ShapeType>("rect");
  const [drawing, setDrawing] = useState<null | { startX: number; startY: number; curX: number; curY: number }>(null);
  const [malMode, setMalMode] = useState(false);
  const [dragging, setDragging] = useState<null | {
    ids: string[];
    startX: number;
    startY: number;
    origin: Record<string, { x: number; y: number }>;
  }>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [progressDone, setProgressDone] = useState(false);

  const step = async (pct: number, label: string) => {
    setProgress(pct);
    setProgressLabel(label);
    // Geef de browser de kans om de voortgangsbalk te tekenen.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [presetQuery, setPresetQuery] = useState("");
  const [editPreset, setEditPreset] = useState<{ id: string; name: string; shapes: PresetShape[] } | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);

  /* ---------- Lagen (Publi-FDM / reclameonline.be) ---------- */
  const [layers, setLayers] = useState<CutLayer[]>(DEFAULT_CUT_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState<string>(DEFAULT_CUT_LAYER_ID);
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerColor, setNewLayerColor] = useState<string>("cyan");

  const layerOf = (s: CutShape) => s.layer || DEFAULT_CUT_LAYER_ID;
  const layerById = (id: string) => layers.find((l) => l.id === id) ?? layers[0];
  const colorOfLayer = (id: string) => layerPreviewColor(layerById(id)?.cmyk ?? [0, 1, 0, 0]);

  const addLayer = () => {
    const name = newLayerName.trim();
    if (!name) {
      toast.error("Geef de laag een naam");
      return;
    }
    if (layers.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Er bestaat al een laag met deze naam");
      return;
    }
    const col = CUT_LAYER_COLORS.find((c) => c.key === newLayerColor) ?? CUT_LAYER_COLORS[1];
    const id = crypto.randomUUID();
    setLayers((l) => [...l, { id, name, cmyk: col.cmyk }]);
    setActiveLayerId(id);
    setNewLayerName("");
    toast.success(`Laag "${name}" toegevoegd`);
  };

  const removeLayer = (id: string) => {
    if (id === DEFAULT_CUT_LAYER_ID) {
      toast.error("De laag \"Cutcontour\" is verplicht volgens de Publi-FDM norm");
      return;
    }
    const count = shapes.filter((s) => layerOf(s) === id).length;
    if (count > 0 && !window.confirm(`Deze laag bevat ${count} contour(en). Laag en contouren verwijderen?`)) return;
    setShapes((all) => all.filter((s) => layerOf(s) !== id));
    setLayers((l) => l.filter((x) => x.id !== id));
    if (activeLayerId === id) setActiveLayerId(DEFAULT_CUT_LAYER_ID);
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listPresets()
      .then(setPresets)
      .catch((err) => toast.error("Presets laden mislukt: " + (err as Error).message));
  }, []);

  const onFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Alleen PDF-bestanden zijn toegestaan");
      return;
    }
    const buf = await file.arrayBuffer();
    setFileBytes(buf);
    setFileName(file.name);
    setShapes([]);
    setSelectedId(null);
    setPageIndex(0);
    const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
    setPdfDoc(doc);
    setPageCount(doc.numPages);
    // Precompute page sizes in points
    const sizes: Record<number, PageDims> = {};
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale: 1 });
      sizes[i - 1] = { width: vp.width, height: vp.height };
    }
    setPageSizesPt(sizes);
  }, []);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(900, window.innerWidth - 420);
      const scale = targetWidth / viewport.width;
      const scaled = page.getViewport({ scale });
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      setPageDims({ width: scaled.width, height: scaled.height });
      await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex]);

  const getPos = (e: React.PointerEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const hitTest = (list: CutShape[], x: number, y: number): CutShape | null => {
    const inside = (s: CutShape) => {
      if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) return false;
      if (s.type === "ellipse") {
        const nx = (x - (s.x + s.w / 2)) / (s.w / 2 || 1);
        const ny = (y - (s.y + s.h / 2)) / (s.h / 2 || 1);
        return nx * nx + ny * ny <= 1;
      }
      return true;
    };
    // Contouren liggen bovenop de mal, zodat boorgaten los te slepen zijn.
    const normal = [...list].reverse().find((s) => !s.guide && inside(s));
    if (normal) return normal;
    return [...list].reverse().find((s) => s.guide && inside(s)) ?? null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pdfDoc) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const { x, y } = getPos(e);
    const hit = hitTest(shapes.filter((s) => s.page === pageIndex), x, y);
    if (hit) {
      setSelectedId(hit.id);
      // Bij een mal slepen alle vormen die eraan vasthangen mee.
      const ids = hit.guide && hit.group
        ? shapes.filter((s) => s.id === hit.id || s.group === hit.group).map((s) => s.id)
        : [hit.id];
      setDragging({
        ids,
        startX: x,
        startY: y,
        origin: Object.fromEntries(
          shapes.filter((s) => ids.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y }]),
        ),
      });
      return;
    }
    setDrawing({ startX: x, startY: y, curX: x, curY: y });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging) {
      const { x, y } = getPos(e);
      const dx = x - dragging.startX;
      const dy = y - dragging.startY;
      setShapes((all) =>
        all.map((s) => {
          const o = dragging.origin[s.id];
          return o ? { ...s, x: o.x + dx, y: o.y + dy } : s;
        }),
      );
      return;
    }
    if (!drawing) return;
    const { x, y } = getPos(e);
    setDrawing({ ...drawing, curX: x, curY: y });
  };
  const onPointerUp = () => {
    if (dragging) {
      setDragging(null);
      return;
    }
    if (!drawing) return;
    const x = Math.min(drawing.startX, drawing.curX);
    const y = Math.min(drawing.startY, drawing.curY);
    const w = Math.abs(drawing.curX - drawing.startX);
    const h = Math.abs(drawing.curY - drawing.startY);
    setDrawing(null);
    if (w < 0.005 || h < 0.005) return;
    const id = crypto.randomUUID();
    if (malMode) {
      setShapes((s) => [
        ...s,
        { id, page: pageIndex, type: tool, guide: true, group: id, x, y, w, h },
      ]);
      setSelectedId(id);
      setMalMode(false);
      toast.success("Mal toegevoegd — plaats nu je boorgaten erop");
      return;
    }
    // Hangt de nieuwe contour op een mal? Dan beweegt hij mee met die mal.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const guide = shapes
      .filter((s) => s.guide && s.page === pageIndex)
      .find((s) => cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h);
    setShapes((s) => [
      ...s,
      { id, page: pageIndex, type: tool, layer: activeLayerId, group: guide?.group, x, y, w, h },
    ]);
    setSelectedId(id);
  };


  const pageShapes = shapes.filter((s) => s.page === pageIndex);
  const selected = shapes.find((s) => s.id === selectedId) ?? null;

  // Helpers to convert normalized <-> mm using page size in points
  const pageSize = pageSizesPt[pageIndex] ?? { width: 595, height: 842 };
  const pageWmm = pageSize.width / PT_PER_MM;
  const pageHmm = pageSize.height / PT_PER_MM;

  const updateSelectedMm = (patch: { xMm?: number; yMm?: number; wMm?: number; hMm?: number }) => {
    if (!selected) return;
    const size0 = pageSizesPt[selected.page] ?? pageSize;
    const pW0 = size0.width / PT_PER_MM;
    const pH0 = size0.height / PT_PER_MM;
    let shiftX = 0;
    let shiftY = 0;
    if (selected.guide) {
      const curW = selected.w * pW0;
      const curH = selected.h * pH0;
      shiftX = ((patch.xMm ?? selected.x * pW0 + curW / 2) - (selected.x * pW0 + curW / 2)) / pW0;
      shiftY = ((patch.yMm ?? selected.y * pH0 + curH / 2) - (selected.y * pH0 + curH / 2)) / pH0;
    }
    setShapes((all) =>
      all.map((s) => {
        if (s.id !== selected.id) {
          // Vormen op de mal schuiven mee als de mal verplaatst wordt.
          if (selected.guide && selected.group && s.group === selected.group && (shiftX || shiftY)) {
            return { ...s, x: s.x + shiftX, y: s.y + shiftY };
          }
          return s;
        }
        const size = pageSizesPt[s.page] ?? pageSize;
        const pW = size.width / PT_PER_MM;
        const pH = size.height / PT_PER_MM;
        // X = center from left; Y = center from TOP of page
        const curWmm = s.w * pW;
        const curHmm = s.h * pH;
        const curXmm = s.x * pW + curWmm / 2;
        const curYmm = s.y * pH + curHmm / 2;
        const nextXmm = patch.xMm ?? curXmm;
        const nextYmm = patch.yMm ?? curYmm;
        const nextWmm = patch.wMm ?? curWmm;
        const nextHmm = patch.hMm ?? curHmm;
        // Convert back to top-left normalized for internal storage
        const xTopMm = nextXmm - nextWmm / 2;
        const yTopMm = nextYmm - nextHmm / 2;
        return {
          ...s,
          // Bewaar de exact ingevoerde maat. Niet begrenzen op 100% van de
          // PDF-pagina: dat liet Y bij grotere documenten terugspringen naar
          // de paginahoogte (bijvoorbeeld 1003,37 mm).
          x: xTopMm / pW,
          y: yTopMm / pH,
          w: Math.max(0, nextWmm / pW),
          h: Math.max(0, nextHmm / pH),
        };
      }),
    );
  };


  const handleExport = async () => {
    if (!fileBytes) return;
    setExporting(true);
    setProgressDone(false);
    try {
      await step(10, "PDF inlezen…");
      const source = fileBytes.slice(0);
      await step(35, `Cutcontour-laag opbouwen (${shapes.length} contouren)…`);
      const bytes = await addCutContour(source, shapes, layers);
      await step(75, "CMYK-drukprofiel toevoegen…");
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      await step(90, "Download klaarzetten…");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + "_cutcontour.pdf";
      a.click();
      URL.revokeObjectURL(url);
      await step(100, "Klaar — CMYK-PDF gedownload");
      setProgressDone(true);
      toast.success("CMYK-PDF klaar en gedownload (met Cutcontour-laag)");
    } catch (err) {
      console.error(err);
      setProgressLabel("Export mislukt");
      toast.error("Export mislukt: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportAnnotated = async () => {
    if (!pdfDoc || shapes.length === 0) {
      toast.error("Voeg eerst contouren toe");
      return;
    }
    setExporting(true);
    setProgressDone(false);
    try {
      await step(5, "Meetblad voorbereiden…");
      const outDoc = await PDFDocument.create();
      const SCALE = 2; // render resolution factor for crisp text
      for (let i = 0; i < pageCount; i++) {
        await step(
          5 + Math.round((i / Math.max(1, pageCount)) * 85),
          `Pagina ${i + 1} van ${pageCount} uitmeten…`,
        );
        const page = await pdfDoc.getPage(i + 1);
        const vp = page.getViewport({ scale: SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;

        const size = pageSizesPt[i] ?? { width: vp.width / SCALE, height: vp.height / SCALE };
        const pWmm = size.width / PT_PER_MM;
        const pHmm = size.height / PT_PER_MM;
        const pageContours = shapes.filter((s) => s.page === i);

        // Draw contours + labels
        ctx.lineWidth = 2;
        ctx.font = `${12 * SCALE}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "top";
        pageContours.forEach((s, idx) => {
          const x = s.x * canvas.width;
          const y = s.y * canvas.height;
          const w = s.w * canvas.width;
          const h = s.h * canvas.height;
          const isEllipse = s.type === "ellipse";

          // shape outline in de kleur van zijn laag
          const shapeColor = colorOfLayer(layerOf(s));
          ctx.strokeStyle = shapeColor;
          ctx.beginPath();
          if (isEllipse) {
            ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          } else {
            ctx.rect(x, y, w, h);
          }
          ctx.stroke();

          // crosshair at the exact center of every shape
          const refX = x + w / 2;
          const refY = y + h / 2;
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(refX - 8 * SCALE, refY);
          ctx.lineTo(refX + 8 * SCALE, refY);
          ctx.moveTo(refX, refY - 8 * SCALE);
          ctx.lineTo(refX, refY + 8 * SCALE);
          ctx.stroke();
          ctx.lineWidth = 2;

          // values in mm — X = center from left; Y = center from top of page
          const wmm = s.w * pWmm;
          const hmm = s.h * pHmm;
          const xmm = s.x * pWmm + wmm / 2;
          const ymm = s.y * pHmm + hmm / 2;
          const label = [
            `#${idx + 1} ${isEllipse ? "⌀" : "▭"} · ${layerById(layerOf(s))?.name ?? "Cutcontour"}`,
            `X: ${xmm.toFixed(2)} mm`,
            `Y: ${ymm.toFixed(2)} mm`,
            `L: ${wmm.toFixed(2)} mm`,
            `B: ${hmm.toFixed(2)} mm`,
          ];

          // Label box near top-left of shape
          const padding = 6 * SCALE;
          const lineH = 14 * SCALE;
          const boxW = 140 * SCALE;
          const boxH = padding * 2 + lineH * label.length;
          let bx = x + w + 6 * SCALE;
          let by = y;
          if (bx + boxW > canvas.width) bx = Math.max(0, x - boxW - 6 * SCALE);
          if (by + boxH > canvas.height) by = Math.max(0, canvas.height - boxH);

          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.strokeStyle = shapeColor;
          ctx.lineWidth = 1;
          ctx.fillRect(bx, by, boxW, boxH);
          ctx.strokeRect(bx, by, boxW, boxH);
          ctx.lineWidth = 2;

          // leader line to reference point
          ctx.strokeStyle = shapeColor;
          ctx.setLineDash([4 * SCALE, 3 * SCALE]);
          ctx.beginPath();
          ctx.moveTo(bx, by + boxH / 2);
          ctx.lineTo(refX, refY);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = "#111827";
          label.forEach((line, li) => {
            ctx.fillText(line, bx + padding, by + padding + li * lineH);
          });
        });

        // Header banner with page info
        const headerH = 22 * SCALE;
        ctx.fillStyle = "rgba(17,24,39,0.85)";
        ctx.fillRect(0, 0, canvas.width, headerH);
        ctx.fillStyle = "#ffffff";
        ctx.font = `${12 * SCALE}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(
          `Boorgat-meetblad · Pagina ${i + 1}/${pageCount} · ${pWmm.toFixed(1)}×${pHmm.toFixed(1)} mm · ${pageContours.length} boorgat${pageContours.length === 1 ? "" : "en"}`,
          8 * SCALE,
          5 * SCALE,
        );

        const pngBytes = await new Promise<ArrayBuffer>((resolve) => {
          canvas.toBlob((b) => b!.arrayBuffer().then(resolve), "image/png");
        });
        const img = await outDoc.embedPng(pngBytes);
        const outPage = outDoc.addPage([size.width, size.height]);
        outPage.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
      }

      await step(92, "Meetblad opslaan…");
      const bytes = await outDoc.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName.replace(/\.pdf$/i, "") || "meetblad") + "_boorgaten.pdf";
      a.click();
      URL.revokeObjectURL(url);
      await step(100, "Klaar — meetblad gedownload");
      setProgressDone(true);
      toast.success("Boorgat-meetblad geëxporteerd");
    } catch (err) {
      console.error(err);
      setProgressLabel("Export mislukt");
      toast.error("Export mislukt: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const saveCurrentPageAsPreset = async () => {
    const savable = pageShapes.filter((s) => !s.guide);
    if (savable.length === 0) {
      toast.error("Geen contouren op deze pagina om op te slaan");
      return;
    }
    const name = newPresetName.trim() || `Preset ${presets.length + 1} (${savable.length} contouren)`;
    const shapes: PresetShape[] = savable.map((s) => {
      const size = pageSizesPt[s.page] ?? pageSize;
      const pW = size.width / PT_PER_MM;
      const pH = size.height / PT_PER_MM;
      return { type: s.type, layer: layerOf(s), xMm: s.x * pW, yMm: s.y * pH, wMm: s.w * pW, hMm: s.h * pH };
    });
    try {
      const created = await createPresets([{ name, shapes }]);
      setPresets((prev) => [...prev, ...created]);
      setNewPresetName("");
      toast.success(`Preset opgeslagen (${shapes.length} contouren)`);
    } catch (err) {
      toast.error("Opslaan mislukt: " + (err as Error).message);
    }
  };

  const applyPreset = (preset: Preset) => {
    const pW = pageSize.width / PT_PER_MM;
    const pH = pageSize.height / PT_PER_MM;
    const added: CutShape[] = preset.shapes.map((ps) => ({
      id: crypto.randomUUID(),
      page: pageIndex,
      type: ps.type,
      layer: layers.some((l) => l.id === ps.layer) ? ps.layer : activeLayerId,
      // Presets mogen hun exacte positie behouden, ook wanneer de gekozen
      // PDF-pagina kleiner is dan het document waarop de preset is gemaakt.
      x: ps.xMm / pW,
      y: ps.yMm / pH,
      w: Math.max(0, ps.wMm / pW),
      h: Math.max(0, ps.hMm / pH),
    }));
    setShapes((s) => [...s, ...added]);
    setSelectedId(added[added.length - 1]?.id ?? null);
    toast.success(`Preset "${preset.name}" toegevoegd (${added.length} contouren)`);
  };

  const deletePreset = async (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    if (!window.confirm(`Preset "${p.name}" definitief verwijderen? Dit heeft geen invloed op de contouren die momenteel op de pagina staan.`)) {
      return;
    }
    try {
      await deletePresetById(id);
      setPresets((prev) => prev.filter((x) => x.id !== id));
      toast.success(`Preset "${p.name}" verwijderd`);
    } catch (err) {
      toast.error("Verwijderen mislukt: " + (err as Error).message);
    }
  };

  const filteredPresets = presets.filter((p) => {
    const q = presetQuery.trim().toLowerCase();
    if (!q) return true;
    return q.split(/\s+/).every((t) => p.name.toLowerCase().includes(t));
  });

  const saveEditedPreset = async () => {
    if (!editPreset) return;
    const name = editPreset.name.trim() || "Preset";
    setSavingPreset(true);
    try {
      await updatePreset(editPreset.id, { name, shapes: editPreset.shapes });
      setPresets((prev) =>
        prev.map((p) => (p.id === editPreset.id ? { ...p, name, shapes: editPreset.shapes } : p)),
      );
      setEditPreset(null);
      toast.success("Preset bijgewerkt");
    } catch (err) {
      toast.error("Opslaan mislukt: " + (err as Error).message);
    } finally {
      setSavingPreset(false);
    }
  };

  const backupPresets = () => {
    if (presets.length === 0) {
      toast.error("Geen presets om te back-uppen");
      return;
    }
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cutcontour-presets-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Back-up van presets gedownload");
  };

  const restorePresets = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("Ongeldig bestand");
      const items = parsed.map((p: any) => ({
        name: String(p.name ?? "Preset"),
        shapes: (p.shapes ?? []).map((s: any) => ({
          type: s.type === "ellipse" ? "ellipse" : "rect",
          xMm: Number(s.xMm) || 0,
          yMm: Number(s.yMm) || 0,
          wMm: Number(s.wMm) || 0,
          hMm: Number(s.hMm) || 0,
        })) as PresetShape[],
      }));
      const created = await createPresets(items);
      setPresets((prev) => [...prev, ...created]);
      toast.success(`${created.length} preset(s) hersteld`);
    } catch (err) {
      toast.error("Herstellen mislukt: " + (err as Error).message);
    }
  };

  const exportPresetsPdf = async () => {
    if (presets.length === 0) {
      toast.error("Geen presets om te exporteren");
      return;
    }
    setExporting(true);
    try {
      const { StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      const W = 595.28;
      const H = 841.89;
      const M = 48;
      let page = doc.addPage([W, H]);
      let y = H - M;

      const line = (text: string, size = 10, f = font, gap = 14) => {
        if (y < M + 40) {
          page = doc.addPage([W, H]);
          y = H - M;
        }
        page.drawText(text, { x: M, y, size, font: f, color: rgb(0, 0, 0) });
        y -= gap;
      };

      const cols = [M, M + 45, M + 130, M + 230, M + 330, M + 425];
      const row = (vals: string[], f = font, size = 9) => {
        if (y < M + 40) {
          page = doc.addPage([W, H]);
          y = H - M;
        }
        vals.forEach((v, i) => {
          page.drawText(v, { x: cols[i], y, size, font: f, color: rgb(0, 0, 0) });
        });
        y -= 13;
      };

      line("Cutcontour presets — maatoverzicht", 16, bold, 22);
      line(`Geëxporteerd: ${new Date().toLocaleString("nl-BE")}`, 9, font, 12);
      line("X en Y = middelpunt van de contour · X vanaf linkerrand · Y vanaf bovenrand · alle maten in mm", 8, font, 20);

      for (const p of presets) {
        y -= 6;
        line(`${p.name}  (${p.shapes.length} contour${p.shapes.length === 1 ? "" : "en"})`, 12, bold, 16);
        row(["#", "Vorm", "X (mm)", "Y (mm)", "L (mm)", "B (mm)"], bold, 9);
        p.shapes.forEach((s, i) => {
          const cx = s.xMm + s.wMm / 2;
          const cy = s.yMm + s.hMm / 2;
          row([
            String(i + 1),
            s.type === "ellipse" ? "Ellips" : "Rechthoek",
            cx.toFixed(2),
            cy.toFixed(2),
            s.wMm.toFixed(2),
            s.hMm.toFixed(2),
          ]);
        });
        y -= 8;
      }

      const bytes = await doc.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cutcontour-presets-maten.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Presetmaten geëxporteerd");
    } catch (err) {
      console.error(err);
      toast.error("Export mislukt: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const rectPreview = drawing
    ? {
        left: Math.min(drawing.startX, drawing.curX) * 100 + "%",
        top: Math.min(drawing.startY, drawing.curY) * 100 + "%",
        width: Math.abs(drawing.curX - drawing.startX) * 100 + "%",
        height: Math.abs(drawing.curY - drawing.startY) * 100 + "%",
      }
    : null;

  const selSize = selected ? pageSizesPt[selected.page] ?? pageSize : null;
  const selWmm = selSize && selected ? selected.w * (selSize.width / PT_PER_MM) : 0;
  const selHmm = selSize && selected ? selected.h * (selSize.height / PT_PER_MM) : 0;
  const selXmmRaw = selSize && selected ? selected.x * (selSize.width / PT_PER_MM) : 0;
  const selYmmRaw = selSize && selected ? selected.y * (selSize.height / PT_PER_MM) : 0;
  // X = center from left; Y = center from TOP of page
  const selXmm = selXmmRaw + selWmm / 2;
  const selYmm = selYmmRaw + selHmm / 2;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">
              CC
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Cutcontour Editor</h1>
              <p className="text-xs text-muted-foreground">
                Snijlijnen toevoegen aan drukklare PDF's (CMYK)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              <Button asChild variant="outline">
                <span>
                  <Upload className="w-4 h-4 mr-2" /> Upload PDF
                </span>
              </Button>
            </label>
            <Button onClick={handleExport} disabled={!fileBytes || exporting}>
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : progressDone ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {exporting
                ? `CMYK-PDF maken… ${progress}%`
                : progressDone
                  ? "CMYK-PDF gedownload"
                  : "Download CMYK-PDF"}
            </Button>
            <Button
              onClick={handleExportAnnotated}
              disabled={!fileBytes || exporting || shapes.length === 0}
              variant="secondary"
              title="Alleen voor eigen gebruik — PDF met X/Y/L/B labels bij elk boorgat"
            >
              <Ruler className="w-4 h-4 mr-2" />
              Meetblad
            </Button>
          </div>
        </div>
        {(exporting || progressDone) && (
          <div className="max-w-[1400px] mx-auto px-6 pb-4">
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-sm font-medium flex items-center gap-2">
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                  {progressLabel}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} />
              {progressDone && !exporting && (
                <p className="text-xs text-muted-foreground mt-2">
                  De CMYK-versie is volledig aangemaakt en staat in je downloads.
                </p>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <section>
          {!fileBytes ? (
            <label className="block">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              <div className="border-2 border-dashed border-border rounded-2xl p-16 text-center cursor-pointer hover:bg-muted transition">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Sleep je PDF hier of klik om te uploaden</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Voeg zoveel cutcontouren toe als je wilt — export als drukklare CMYK PDF met een "Cutcontour"-laag
                </p>
              </div>
            </label>
          ) : (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant={tool === "rect" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTool("rect")}
                  >
                    <Square className="w-4 h-4 mr-1" /> Rechthoek
                  </Button>
                  <Button
                    variant={tool === "ellipse" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTool("ellipse")}
                  >
                    <Circle className="w-4 h-4 mr-1" /> Ellips
                  </Button>
                  <Button
                    variant={malMode ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setMalMode((v) => !v)}
                    title="Teken een hulpvorm (mal) om boorgaten op te positioneren — wordt niet meegeëxporteerd"
                  >
                    <Move className="w-4 h-4 mr-1" /> {malMode ? "Mal tekenen…" : "Mal toevoegen"}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Pagina {Math.round(pageWmm)}×{Math.round(pageHmm)} mm
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm tabular-nums">
                    {pageIndex + 1} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={pageIndex >= pageCount - 1}
                    onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div
                className="relative inline-block mx-auto bg-muted rounded overflow-hidden shadow-sm"
                style={{ width: pageDims.width, height: pageDims.height }}
              >
                <canvas ref={canvasRef} className="block" />
                <div
                  ref={overlayRef}
                  className={dragging ? "absolute inset-0 cursor-grabbing" : "absolute inset-0 cursor-crosshair"}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  {pageShapes.map((s) => (
                    <div
                      key={s.id}
                      className={s.guide ? "absolute border-2 border-dashed" : "absolute border-2"}
                      style={{
                        pointerEvents: "none",
                        left: s.x * 100 + "%",
                        top: s.y * 100 + "%",
                        width: s.w * 100 + "%",
                        height: s.h * 100 + "%",
                        borderColor: selectedId === s.id
                          ? "oklch(0.7 0.3 30)"
                          : s.guide
                            ? "oklch(0.6 0.02 260)"
                            : colorOfLayer(layerOf(s)),
                        background: s.guide ? "oklch(0.6 0.02 260 / 0.08)" : undefined,
                        borderRadius: s.type === "ellipse" ? "50%" : 0,
                        boxShadow: selectedId === s.id ? "0 0 0 2px oklch(0.7 0.3 30 / 0.3)" : undefined,
                      }}
                    />
                  ))}
                  {rectPreview && (
                    <div
                      className="absolute border-2 border-dashed pointer-events-none"
                      style={{
                        ...rectPreview,
                        borderColor: malMode ? "oklch(0.6 0.02 260)" : colorOfLayer(activeLayerId),
                        borderRadius: tool === "ellipse" ? "50%" : 0,
                      }}
                    />
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Teken op de pagina, sleep een vorm om te verplaatsen of gebruik een preset. Klik een contour om exacte
                afmetingen in mm in te stellen. Een <strong>mal</strong> (stippellijn) is enkel een hulpvorm: sleep je de
                mal, dan bewegen de boorgaten die erop staan mee. De mal zelf wordt nooit meegeëxporteerd.
              </p>

            </Card>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Lagen</h2>
              <Badge variant="secondary" className="ml-auto">{layers.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Elke laag wordt als aparte OCG-laag met eigen steunkleur geëxporteerd (Publi-FDM / reclameonline.be).
              Zo kunnen boorgaten en contourlijnen nooit met elkaar in conflict komen. De laag "Cutcontour" is altijd
              100% magenta (CMYK 0/100/0/0).
            </p>
            <ul className="space-y-1">
              {layers.map((l) => {
                const count = shapes.filter((s) => layerOf(s) === l.id).length;
                return (
                  <li
                    key={l.id}
                    onClick={() => setActiveLayerId(l.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm ${
                      activeLayerId === l.id ? "bg-primary/10 ring-1 ring-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full border shrink-0"
                      style={{ background: layerPreviewColor(l.cmyk) }}
                    />
                    <span className="flex-1 min-w-0 truncate font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                    {l.id !== DEFAULT_CUT_LAYER_ID && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLayer(l.id);
                        }}
                        title="Laag verwijderen"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="space-y-2 pt-1">
              <Input
                placeholder="Nieuwe laagnaam (bv. Boorgaten)"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={newLayerColor}
                  onChange={(e) => setNewLayerColor(e.target.value)}
                >
                  {CUT_LAYER_COLORS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={addLayer}>
                  <Plus className="w-4 h-4 mr-1" /> Laag
                </Button>
              </div>
            </div>
          </Card>

          {selected && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                {selected.type === "rect" ? <Square className="w-4 h-4 text-primary" /> : <Circle className="w-4 h-4 text-primary" />}
                <h2 className="font-semibold">Afmetingen (mm)</h2>
                {selected.guide && <Badge variant="secondary">Mal</Badge>}
                <span className="ml-auto text-[10px] text-muted-foreground">X = midden vanaf links · Y = midden vanaf bovenkant</span>
              </div>
              {selected.guide && (
                <p className="text-xs text-muted-foreground">
                  Hulpvorm met {shapes.filter((s) => s.group === selected.group && s.id !== selected.id).length}{" "}
                  boorgat(en) erop. Verplaats de mal (slepen of X/Y aanpassen) en de boorgaten volgen mee. De mal wordt
                  niet meegeëxporteerd.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">X (midden)</Label>
                  <MmInput value={selXmm} onCommit={(n) => updateSelectedMm({ xMm: n })} />
                </div>
                <div>
                  <Label className="text-xs">Y (midden)</Label>
                  <MmInput value={selYmm} onCommit={(n) => updateSelectedMm({ yMm: n })} />
                </div>
                <div>
                  <Label className="text-xs">L (breedte)</Label>
                  <MmInput value={selWmm} onCommit={(n) => updateSelectedMm({ wMm: n })} />
                </div>
                <div>
                  <Label className="text-xs">B (hoogte)</Label>
                  <MmInput value={selHmm} onCommit={(n) => updateSelectedMm({ hMm: n })} />
                </div>
              </div>
              {selected.guide ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShapes((all) => all.filter((s) => s.id !== selected.id));
                    setSelectedId(null);
                    toast.success("Mal verwijderd — de boorgaten blijven staan");
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Mal verwijderen (boorgaten blijven)
                </Button>
              ) : (
                <div>
                  <Label className="text-xs">Laag</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={layerOf(selected)}
                    onChange={(e) => {
                      const lid = e.target.value;
                      setShapes((all) => all.map((s) => (s.id === selected.id ? { ...s, layer: lid } : s)));
                    }}
                  >
                    {layers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Preset naam..."
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={saveCurrentPageAsPreset}>
                  <Save className="w-4 h-4 mr-1" /> Pagina opslaan
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Save className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Presets</h2>
              <Badge variant="secondary" className="ml-auto">{presets.length}</Badge>
            </div>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="Preset naam..."
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={saveCurrentPageAsPreset} disabled={pageShapes.length === 0}>
                <Save className="w-4 h-4 mr-1" /> Pagina opslaan
              </Button>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="w-full mb-3"
              onClick={exportPresetsPdf}
              disabled={presets.length === 0 || exporting}
            >
              <Ruler className="w-4 h-4 mr-1" /> Maten downloaden (PDF)
            </Button>
            <div className="flex gap-2 mb-3">
              <Button size="sm" variant="outline" className="flex-1" onClick={backupPresets} disabled={presets.length === 0}>
                <Download className="w-4 h-4 mr-1" /> Back-up
              </Button>
              <label className="flex-1">
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) restorePresets(f);
                    e.currentTarget.value = "";
                  }}
                />
                <span className="inline-flex w-full h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium cursor-pointer hover:bg-accent">
                  <Upload className="w-4 h-4 mr-1" /> Herstellen
                </span>
              </label>
            </div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Zoek preset op naam..."
                value={presetQuery}
                onChange={(e) => setPresetQuery(e.target.value)}
              />
            </div>
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nog geen presets. Teken contouren en klik "Pagina opslaan" om alle contouren op deze pagina als preset te bewaren.
              </p>
            ) : filteredPresets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen presets gevonden voor "{presetQuery}".</p>
            ) : (
              <ul className="space-y-2 max-h-[240px] overflow-y-auto">
                {filteredPresets.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                    <Layers className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.shapes.length} contour{p.shapes.length === 1 ? "" : "en"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      disabled={!fileBytes}
                      onClick={() => applyPreset(p)}
                      title="Toevoegen aan pagina"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() =>
                        setEditPreset({ id: p.id, name: p.name, shapes: p.shapes.map((s) => ({ ...s })) })
                      }
                      title="Preset bewerken"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => deletePreset(p.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Cutcontouren</h2>
              <Badge variant="secondary" className="ml-auto">{shapes.length}</Badge>
            </div>
            {shapes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen snijlijnen toegevoegd.</p>
            ) : (
              <ul className="space-y-2 max-h-[300px] overflow-y-auto">
                {shapes.map((s, i) => {
                  const sz = pageSizesPt[s.page] ?? pageSize;
                  const wmm = s.w * (sz.width / PT_PER_MM);
                  const hmm = s.h * (sz.height / PT_PER_MM);
                  return (
                    <li
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
                        selectedId === s.id ? "bg-primary/10 ring-1 ring-primary" : "bg-muted"
                      }`}
                    >
                      {s.type === "rect" ? (
                        <Square className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-primary shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Contour {i + 1}</p>
                        <p className="text-xs text-muted-foreground">
                          Pagina {s.page + 1} · {wmm.toFixed(1)}×{hmm.toFixed(1)} mm ·{" "}
                          {layerById(layerOf(s))?.name}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShapes((all) => all.filter((x) => x.id !== s.id));
                          if (selectedId === s.id) setSelectedId(null);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </aside>
      </main>

      <Dialog open={!!editPreset} onOpenChange={(o) => !o && setEditPreset(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preset bewerken</DialogTitle>
          </DialogHeader>
          {editPreset && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Naam</Label>
                <Input
                  value={editPreset.name}
                  onChange={(e) => setEditPreset({ ...editPreset, name: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                X en Y zijn het middelpunt van de contour · X vanaf links, Y vanaf boven · alles in mm.
              </p>
              <div className="space-y-3">
                {editPreset.shapes.map((ps, i) => {
                  const update = (patch: Partial<PresetShape>) =>
                    setEditPreset({
                      ...editPreset,
                      shapes: editPreset.shapes.map((x, xi) => (xi === i ? { ...x, ...patch } : x)),
                    });
                  return (
                    <div key={i} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Contour {i + 1}</span>
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          value={ps.type}
                          onChange={(e) => update({ type: e.target.value as ShapeType })}
                        >
                          <option value="rect">Rechthoek</option>
                          <option value="ellipse">Ellips</option>
                        </select>
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          value={ps.layer || DEFAULT_CUT_LAYER_ID}
                          onChange={(e) => update({ layer: e.target.value })}
                        >
                          {layers.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 ml-auto"
                          onClick={() =>
                            setEditPreset({
                              ...editPreset,
                              shapes: editPreset.shapes.filter((_, xi) => xi !== i),
                            })
                          }
                          title="Contour verwijderen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">X (midden)</Label>
                          <MmInput
                            value={ps.xMm + ps.wMm / 2}
                            onCommit={(n) => update({ xMm: n - ps.wMm / 2 })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Y (midden)</Label>
                          <MmInput
                            value={ps.yMm + ps.hMm / 2}
                            onCommit={(n) => update({ yMm: n - ps.hMm / 2 })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">L (breedte)</Label>
                          <MmInput
                            value={ps.wMm}
                            onCommit={(n) => update({ wMm: Math.max(0, n), xMm: ps.xMm + (ps.wMm - Math.max(0, n)) / 2 })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">B (hoogte)</Label>
                          <MmInput
                            value={ps.hMm}
                            onCommit={(n) => update({ hMm: Math.max(0, n), yMm: ps.yMm + (ps.hMm - Math.max(0, n)) / 2 })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setEditPreset({
                    ...editPreset,
                    shapes: [
                      ...editPreset.shapes,
                      { type: "rect", layer: activeLayerId, xMm: 0, yMm: 0, wMm: 10, hMm: 10 },
                    ],
                  })
                }
              >
                <Plus className="w-4 h-4 mr-1" /> Contour toevoegen
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPreset(null)}>
              Annuleren
            </Button>
            <Button onClick={saveEditedPreset} disabled={savingPreset}>
              {savingPreset ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
