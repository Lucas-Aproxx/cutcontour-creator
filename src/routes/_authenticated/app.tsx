import { createFileRoute, useNavigate, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { CRM } from "@/components/CRM";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { migrateLocalData } from "@/lib/data";
import { LogOut } from "lucide-react";

const CutContourEditor = lazy(() =>
  import("@/components/CutContourEditor").then((m) => ({ default: m.CutContourEditor })),
);

export const Route = createFileRoute("/_authenticated/app")({
  component: AppPage,
  head: () => ({
    meta: [
      { title: "Cutcontour Studio · Editor & CRM" },
      {
        name: "description",
        content:
          "Plaats snijcontouren op millimeter-precisie, beheer presets en je CRM-contacten — alles opgeslagen in de cloud.",
      },
      { property: "og:title", content: "Cutcontour Studio · Editor & CRM" },
      {
        property: "og:description",
        content: "Snijcontouren op millimeter-precisie, presets en CRM in de cloud.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AppPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    migrateLocalData()
      .then((r) => {
        if (r.presets || r.contacts) {
          toast.success(
            `Overgezet naar de database: ${r.presets} preset(s), ${r.contacts} contact(en)`,
          );
          setReloadKey((k) => k + 1);
        }
      })
      .catch(() => {});
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <>
      <Tabs defaultValue="editor" className="w-full">
        <div className="border-b bg-background sticky top-0 z-10">
          <div className="max-w-[2200px] mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="editor">Cutcontour Editor</TabsTrigger>
              <TabsTrigger value="crm">CRM</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">{email}</span>
              <Button size="sm" variant="outline" onClick={signOut}>
                <LogOut className="w-3.5 h-3.5 mr-1" /> Uitloggen
              </Button>
            </div>
          </div>
        </div>
        <TabsContent value="editor" className="mt-0">
          <ClientOnly fallback={<div className="p-6 text-sm text-muted-foreground">Editor laden…</div>}>
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Editor laden…</div>}>
              <CutContourEditor key={`editor-${reloadKey}`} />
            </Suspense>
          </ClientOnly>
        </TabsContent>
        <TabsContent value="crm" className="mt-0">
          <div className="max-w-[2200px] mx-auto p-4">
            <CRM key={`crm-${reloadKey}`} />
          </div>
        </TabsContent>
      </Tabs>
      <Toaster position="bottom-right" />
    </>
  );
}
