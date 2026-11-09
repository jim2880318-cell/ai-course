import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import app from "./dist/server/index.js";

const username = process.env.SITE_USERNAME?.trim();
const password = process.env.SITE_PASSWORD;
if (!username || !password || password.length < 16) {
  throw new Error("Set SITE_USERNAME and a unique SITE_PASSWORD of at least 16 characters before starting.");
}
if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set; AI generation endpoints will return a configuration error.");
}

function equalSecret(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function authorized(request) {
  const header = request.headers.authorization || "";
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header);
  if (!match) return false;
  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  return separator >= 0
    && equalSecret(decoded.slice(0, separator), username)
    && equalSecret(decoded.slice(separator + 1), password);
}

async function readBody(request, maxBytes = 1_000_000) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const port = Number(process.env.PORT || (process.env.SCF_RUNTIME_API ? 9000 : 3000));
const server = createServer(async (incoming, outgoing) => {
  if (!authorized(incoming)) {
    outgoing.writeHead(401, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "www-authenticate": 'Basic realm="CourseMaster", charset="UTF-8"',
    });
    outgoing.end("Authentication required");
    return;
  }

  try {
    const forwardedProto = String(incoming.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const forwardedHost = String(incoming.headers["x-forwarded-host"] || incoming.headers.host || "localhost").split(",")[0].trim();
    const url = new URL(incoming.url || "/", `${forwardedProto}://${forwardedHost}`);
    const headers = new Headers(incoming.headers);
    // Never trust this header from the client. Set it only after verifying Basic Auth above.
    headers.delete("cf-access-authenticated-user-email");
    headers.set("cf-access-authenticated-user-email", username);
    const body = ["GET", "HEAD"].includes(incoming.method || "GET") ? undefined : await readBody(incoming);
    const request = new Request(url, {
      method: incoming.method,
      headers,
      ...(body ? { body } : {}),
    });
    const response = await app.fetch(request, process.env);
    const responseHeaders = Object.fromEntries(response.headers.entries());
    outgoing.writeHead(response.status, responseHeaders);
    if (incoming.method === "HEAD" || !response.body) {
      outgoing.end();
    } else {
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    }
  } catch (error) {
    const tooLarge = error?.message === "REQUEST_TOO_LARGE";
    outgoing.writeHead(tooLarge ? 413 : 500, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    outgoing.end(JSON.stringify({ message: tooLarge ? "请求内容过大。" : "服务暂时不可用，请稍后重试。" }));
    if (!tooLarge) console.error("Request handling failed", error);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AI course workbench listening on 0.0.0.0:${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
