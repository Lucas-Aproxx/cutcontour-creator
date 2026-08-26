import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { migrateLocalData } from "@/lib/data";
import { Crop, PenTool, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Cutcontour Studio · Dashboard" },
      {
        name: "description",
        content:
          "Kies tussen de Cutcontour-editor en de CRM om verder te werken.",
      },
      { property: "og:title", content: "Cutcontour Studio · Dashboard" },
      {
        property: "og:description",
        content:
          "Kies tussen de Cutcontour-editor en de CRM om verder te werken.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Dashboard() {
  useEffect(() => {
    migrateLocalData()
      .then((r) => {
        if (r.presets || r.contacts) {
          toast.success(
            `Overgezet naar de database: ${r.presets} preset(s), ${r.contacts} contact(en)`,
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link to="/app/editor" className="group">
          <Card className="h-64 flex flex-col items-center justify-center gap-4 p-6 text-center transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <PenTool className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Cutcontour Editor</h2>
              <p className="text-muted-foreground mt-1 max-w-[260px]">
                Upload een PDF, plaats snijcontouren op de millimeter en exporteer volgens CMYK.
              </p>
            </div>
          </Card>
        </Link>

        <Link to="/app/crm" className="group">
          <Card className="h-64 flex flex-col items-center justify-center gap-4 p-6 text-center transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">CRM</h2>
              <p className="text-muted-foreground mt-1 max-w-[260px]">
                Beheer contacten, mappen, statussen en je eigen velden.
              </p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
