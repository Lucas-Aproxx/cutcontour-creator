import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { addCutContour, type CutShape, type ShapeType } from "@/lib/cutcontour";
import { Trash2, Square, Circle, Upload, Download, ChevronLeft, ChevronRight, Layers } from "lucide-react";

// pdf.js
// @ts-expect-error no types for legacy build worker path
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
// @ts-expect-error worker url
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PageDims {
  width: number;
  height: number;
}

export function CutContourEditor() {
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pageDims, setPageDims] = useState<PageDims>({ width: 0, height: 0 });
  const [shapes, setShapes] = useState<CutShape[]>([]);
  const [tool, setTool] = useState<ShapeType>("rect");
  const [drawing, setDrawing] = useState<null | { startX: number; startY: number; curX: number; curY: number }>(null);
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const onFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Alleen PDF-bestanden zijn toegestaan");
      return;
    }
    const buf = await file.arrayBuffer();
    setFileBytes(buf);
    setFileName(file.name);
    setShapes([]);
    setPageIndex(0);
    // Clone for pdf.js (it detaches the buffer)
    const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
    setPdfDoc(doc);
    setPageCount(doc.numPages);
  }, []);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      // Fit to ~900px wide
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
    setShapes((s) => [
      ...s,
      { id: crypto.randomUUID(), page: pageIndex, type: tool, x, y, w, h },
    ]);
  };

  const pageShapes = shapes.filter((s) => s.page === pageIndex);

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

  const rectPreview = drawing
    ? {
        left: Math.min(drawing.startX, drawing.curX) * 100 + "%",
        top: Math.min(drawing.startY, drawing.curY) * 100 + "%",
        width: Math.abs(drawing.curX - drawing.startX) * 100 + "%",
        height: Math.abs(drawing.curY - drawing.startY) * 100 + "%",
      }
    : null;

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

      <main className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
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
              <div className="flex items-center justify-between mb-3">
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
                      className="absolute border-2 pointer-events-none"
                      style={{
                        left: s.x * 100 + "%",
                        top: s.y * 100 + "%",
                        width: s.w * 100 + "%",
                        height: s.h * 100 + "%",
                        borderColor: "oklch(0.65 0.28 350)",
                        borderRadius: s.type === "ellipse" ? "50%" : 0,
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
                Sleep op de pagina om een snijlijn te tekenen. Snijlijnen worden geëxporteerd als spot-kleur "Cutcontour" (CMYK 0/100/0/0) in een aparte laag.
              </p>
            </Card>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Cutcontouren</h2>
              <Badge variant="secondary" className="ml-auto">
                {shapes.length}
              </Badge>
            </div>
            {shapes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nog geen snijlijnen toegevoegd.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[500px] overflow-y-auto">
                {shapes.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted"
                  >
                    {s.type === "rect" ? (
                      <Square className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-primary shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Contour {i + 1}</p>
                      <p className="text-xs text-muted-foreground">
                        Pagina {s.page + 1} · {Math.round(s.w * 100)}×{Math.round(s.h * 100)}%
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() =>
                        setShapes((all) => all.filter((x) => x.id !== s.id))
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4 text-sm space-y-2">
            <h3 className="font-semibold">Afdruknorm</h3>
            <p className="text-muted-foreground">
              De export bevat een aparte laag met de naam <strong>Cutcontour</strong> als spot-kleur op basis van CMYK 0/100/0/0. Zo herkennen drukkerij en snijplotter de snijlijn automatisch.
            </p>
          </Card>
        </aside>
      </main>
    </div>
  );
}
