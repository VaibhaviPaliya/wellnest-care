import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Deletes the caller's own Cloud sign-in. The client verifies a fresh emailed code first. */
export const deleteMyCloudAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role" as never, { _user_id: context.userId, _role: "admin" } as never);
    if (admin) throw new Error("Administrator accounts must be removed by another administrator.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error("Could not delete the account.");
    return { ok: true };
  });
