import { createFileRoute } from "@tanstack/react-router";
import { CutContourEditor } from "@/components/CutContourEditor";
import { Toaster } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <>
      <CutContourEditor />
      <Toaster position="bottom-right" />
    </>
  );
}
