import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { CRM } from "@/components/CRM";
import { Toaster } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CutContourEditor = lazy(() =>
  import("@/components/CutContourEditor").then((m) => ({ default: m.CutContourEditor })),
);

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <>
      <Tabs defaultValue="editor" className="w-full">
        <div className="border-b bg-background sticky top-0 z-10">
          <div className="max-w-[1600px] mx-auto px-4 py-2">
            <TabsList>
              <TabsTrigger value="editor">Cutcontour Editor</TabsTrigger>
              <TabsTrigger value="crm">CRM</TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="editor" className="mt-0">
          <CutContourEditor />
        </TabsContent>
        <TabsContent value="crm" className="mt-0">
          <div className="max-w-[1600px] mx-auto p-4">
            <CRM />
          </div>
        </TabsContent>
      </Tabs>
      <Toaster position="bottom-right" />
    </>
  );
}
