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
const LEGACY_KEYS = ["cutcontour.presets.v1", "cutcontour.presets"];

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) return JSON.parse(raw);
    // Herstel eventuele oudere opslag
    for (const k of LEGACY_KEYS) {
      const old = localStorage.getItem(k);
      if (!old) continue;
      const parsed = JSON.parse(old);
      if (!Array.isArray(parsed)) continue;
      const migrated: Preset[] = parsed.map((p: any) => ({
        id: p.id ?? crypto.randomUUID(),
        name: p.name ?? "Preset",
        shapes: Array.isArray(p.shapes)
          ? p.shapes
          : [{ type: p.type ?? "rect", xMm: p.xMm ?? 0, yMm: p.yMm ?? 0, wMm: p.wMm ?? 0, hMm: p.hMm ?? 0 }],
      }));
      if (migrated.length) {
        localStorage.setItem(PRESETS_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
    return [];
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
      const imported: Preset[] = parsed.map((p: any) => ({
        id: crypto.randomUUID(),
        name: String(p.name ?? "Preset"),
        shapes: (p.shapes ?? []).map((s: any) => ({
          type: s.type === "ellipse" ? "ellipse" : "rect",
          xMm: Number(s.xMm) || 0,
          yMm: Number(s.yMm) || 0,
          wMm: Number(s.wMm) || 0,
          hMm: Number(s.hMm) || 0,
        })),
      }));
      const next = [...presets, ...imported];
      setPresets(next);
      savePresets(next);
      toast.success(`${imported.length} preset(s) hersteld`);
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
  const selPHmm = selSize ? selSize.height / PT_PER_MM : 0;
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
              <Download className="w-4 h-4 mr-2" />
              {exporting ? "Exporteren..." : "Download PDF"}
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
                <span className="ml-auto text-[10px] text-muted-foreground">X = midden vanaf links · Y = midden vanaf bovenkant</span>
              </div>
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
