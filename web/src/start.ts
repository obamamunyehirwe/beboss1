import { createStart, createCsrfMiddleware } from "@tanstack/react-start";

import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Keep CSRF protection on server-function requests. Do not replace failures here
// with an HTML page: TanStack Start must serialize server-function errors through
// its RPC response format so React Query and route error boundaries can recover.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Attach the signed-in Supabase access token to server-function requests.
// Authentication and permission checks remain in requireSupabaseAuth/getAdminContext.
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [csrfMiddleware],
}));
