export type JsonInit = number | (ResponseInit & { status?: number });

export function json(body: unknown, init?: JsonInit): Response {
  if (typeof init === "number") {
    return new Response(JSON.stringify(body), {
      status: init,
      headers: { "content-type": "application/json" },
    });
  }

  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}
