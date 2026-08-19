import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
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

function AppLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-[2200px] mx-auto px-3 sm:px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/app" className="font-semibold tracking-tight hover:opacity-80 transition-opacity">
            Cutcontour Studio
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
            <Button size="sm" variant="outline" onClick={signOut}>
              <LogOut className="w-3.5 h-3.5 mr-1" /> Uitloggen
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}
