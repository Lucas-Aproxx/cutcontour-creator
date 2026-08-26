import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const PdfCropper = lazy(() =>
  import("@/components/PdfCropper").then((m) => ({ default: m.PdfCropper })),
);

export const Route = createFileRoute("/_authenticated/app/crop")({
  component: CropPage,
  head: () => ({
    meta: [
      { title: "Cutcontour Studio · PDF bijsnijden" },
      {
        name: "description",
        content:
          "Snijd een PDF centraal bij naar een exact formaat in millimeter en download het resultaat.",
      },
      { property: "og:title", content: "Cutcontour Studio · PDF bijsnijden" },
      {
        property: "og:description",
        content:
          "Snijd een PDF centraal bij naar een exact formaat in millimeter en download het resultaat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CropPage() {
  return (
    <div className="w-full">
      <div className="max-w-[2200px] mx-auto px-3 sm:px-4 lg:px-6 py-3 flex items-center">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Terug naar overzicht
          </Link>
        </Button>
      </div>
      <ClientOnly fallback={<div className="p-6 text-sm text-muted-foreground">Laden…</div>}>
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Laden…</div>}>
          <PdfCropper />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
