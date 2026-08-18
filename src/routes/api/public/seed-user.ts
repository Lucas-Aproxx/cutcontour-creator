import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/seed-user")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const email = process.env["SEED_USER_EMAIL"]!;
        const password = process.env["SEED_USER_PASSWORD"]!;
        const { error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        return new Response(JSON.stringify({ ok: !error, error: error?.message ?? null }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
