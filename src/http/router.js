function normalizePath(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) {
    return "/";
  }
  const pathOnly = pathname.split("?")[0];
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }
  return pathOnly;
}

function compilePattern(method, pattern) {
  const normalized = normalizePath(pattern);
  const segments = normalized === "/" ? [] : normalized.slice(1).split("/");
  const paramNames = [];

  const regexSegments = segments.map((segment) => {
    if (segment.startsWith(":")) {
      const name = segment.slice(1);
      if (!name) {
        throw new Error(`Invalid route param in pattern "${pattern}".`);
      }
      paramNames.push(name);
      return "([^/]+)";
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });

  return {
    method: method.toUpperCase(),
    pattern: normalized,
    paramNames,
    regex: new RegExp(`^/${regexSegments.join("/")}$`),
  };
}

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    if (typeof handler !== "function") {
      throw new TypeError("Route handler must be a function.");
    }
    routes.push({
      ...compilePattern(method, pattern),
      handler,
    });
  }

  function match(method, pathname) {
    const targetMethod = String(method || "").toUpperCase();
    const targetPath = normalizePath(pathname);

    for (const route of routes) {
      if (route.method !== targetMethod) {
        continue;
      }
      const result = route.regex.exec(targetPath);
      if (!result) {
        continue;
      }

      const params = {};
      route.paramNames.forEach((name, idx) => {
        params[name] = decodeURIComponent(result[idx + 1]);
      });

      return {
        handler: route.handler,
        params,
      };
    }

    return null;
  }

  return {
    get: (pattern, handler) => add("GET", pattern, handler),
    post: (pattern, handler) => add("POST", pattern, handler),
    put: (pattern, handler) => add("PUT", pattern, handler),
    patch: (pattern, handler) => add("PATCH", pattern, handler),
    delete: (pattern, handler) => add("DELETE", pattern, handler),
    add,
    match,
  };
}