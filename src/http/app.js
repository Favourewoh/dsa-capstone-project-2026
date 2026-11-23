import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRouter } from "./router.js";
import { DomainError } from "../domain/errors.js";
import { registerApiRoutes } from "./routes/apiRoutes.js";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

export function sendError(res, statusCode, code, message) {
  if (res.headersSent) {
    return;
  }
  const body = JSON.stringify({
    error: {
      code: String(code),
      message: String(message),
    },
  });
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

export function sendJson(res, statusCode, payload) {
  if (res.headersSent) {
    return;
  }
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

export function readJsonBody(req, maxBytes = 1_048_576) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;

    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new DomainError("PAYLOAD_TOO_LARGE", "Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new DomainError("BAD_JSON", "Invalid JSON in request body."));
      }
    });

    req.on("error", (err) => {
      reject(err);
    });
  });
}

function resolveContainedPath(rootDir, urlPathname) {
  const resolvedRoot = path.resolve(rootDir);
  let decoded;
  try {
    decoded = decodeURIComponent(urlPathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0") || decoded.includes("\\")) {
    return null;
  }

  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolvedTarget = path.resolve(resolvedRoot, relative);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(prefix)) {
    return null;
  }

  return resolvedTarget;
}

function serveStaticFile(res, publicDir, pathname) {
  const safePath = resolveContainedPath(publicDir, pathname);
  if (!safePath) {
    sendError(res, 403, "FORBIDDEN_PATH", "Path traversal outside public directory is not allowed.");
    return true;
  }

  let stat;
  try {
    stat = fs.statSync(safePath);
  } catch {
    return false;
  }

  let fileToServe = safePath;
  if (stat.isDirectory()) {
    fileToServe = path.join(safePath, "index.html");
    try {
      stat = fs.statSync(fileToServe);
    } catch {
      return false;
    }
  }

  const ext = path.extname(fileToServe).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
  });

  const stream = fs.createReadStream(fileToServe);
  stream.on("error", () => {
    sendError(res, 500, "INTERNAL_ERROR", "Failed to read file.");
  });
  stream.pipe(res);
  return true;
}

function statusFromDomainCode(code) {
  switch (code) {
    case "VALIDATION":
    case "BAD_JSON":
      return 400;
    case "PAYMENT_DECLINED":
      return 402;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "SOLD_OUT":
    case "INVALID_STATE":
    case "INVALID_TRANSITION":
      return 409;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    default:
      return 400;
  }
}

export function createApp({
  publicDir = path.resolve(process.cwd(), "public"),
  eventService,
  bookingService,
  registerRoutes,
} = {}) {
  const router = createRouter();

  router.get("/health", (_req, res) => {
    sendJson(res, 200, { status: "ok" });
  });

  if (eventService && bookingService) {
    registerApiRoutes(router, { eventService, bookingService, readJsonBody, sendJson, sendError });
  }

  if (typeof registerRoutes === "function") {
    registerRoutes(router, { readJsonBody, sendJson, sendError, eventService, bookingService });
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname;

      const matched = router.match(req.method, pathname);
      if (matched) {
        await matched.handler(req, res, {
          params: matched.params,
          query: url.searchParams,
          readJsonBody,
          sendJson,
          sendError,
        });
        return;
      }

      if (pathname === "/api" || pathname.startsWith("/api/")) {
        sendError(res, 404, "NOT_FOUND", `Route ${req.method} ${pathname} not found.`);
        return;
      }

      if (req.method === "GET" || req.method === "HEAD") {
        if (serveStaticFile(res, publicDir, pathname)) {
          return;
        }
      }

      sendError(res, 404, "NOT_FOUND", `Not found: ${pathname}`);
    } catch (err) {
      // Never leak stack traces to clients
      if (err instanceof DomainError) {
        sendError(res, statusFromDomainCode(err.code), err.code, err.message);
        return;
      }
      sendError(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.");
    }
  });
}