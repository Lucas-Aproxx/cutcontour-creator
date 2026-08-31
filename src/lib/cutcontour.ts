import { PDFDocument, PDFName, PDFRef } from "pdf-lib";

export type ShapeType = "rect" | "ellipse";

export interface CutShape {
  id: string;
  page: number; // 0-indexed
  type: ShapeType;
  /** Id van de laag waarin deze vorm hoort (zie CutLayer). */
  layer?: string;
  /**
   * Hulpvorm ("mal"): alleen zichtbaar in de editor om boorgaten op te
   * positioneren. Wordt NIET meegeëxporteerd naar de PDF.
   */
  guide?: boolean;
  /** Id van de mal waar deze vorm aan vasthangt (beweegt samen mee). */
  group?: string;
  /** Rotatie van de mal in graden (0..360), enkel op de mal zelf bewaard. */
  rot?: number;
  // Normalized coordinates (0..1) relative to page width/height, origin top-left
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Geeft de rotatie terug die op een vorm van toepassing is: de rotatie van de
 * mal waar de vorm aan vasthangt (of van de mal zelf). Centrum in genormaliseerde
 * coördinaten.
 */
export function rotationInfo(
  s: CutShape,
  all: CutShape[],
): { deg: number; gx: number; gy: number } | null {
  const g = s.guide ? s : s.group ? all.find((x) => x.guide && x.group === s.group) : undefined;
  if (!g || !g.rot) return null;
  return { deg: g.rot, gx: g.x + g.w / 2, gy: g.y + g.h / 2 };
}

/** Roteert een punt (kloksgewijs in een y-omlaag ruimte) rond een centrum. */
export function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c };
}


export interface CutColor {
  /** Naam van de steunkleur (separation), bv. "Cutcontour" */
  name: string;
  /** CMYK-waarde bij 100% tint, elk 0..1 */
  cmyk: [number, number, number, number];
}

/** Een aparte laag (OCG) met eigen steunkleur. */
export interface CutLayer {
  id: string;
  /** Laagnaam = naam van de steunkleur, bv. "Cutcontour" */
  name: string;
  cmyk: [number, number, number, number];
}

/** Publi-FDM norm: steunkleur "Cutcontour" in 100% magenta (0/100/0/0). */
export const PUBLI_FDM_CUT_COLOR: CutColor = {
  name: "Cutcontour",
  cmyk: [0, 1, 0, 0],
};

export const DEFAULT_CUT_LAYER_ID = "cutcontour";

/** Standaardlagen volgens Publi-FDM / reclameonline.be richtlijnen. */
export const DEFAULT_CUT_LAYERS: CutLayer[] = [
  { id: DEFAULT_CUT_LAYER_ID, name: "Cutcontour", cmyk: [0, 1, 0, 0] },
  { id: "boorgaten", name: "Boorgaten", cmyk: [1, 0, 0, 0] },
];

/** Beschikbare steunkleuren voor nieuwe lagen (100% van één kanaal). */
export const CUT_LAYER_COLORS: { key: string; label: string; cmyk: [number, number, number, number]; preview: string }[] = [
  { key: "magenta", label: "100% magenta (0/100/0/0)", cmyk: [0, 1, 0, 0], preview: "#e6007e" },
  { key: "cyan", label: "100% cyaan (100/0/0/0)", cmyk: [1, 0, 0, 0], preview: "#009ee3" },
  { key: "yellow", label: "100% geel (0/0/100/0)", cmyk: [0, 0, 1, 0], preview: "#ffed00" },
  { key: "black", label: "100% zwart (0/0/0/100)", cmyk: [0, 0, 0, 1], preview: "#1a1a1a" },
];

export function layerPreviewColor(cmyk: [number, number, number, number]): string {
  const match = CUT_LAYER_COLORS.find((c) => c.cmyk.every((v, i) => v === cmyk[i]));
  return match?.preview ?? "#e6007e";
}

