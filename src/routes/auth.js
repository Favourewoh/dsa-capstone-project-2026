import { requireUser } from "../http/guards.js";
import { readJsonBody as defaultReadJsonBody, sendJson as defaultSendJson } from "../http/app.js";

export function registerAuthRoutes(
  router,
  { authService, repository, readJsonBody = defaultReadJsonBody, sendJson = defaultSendJson }
) {
  router.post("/api/auth/signup", async (req, res) => {
    const body = await readJsonBody(req);
    const { email, password, name, role } = body || {};
    const result = await authService.signup({ email, password, name, role });
    sendJson(res, 201, result);
  });

  router.post("/api/auth/login", async (req, res) => {
    const body = await readJsonBody(req);
    const { email, password } = body || {};
    const result = await authService.login({ email, password });
    sendJson(res, 200, result);
  });

  router.get("/api/auth/me", async (req, res) => {
    const authUser = await requireUser(req, { repository });
    const user = await authService.getMe(authUser.id);
    sendJson(res, 200, { user });
  });
}