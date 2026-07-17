import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCutContour, type CutShape, type ShapeType } from "@/lib/cutcontour";
import { Trash2, Square, Circle, Upload, Download, ChevronLeft, ChevronRight, Layers, Save, Plus, Ruler } from "lucide-react";
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

interface PresetShape {
  type: ShapeType;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

interface Preset {
  id: string;
  name: string;
  shapes: PresetShape[];
}

const PRESETS_KEY = "cutcontour.presets.v2";

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function savePresets(p: Preset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(p));
}

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
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPresets(loadPresets());
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

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pdfDoc) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const { x, y } = getPos(e);
    setDrawing({ startX: x, startY: y, curX: x, curY: y });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = getPos(e);
    setDrawing({ ...drawing, curX: x, curY: y });
  };
  const onPointerUp = () => {
    if (!drawing) return;
    const x = Math.min(drawing.startX, drawing.curX);
    const y = Math.min(drawing.startY, drawing.curY);
    const w = Math.abs(drawing.curX - drawing.startX);
    const h = Math.abs(drawing.curY - drawing.startY);
    setDrawing(null);
    if (w < 0.005 || h < 0.005) return;
    const id = crypto.randomUUID();
    setShapes((s) => [...s, { id, page: pageIndex, type: tool, x, y, w, h }]);
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
    setShapes((all) =>
      all.map((s) => {
        if (s.id !== selected.id) return s;
        const size = pageSizesPt[s.page] ?? pageSize;
        const pW = size.width / PT_PER_MM;
        const pH = size.height / PT_PER_MM;
        // Current values in mm; for ellipse, X/Y represent the CENTER
        const isEllipse = s.type === "ellipse";
        const curWmm = s.w * pW;
        const curHmm = s.h * pH;
        const curXmm = s.x * pW + (isEllipse ? curWmm / 2 : 0);
        const curYmm = s.y * pH + (isEllipse ? curHmm / 2 : 0);
        const nextXmm = patch.xMm ?? curXmm;
        const nextYmm = patch.yMm ?? curYmm;
        const nextWmm = patch.wMm ?? curWmm;
        const nextHmm = patch.hMm ?? curHmm;
        // Convert back to top-left for storage
        const xTopMm = nextXmm - (isEllipse ? nextWmm / 2 : 0);
        const yTopMm = nextYmm - (isEllipse ? nextHmm / 2 : 0);
        return {
          ...s,
          x: Math.max(0, Math.min(1, xTopMm / pW)),
          y: Math.max(0, Math.min(1, yTopMm / pH)),
          w: Math.max(0, Math.min(1, nextWmm / pW)),
          h: Math.max(0, Math.min(1, nextHmm / pH)),
        };
      }),
    );
  };

  const handleExport = async () => {
    if (!fileBytes) return;
    setExporting(true);
    try {
      const bytes = await addCutContour(fileBytes.slice(0), shapes);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + "_cutcontour.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF geëxporteerd met Cutcontour-laag");
    } catch (err) {
      console.error(err);
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
    try {
      const outDoc = await PDFDocument.create();
      const SCALE = 2; // render resolution factor for crisp text
      for (let i = 0; i < pageCount; i++) {
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

          // shape outline
          ctx.strokeStyle = "#e11d48";
          ctx.beginPath();
          if (isEllipse) {
            ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          } else {
            ctx.rect(x, y, w, h);
          }
          ctx.stroke();

          // crosshair at reference point (center for ellipse, top-left for rect)
          const refX = isEllipse ? x + w / 2 : x;
          const refY = isEllipse ? y + h / 2 : y;
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(refX - 8 * SCALE, refY);
          ctx.lineTo(refX + 8 * SCALE, refY);
          ctx.moveTo(refX, refY - 8 * SCALE);
          ctx.lineTo(refX, refY + 8 * SCALE);
          ctx.stroke();
          ctx.lineWidth = 2;

          // values in mm
          const wmm = s.w * pWmm;
          const hmm = s.h * pHmm;
          const xmm = s.x * pWmm + (isEllipse ? wmm / 2 : 0);
          const ymm = s.y * pHmm + (isEllipse ? hmm / 2 : 0);
          const label = [
            `#${idx + 1} ${isEllipse ? "⌀" : "▭"}`,
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
          ctx.strokeStyle = "#e11d48";
          ctx.lineWidth = 1;
          ctx.fillRect(bx, by, boxW, boxH);
          ctx.strokeRect(bx, by, boxW, boxH);
          ctx.lineWidth = 2;

          // leader line to reference point
          ctx.strokeStyle = "#e11d48";
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

      const bytes = await outDoc.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName.replace(/\.pdf$/i, "") || "meetblad") + "_boorgaten.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Boorgat-meetblad geëxporteerd");
    } catch (err) {
      console.error(err);
      toast.error("Export mislukt: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const saveCurrentPageAsPreset = () => {
    if (pageShapes.length === 0) {
      toast.error("Geen contouren op deze pagina om op te slaan");
      return;
    }
    const name = newPresetName.trim() || `Preset ${presets.length + 1} (${pageShapes.length} contouren)`;
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      shapes: pageShapes.map((s) => {
        const size = pageSizesPt[s.page] ?? pageSize;
        const pW = size.width / PT_PER_MM;
        const pH = size.height / PT_PER_MM;
        return {
          type: s.type,
          xMm: s.x * pW,
          yMm: s.y * pH,
          wMm: s.w * pW,
          hMm: s.h * pH,
        };
      }),
    };
    const next = [...presets, preset];
    setPresets(next);
    savePresets(next);
    setNewPresetName("");
    toast.success(`Preset opgeslagen (${preset.shapes.length} contouren)`);
  };

  const applyPreset = (preset: Preset) => {
    const pW = pageSize.width / PT_PER_MM;
    const pH = pageSize.height / PT_PER_MM;
    const added: CutShape[] = preset.shapes.map((ps) => ({
      id: crypto.randomUUID(),
      page: pageIndex,
      type: ps.type,
      x: Math.max(0, Math.min(1, ps.xMm / pW)),
      y: Math.max(0, Math.min(1, ps.yMm / pH)),
      w: Math.max(0, Math.min(1, ps.wMm / pW)),
      h: Math.max(0, Math.min(1, ps.hMm / pH)),
    }));
    setShapes((s) => [...s, ...added]);
    setSelectedId(added[added.length - 1]?.id ?? null);
    toast.success(`Preset "${preset.name}" toegevoegd (${added.length} contouren)`);
  };

  const deletePreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    if (!window.confirm(`Preset "${p.name}" definitief verwijderen? Dit heeft geen invloed op de contouren die momenteel op de pagina staan.`)) {
      return;
    }
    const next = presets.filter((x) => x.id !== id);
    setPresets(next);
    savePresets(next);
    toast.success(`Preset "${p.name}" verwijderd`);
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
  const selIsEllipse = selected?.type === "ellipse";
  const selXmm = selXmmRaw + (selIsEllipse ? selWmm / 2 : 0);
  const selYmm = selYmmRaw + (selIsEllipse ? selHmm / 2 : 0);

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
              <Download className="w-4 h-4 mr-2" />
              {exporting ? "Exporteren..." : "Download PDF"}
            </Button>
          </div>
        </div>
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
                <div className="flex items-center gap-2">
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
                  className="absolute inset-0 cursor-crosshair"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  {pageShapes.map((s) => (
                    <div
                      key={s.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(s.id);
                      }}
                      className="absolute border-2"
                      style={{
                        left: s.x * 100 + "%",
                        top: s.y * 100 + "%",
                        width: s.w * 100 + "%",
                        height: s.h * 100 + "%",
                        borderColor: selectedId === s.id ? "oklch(0.7 0.3 30)" : "oklch(0.65 0.28 350)",
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
                        borderColor: "oklch(0.65 0.28 350)",
                        borderRadius: tool === "ellipse" ? "50%" : 0,
                      }}
                    />
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Teken op de pagina of gebruik een preset. Klik een contour om exacte afmetingen in mm in te stellen.
              </p>
            </Card>
          )}
        </section>

        <aside className="space-y-4">
          {selected && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                {selected.type === "rect" ? <Square className="w-4 h-4 text-primary" /> : <Circle className="w-4 h-4 text-primary" />}
                <h2 className="font-semibold">Afmetingen (mm)</h2>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {selIsEllipse ? "X/Y = midden" : "X/Y = linksboven"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">X {selIsEllipse ? "(midden)" : ""}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={Number(selXmm.toFixed(2))}
                    onChange={(e) => updateSelectedMm({ xMm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Y {selIsEllipse ? "(midden)" : ""}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={Number(selYmm.toFixed(2))}
                    onChange={(e) => updateSelectedMm({ yMm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">L (breedte)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={Number(selWmm.toFixed(2))}
                    onChange={(e) => updateSelectedMm({ wMm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">B (hoogte)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={Number(selHmm.toFixed(2))}
                    onChange={(e) => updateSelectedMm({ hMm: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
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
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nog geen presets. Teken contouren en klik "Pagina opslaan" om alle contouren op deze pagina als preset te bewaren.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[240px] overflow-y-auto">
                {presets.map((p) => (
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
                          Pagina {s.page + 1} · {wmm.toFixed(1)}×{hmm.toFixed(1)} mm
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
    </div>
  );
}
