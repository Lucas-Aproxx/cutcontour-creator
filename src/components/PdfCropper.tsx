import { useCallback, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Crop, Download, Upload } from "lucide-react";

const PT_PER_MM = 72 / 25.4;
const toMm = (pt: number) => pt / PT_PER_MM;
const toPt = (mm: number) => mm * PT_PER_MM;
const fmt = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

interface PageInfo {
  index: number;
  widthMm: number;
  heightMm: number;
}

/** Vrij typbaar mm-veld. */
function MmInput({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  id?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      id={id}
      inputMode="decimal"
      value={draft ?? (value ? fmt(value) : "")}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value.replace(",", "."));
        if (!Number.isNaN(n)) onChange(n);
      }}
      onBlur={() => setDraft(null)}
      placeholder="mm"
    />
  );
}

export function PdfCropper() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [targetW, setTargetW] = useState(0);
  const [targetH, setTargetH] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const onFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const info = doc.getPages().map((p, i) => {
        const { width, height } = p.getSize();
        return { index: i, widthMm: toMm(width), heightMm: toMm(height) };
      });
      if (info.length === 0) throw new Error("Geen pagina's gevonden");
      setBytes(buf);
      setPages(info);
      setFileName(file.name);
      setTargetW(Math.round(info[0].widthMm * 100) / 100);
      setTargetH(Math.round(info[0].heightMm * 100) / 100);
      toast.success(`PDF geladen: ${info.length} pagina('s)`);
    } catch (e) {
      toast.error("Kon deze PDF niet lezen");
      console.error(e);
    }
  }, []);

  const crop = async () => {
    if (!bytes) return;
    if (!(targetW > 0) || !(targetH > 0)) {
      toast.error("Geef een geldige breedte en hoogte in mm");
      return;
    }
    setBusy(true);
    setProgress(5);
    setStatus("PDF inlezen…");
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const docPages = doc.getPages();
      const wPt = toPt(targetW);
      const hPt = toPt(targetH);

      for (let i = 0; i < docPages.length; i++) {
        const page = docPages[i];
        setStatus(`Pagina ${i + 1} van ${docPages.length} centraal bijsnijden…`);
        setProgress(10 + Math.round(((i + 1) / docPages.length) * 70));

        const mb = page.getMediaBox();
        const cx = mb.x + mb.width / 2;
        const cy = mb.y + mb.height / 2;
        const x = cx - wPt / 2;
        const y = cy - hPt / 2;

        page.setMediaBox(x, y, wPt, hPt);
        page.setCropBox(x, y, wPt, hPt);
        page.setBleedBox(x, y, wPt, hPt);
        page.setTrimBox(x, y, wPt, hPt);
        try {
          page.setArtBox(x, y, wPt, hPt);
        } catch {
          /* optioneel */
        }
      }

      setStatus("Bestand opbouwen…");
      setProgress(90);
      const out = await doc.save();
      const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, "") + `-${fmt(targetW)}x${fmt(targetH)}mm.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(100);
      setStatus("Klaar — bijgesneden PDF gedownload");
      toast.success("Bijgesneden PDF gedownload");
    } catch (e) {
      console.error(e);
      toast.error("Bijsnijden mislukt");
      setStatus("Mislukt");
    } finally {
      setBusy(false);
    }
  };

  const first = pages[0];
  const trimW = first ? (first.widthMm - targetW) / 2 : 0;
  const trimH = first ? (first.heightMm - targetH) / 2 : 0;

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PDF bijsnijden</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Geef het gewenste formaat in millimeter op. Het bestand wordt aan alle zijden gelijk
          bijgesneden zodat het ontwerp centraal blijft staan.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={() => fileRef.current?.click()} variant="outline">
            <Upload className="w-4 h-4 mr-1" /> PDF uploaden
          </Button>
          {fileName && <span className="text-sm text-muted-foreground truncate">{fileName}</span>}
        </div>

        {first && (
          <p className="text-sm">
            Huidig formaat pagina 1:{" "}
            <strong>
              {fmt(first.widthMm)} × {fmt(first.heightMm)} mm
            </strong>{" "}
            <span className="text-muted-foreground">({pages.length} pagina('s))</span>
          </p>
        )}
      </Card>

      {first && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="crop-w">Breedte (mm)</Label>
              <MmInput id="crop-w" value={targetW} onChange={setTargetW} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crop-h">Hoogte (mm)</Label>
              <MmInput id="crop-h" value={targetH} onChange={setTargetH} />
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Weg aan links/rechts: <strong>{fmt(Math.max(trimW, 0))} mm</strong> per zijde · weg aan
              boven/onder: <strong>{fmt(Math.max(trimH, 0))} mm</strong> per zijde.
            </p>
            {(trimW < 0 || trimH < 0) && (
              <p className="text-destructive">
                Let op: het gevraagde formaat is groter dan het bestand — de pagina wordt dan
                uitgebreid met leeg gebied in plaats van bijgesneden.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={crop} disabled={busy}>
              <Crop className="w-4 h-4 mr-1" /> Bijsnijden en downloaden
            </Button>
            {!busy && progress === 100 && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> {status}
              </span>
            )}
          </div>

          {(busy || (progress > 0 && progress < 100)) && (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">{status}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
