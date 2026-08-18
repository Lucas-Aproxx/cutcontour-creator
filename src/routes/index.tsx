import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Cutcontour Studio · Snijcontouren op maat" },
      {
        name: "description",
        content:
          "Plaats snijcontouren op millimeter-precisie op je PDF, exporteer volgens CMYK-afdruknorm en beheer presets en contacten in de cloud.",
      },
      { property: "og:title", content: "Cutcontour Studio · Snijcontouren op maat" },
      {
        property: "og:description",
        content:
          "Snijcontouren op millimeter-precisie, CMYK-export, presets en CRM — veilig in de cloud.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="max-w-xl text-center space-y-5">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Cutcontour Studio</h1>
        <p className="text-muted-foreground">
          Plaats snijcontouren op millimeter-precisie, exporteer volgens CMYK-afdruknorm en beheer je
          presets en contacten. Alles wordt bewaard in de cloud, op elk toestel beschikbaar.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Inloggen</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
