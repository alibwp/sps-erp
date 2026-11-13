import type { NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend";

// The browser calls the API on this site's own address and this route passes
// each call on to the backend. Same-origin calls need no CORS, and the
// backend's refresh cookie becomes a cookie of this site, so a sign-in
// survives a reload.

// Headers that describe one connection, not the request, plus Host (the
// backend's own) and Accept-Encoding (fetch decompresses the answer itself).
const REQUEST_HEADERS_DROPPED = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "content-length",
  "accept-encoding",
]);

const RESPONSE_HEADERS_DROPPED = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "trailer",
  "content-encoding",
  "content-length",
  "set-cookie",
]);

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, { params }: Context): Promise<Response> {
  const { path } = await params;
  const target = new URL(`${backendUrl()}/api/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!REQUEST_HEADERS_DROPPED.has(key)) headers.set(key, value);
  });
  // The backend answers refresh and logout only for a frontend origin; pass
  // on the one the browser sent.
  const origin = request.headers.get("origin");
  if (origin) headers.set("origin", origin);
  headers.set("x-forwarded-host", request.nextUrl.host);
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: { code: "service_unavailable", message: "The server cannot be reached. Please try again later." } },
      { status: 502 },
    );
  }

  const answer = new Headers();
  response.headers.forEach((value, key) => {
    if (!RESPONSE_HEADERS_DROPPED.has(key)) answer.set(key, value);
  });
  for (const cookie of response.headers.getSetCookie()) answer.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: answer });
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