function sanitizeName(name: string): string {
  return (name || "Cutcontour").replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * Voegt per laag een aparte OCG-laag met eigen steunkleur (Separation) toe en
 * geeft de gewijzigde PDF-bytes terug. Lijndikte 0,25pt. De laag "Cutcontour"
 * gebruikt volgens Publi-FDM 100% magenta (CMYK 0/100/0/0).
 */
export async function addCutContour(
  pdfBytes: ArrayBuffer,
  shapes: CutShape[],
  layers: CutLayer[] = DEFAULT_CUT_LAYERS,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const catalog = pdfDoc.catalog;

  // Mal-hulpvormen worden nooit geëxporteerd, maar hun rotatie wel toegepast
  // op de boorgaten die eraan vasthangen.
  const allShapes = shapes;
  shapes = shapes.filter((s) => !s.guide);

  const usedLayerIds = new Set(shapes.map((s) => s.layer || DEFAULT_CUT_LAYER_ID));
  const activeLayers = layers.filter((l) => usedLayerIds.has(l.id));
  if (activeLayers.length === 0) return await pdfDoc.save();


  // Per laag: separation colorspace + OCG (één keer per document)
  const sepRefs = new Map<string, PDFRef>();
  const ocgRefs = new Map<string, PDFRef>();
  const keys = new Map<string, string>();

  for (const layer of activeLayers) {
    const tintFn = pdfDoc.context.obj({
      FunctionType: 2,
      Domain: [0, 1],
      Range: [0, 1, 0, 1, 0, 1, 0, 1],
      C0: [0, 0, 0, 0],
      C1: [...layer.cmyk],
      N: 1,
    });
    const tintFnRef = pdfDoc.context.register(tintFn);
    const sepArray = pdfDoc.context.obj([
      PDFName.of("Separation"),
      PDFName.of(layer.name),
      PDFName.of("DeviceCMYK"),
      tintFnRef,
    ]);
    sepRefs.set(layer.id, pdfDoc.context.register(sepArray));

    const ocgDict = pdfDoc.context.obj({
      Type: "OCG",
      Name: layer.name,
      Intent: [PDFName.of("View"), PDFName.of("Design")],
    });
    ocgRefs.set(layer.id, pdfDoc.context.register(ocgDict));
    keys.set(layer.id, sanitizeName(layer.name));
  }

  // OCProperties op de catalog registreren
  const allOcgs = activeLayers.map((l) => ocgRefs.get(l.id)!);
  let ocProps = catalog.lookup(PDFName.of("OCProperties")) as any;
  if (!ocProps) {
    catalog.set(
      PDFName.of("OCProperties"),
      pdfDoc.context.obj({
        OCGs: allOcgs,
        D: pdfDoc.context.obj({ Order: allOcgs, ON: allOcgs, OFF: [] }),
      }),
    );
  } else {
    const ocgs = ocProps.lookup(PDFName.of("OCGs")) as any;
    const d = ocProps.lookup(PDFName.of("D")) as any;
    const order = d?.lookup(PDFName.of("Order")) as any;
    const on = d?.lookup(PDFName.of("ON")) as any;
    for (const ref of allOcgs) {
      ocgs?.push(ref);
      order?.push(ref);
      on?.push(ref);
    }
  }

  // Groepeer vormen per pagina
  const byPage = new Map<number, CutShape[]>();
  for (const s of shapes) {
    if (!byPage.has(s.page)) byPage.set(s.page, []);
    byPage.get(s.page)!.push(s);
  }

  for (const [pageIdx, pageShapes] of byPage) {
    const page = pages[pageIdx];
    if (!page) continue;

    // De editor toont de pagina volgens de CropBox (zoals viewers doen) en met
    // de rotatie van de pagina. Exporteren moet dus in exact diezelfde ruimte
    // gebeuren, anders staan de contouren verschoven bij bestanden met een
    // CropBox-offset (bv. eerder bijgesneden PDF's) of met rotatie.
    let box: { x: number; y: number; width: number; height: number };
    try {
      box = page.getCropBox();
    } catch {
      box = page.getMediaBox();
    }
    if (!box || !(box.width > 0) || !(box.height > 0)) box = page.getMediaBox();

    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    // Zichtbare (viewport) afmetingen zoals in de editor
    const pw = swap ? box.height : box.width;
    const ph = swap ? box.width : box.height;

    // Exacte inverse van de PDF.js-viewporttransformatie. De editor bewaart
    // coördinaten vanaf linksboven; deze matrix zet die rechtstreeks om naar
    // PDF user space. Dit voorkomt dat boorgaten bij geroteerde pagina's na
    // export verschuiven of gespiegeld terechtkomen.
    const cm =
      rot === 90
        ? `0 1 1 0 ${fmt(box.x)} ${fmt(box.y)} cm`
        : rot === 180
          ? `-1 0 0 1 ${fmt(box.x + box.width)} ${fmt(box.y)} cm`
          : rot === 270
            ? `0 -1 -1 0 ${fmt(box.x + box.width)} ${fmt(box.y + box.height)} cm`
            : `1 0 0 -1 ${fmt(box.x)} ${fmt(box.y + box.height)} cm`;

    const resources = page.node.Resources() ?? pdfDoc.context.obj({});
    let csDict = resources.lookup(PDFName.of("ColorSpace")) as any;
    if (!csDict) {
      csDict = pdfDoc.context.obj({});
      resources.set(PDFName.of("ColorSpace"), csDict);
    }
    let propsDict = resources.lookup(PDFName.of("Properties")) as any;
    if (!propsDict) {
      propsDict = pdfDoc.context.obj({});
      resources.set(PDFName.of("Properties"), propsDict);
    }

    const streams: PDFRef[] = [];

    for (const layer of activeLayers) {
      const layerShapes = pageShapes.filter(
        (s) => (s.layer || DEFAULT_CUT_LAYER_ID) === layer.id,
      );
      if (layerShapes.length === 0) continue;
      const key = keys.get(layer.id)!;
      csDict.set(PDFName.of(`CS_${key}`), sepRefs.get(layer.id)!);
      propsDict.set(PDFName.of(`OC_${key}`), ocgRefs.get(layer.id)!);

      const ops: string[] = ["q", cm, `/CS_${key} CS`, "1 SCN", "0.25 w"];
      for (const s of layerShapes) {
        const x = s.x * pw;
        const yTop = s.y * ph;
        const w = s.w * pw;
        const h = s.h * ph;

        // Rotatie van de mal waarop dit boorgat staat.
        const rotInfo = rotationInfo(s, allShapes);
        if (rotInfo) {
          const a = (rotInfo.deg * Math.PI) / 180;
          const c = Math.cos(a);
          const sn = Math.sin(a);
          const gx = rotInfo.gx * pw;
          const gy = rotInfo.gy * ph;
          const e = gx - c * gx + sn * gy;
          const f = gy - sn * gx - c * gy;
          ops.push("q", `${fmt(c)} ${fmt(sn)} ${fmt(-sn)} ${fmt(c)} ${fmt(e)} ${fmt(f)} cm`);
        }




        if (s.type === "rect") {
          ops.push(`${fmt(x)} ${fmt(yTop)} ${fmt(w)} ${fmt(h)} re S`);
        } else {
          const kappa = 0.5522847498;
          const cx = x + w / 2;
          const cy = yTop + h / 2;
          const rx = w / 2;
          const ry = h / 2;
          const ox = rx * kappa;
          const oy = ry * kappa;
          ops.push(`${fmt(cx - rx)} ${fmt(cy)} m`);
          ops.push(
            `${fmt(cx - rx)} ${fmt(cy + oy)} ${fmt(cx - ox)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)} c`,
          );
          ops.push(
            `${fmt(cx + ox)} ${fmt(cy + ry)} ${fmt(cx + rx)} ${fmt(cy + oy)} ${fmt(cx + rx)} ${fmt(cy)} c`,
          );
          ops.push(
            `${fmt(cx + rx)} ${fmt(cy - oy)} ${fmt(cx + ox)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)} c`,
          );
          ops.push(
            `${fmt(cx - ox)} ${fmt(cy - ry)} ${fmt(cx - rx)} ${fmt(cy - oy)} ${fmt(cx - rx)} ${fmt(cy)} c`,
          );
          ops.push("S");
        }
        if (rotInfo) ops.push("Q");
      }
      ops.push("Q");

      const wrapped = [`/OC /OC_${key} BDC`, ...ops, "EMC"].join("\n");
      streams.push(pdfDoc.context.register(pdfDoc.context.stream(wrapped)));
    }

    page.node.set(PDFName.of("Resources"), resources);

    const contents = page.node.get(PDFName.of("Contents"));
    if (!contents) {
      page.node.set(PDFName.of("Contents"), pdfDoc.context.obj(streams));
    } else if (contents instanceof PDFRef) {
      page.node.set(PDFName.of("Contents"), pdfDoc.context.obj([contents, ...streams]));
    } else {
      for (const ref of streams) {
        // @ts-expect-error push exists on PDFArray
        contents.push(ref);
      }
    }
  }

  // Mark the document as CMYK print-ready via a DeviceCMYK OutputIntent
  // (CGATS TR 001 / SWOP) — signals CMYK afdruknorm to prepress workflows.
  try {
    const outputIntent = pdfDoc.context.obj({
      Type: PDFName.of("OutputIntent"),
      S: PDFName.of("GTS_PDFX"),
      OutputConditionIdentifier: "CGATS TR 001",
      RegistryName: "http://www.color.org",
      Info: "CGATS TR 001 (SWOP)",
    });
    const oiRef = pdfDoc.context.register(outputIntent);
    const existing = catalog.lookup(PDFName.of("OutputIntents")) as any;
    if (existing && typeof existing.push === "function") {
      existing.push(oiRef);
    } else {
      catalog.set(PDFName.of("OutputIntents"), pdfDoc.context.obj([oiRef]));
    }
  } catch {
    // non-fatal
  }

  return await pdfDoc.save();
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}
