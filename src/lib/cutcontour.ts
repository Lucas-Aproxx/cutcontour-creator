import { PDFDocument, PDFName, PDFRef, rgb } from "pdf-lib";

export type ShapeType = "rect" | "ellipse";

export interface CutShape {
  id: string;
  page: number; // 0-indexed
  type: ShapeType;
  // Normalized coordinates (0..1) relative to page width/height, origin top-left
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Add a Separation "Cutcontour" spot color layer with the given shapes and
 * return the modified PDF bytes. Strokes are 0.25pt magenta (0,1,0,0 CMYK).
 */
export async function addCutContour(
  pdfBytes: ArrayBuffer,
  shapes: CutShape[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  // Build shared tint transform function: t -> (0, t, 0, 0) in CMYK
  const tintFn = pdfDoc.context.obj({
    FunctionType: 2,
    Domain: [0, 1],
    Range: [0, 1, 0, 1, 0, 1, 0, 1],
    C0: [0, 0, 0, 0],
    C1: [0, 1, 0, 0],
    N: 1,
  });
  const tintFnRef = pdfDoc.context.register(tintFn);

  // Separation color space array [/Separation /Cutcontour /DeviceCMYK <function>]
  const sepArray = pdfDoc.context.obj([
    PDFName.of("Separation"),
    PDFName.of("Cutcontour"),
    PDFName.of("DeviceCMYK"),
    tintFnRef,
  ]);
  const sepRef = pdfDoc.context.register(sepArray);

  // Group shapes by page
  const byPage = new Map<number, CutShape[]>();
  for (const s of shapes) {
    if (!byPage.has(s.page)) byPage.set(s.page, []);
    byPage.get(s.page)!.push(s);
  }

  for (const [pageIdx, pageShapes] of byPage) {
    const page = pages[pageIdx];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();

    // Attach the spot color space to this page's Resources
    const resources = page.node.Resources() ?? pdfDoc.context.obj({});
    let csDict = resources.lookup(PDFName.of("ColorSpace"));
    if (!csDict) {
      csDict = pdfDoc.context.obj({});
      resources.set(PDFName.of("ColorSpace"), csDict);
    }
    // @ts-expect-error dict set
    csDict.set(PDFName.of("CS_Cutcontour"), sepRef);
    page.node.set(PDFName.of("Resources"), resources);

    // Build content stream ops
    const ops: string[] = ["q", "/CS_Cutcontour CS", "1 SCN", "0.25 w"];
    for (const s of pageShapes) {
      // Convert normalized top-left coords to PDF bottom-left points
      const x = s.x * pw;
      const yTop = s.y * ph;
      const w = s.w * pw;
      const h = s.h * ph;
      const y = ph - yTop - h;

      if (s.type === "rect") {
        ops.push(`${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re S`);
      } else {
        // Ellipse via 4 bezier curves
        const kappa = 0.5522847498;
        const cx = x + w / 2;
        const cy = y + h / 2;
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
    }
    ops.push("Q");

    // Wrap in an Optional Content Group so it's a real "Cutcontour" layer
    const ocgDict = pdfDoc.context.obj({
      Type: "OCG",
      Name: "Cutcontour",
      Intent: [PDFName.of("View"), PDFName.of("Design")],
    });
    const ocgRef = pdfDoc.context.register(ocgDict);

    // Register OCProperties on the catalog
    const catalog = pdfDoc.catalog;
    let ocProps = catalog.lookup(PDFName.of("OCProperties")) as any;
    if (!ocProps) {
      ocProps = pdfDoc.context.obj({
        OCGs: [ocgRef],
        D: pdfDoc.context.obj({
          Order: [ocgRef],
          ON: [ocgRef],
          OFF: [],
        }),
      });
      catalog.set(PDFName.of("OCProperties"), ocProps);
    } else {
      const ocgs = ocProps.lookup(PDFName.of("OCGs")) as any;
      ocgs?.push(ocgRef);
      const d = ocProps.lookup(PDFName.of("D")) as any;
      const order = d?.lookup(PDFName.of("Order")) as any;
      order?.push(ocgRef);
      const on = d?.lookup(PDFName.of("ON")) as any;
      on?.push(ocgRef);
    }

    // Register OCG as a Property on the page resources under name /OC_Cut
    let propsDict = resources.lookup(PDFName.of("Properties")) as any;
    if (!propsDict) {
      propsDict = pdfDoc.context.obj({});
      resources.set(PDFName.of("Properties"), propsDict);
    }
    propsDict.set(PDFName.of("OC_Cutcontour"), ocgRef);

    const wrapped = [
      "/OC /OC_Cutcontour BDC",
      ...ops,
      "EMC",
    ].join("\n");

    const stream = pdfDoc.context.stream(wrapped);
    const streamRef = pdfDoc.context.register(stream);

    // Append to page Contents
    const contents = page.node.get(PDFName.of("Contents"));
    if (!contents) {
      page.node.set(PDFName.of("Contents"), streamRef);
    } else if (contents instanceof PDFRef) {
      const arr = pdfDoc.context.obj([contents, streamRef]);
      page.node.set(PDFName.of("Contents"), arr);
    } else {
      // Array
      // @ts-expect-error push exists on PDFArray
      contents.push(streamRef);
    }
  }

  // Silence unused import
  void rgb;

  return await pdfDoc.save();
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}
