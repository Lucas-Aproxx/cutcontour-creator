import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const CutContourEditor = lazy(() =>
  import("@/components/CutContourEditor").then((m) => ({ default: m.CutContourEditor })),
);

export const Route = createFileRoute("/_authenticated/app/editor")({
  component: EditorPage,
  head: () => ({
    meta: [
      { title: "Cutcontour Studio · Editor" },
      {
        name: "description",
        content:
          "Upload een PDF, plaats snijcontouren op de millimeter en download een CMYK PDF.",
      },
      { property: "og:title", content: "Cutcontour Studio · Editor" },
      {
        property: "og:description",
        content:
          "Upload een PDF, plaats snijcontouren op de millimeter en download een CMYK PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EditorPage() {
  return (
    <div className="w-full">
      <div className="max-w-[2200px] mx-auto px-3 sm:px-4 lg:px-6 py-3 flex items-center">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Terug naar overzicht
          </Link>
        </Button>
      </div>
      <ClientOnly fallback={<div className="p-6 text-sm text-muted-foreground">Editor laden…</div>}>
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Editor laden…</div>}>
          <CutContourEditor />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
