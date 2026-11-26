import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

const noStore = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

// h3 can turn a thrown SSR error into a generic HTTPError response. Keep the
// original exception in the server log so the root cause is actionable.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const url = new URL(request.url);
  console.error(
    `[BeBoss SSR] ${request.method} ${url.pathname}`,
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
  );

  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "Content-Type": "text/html; charset=utf-8", ...noStore },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// TanStack Start's server-entry API passes a request-options object as its
// second fetch argument. createServerEntry supplies the correct runtime
// adapter contract for the Cloudflare Workers runtime. Do not call handler.fetch with
// the raw (request, env, ctx) platform signature: that drops Start's request
// context and can make normal routes and server functions fail with HTTP 500.
export default createServerEntry({
  async fetch(request, opts) {
    const url = new URL(request.url);

    // Browsers commonly request /favicon.ico even when the document declares
    // a different icon. This project keeps the official icon as a PNG.
    if (url.pathname === "/favicon.ico") {
      return new Response(null, {
        status: 308,
        headers: {
          Location: "/beboss-app-icon.png",
          ...noStore,
        },
      });
    }

    try {
      const response = await handler.fetch(request, opts);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      console.error(`[BeBoss server] ${request.method} ${url.pathname}`, error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8", ...noStore },
      });
    }
  },
});
