import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/seed-user")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const email = process.env["SEED_USER_EMAIL"]!;
        const password = process.env["SEED_USER_PASSWORD"]!;
        let { error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (error) {
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
          const existing = list?.users.find((u) => u.email === email);
          if (existing) {
            const res = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              password,
              email_confirm: true,
            });
            error = res.error;
          }
        }
        return new Response(JSON.stringify({ ok: !error, error: error?.message ?? null }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
