import { createFileRoute, Link } from "@tanstack/react-router";
import { CRM } from "@/components/CRM";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/crm")({
  component: CrmPage,
  head: () => ({
    meta: [
      { title: "Cutcontour Studio · CRM" },
      {
        name: "description",
        content:
          "Beheer contacten, mappen, statussen en je eigen velden in de CRM.",
      },
      { property: "og:title", content: "Cutcontour Studio · CRM" },
      {
        property: "og:description",
        content:
          "Beheer contacten, mappen, statussen en je eigen velden in de CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CrmPage() {
  return (
    <div className="w-full">
      <div className="max-w-[2200px] mx-auto px-4 py-3 flex items-center">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Terug naar overzicht
          </Link>
        </Button>
      </div>
      <div className="max-w-[2200px] mx-auto p-4 pt-0">
        <CRM />
      </div>
    </div>
  );
}
