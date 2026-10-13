import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "neon.tokens.v1";
const tok = (n: number) => ({ accessToken: `a${n}`, refreshToken: `r${n}`, tokenType: "Bearer", expiresIn: 900 });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const expired = () => json(401, { error: { code: "TOKEN_EXPIRED", message: "expired" } });

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function mockFetch(h: Handler) {
  const fn = vi.fn((url: string, init: RequestInit = {}) => Promise.resolve(h(url, init)));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const auth = (init: RequestInit) => (init.headers as Record<string, string>)?.Authorization;

async function load(initial = tok(1)) {
  localStorage.setItem(KEY, JSON.stringify(initial));
  vi.resetModules();
  return import("../src/api/client");
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("api client token refresh", () => {
  it("refreshes once and retries when the access token has expired", async () => {
    const f = mockFetch((url, init) => {
      if (url.endsWith("/auth/refresh")) return json(200, { tokens: tok(2) });
      return auth(init) === "Bearer a2" ? json(200, { user: { id: "u" } }) : expired();
    });
    const { api, getTokens } = await load();
    await expect(api.me()).resolves.toEqual({ user: { id: "u" } });
    expect(f.mock.calls.filter(([u]) => u.endsWith("/auth/refresh"))).toHaveLength(1);
    expect(getTokens()?.refreshToken).toBe("r2");
    expect(JSON.parse(localStorage.getItem(KEY)!).refreshToken).toBe("r2");
  });

  it("shares a single refresh between concurrent requests (single-use refresh tokens)", async () => {
    let refreshes = 0;
    mockFetch(async (url, init) => {
      if (url.endsWith("/auth/refresh")) { refreshes++; await new Promise((r) => setTimeout(r, 20)); return json(200, { tokens: tok(2) }); }
      return auth(init) === "Bearer a2" ? json(200, { user: {} }) : expired();
    });
    const { api } = await load();
    await Promise.all([api.me(), api.me(), api.rideStats()]);
    expect(refreshes).toBe(1);
  });

  it("adopts tokens rotated by another tab instead of spending the refresh token again", async () => {
    const f = mockFetch((url, init) => {
      if (url.endsWith("/auth/refresh")) return json(500, {});
      if (auth(init) === "Bearer a1") {
        // Meanwhile another tab refreshed and stored a new pair
        localStorage.setItem(KEY, JSON.stringify(tok(2)));
        return expired();
      }
      return auth(init) === "Bearer a2" ? json(200, { ok: true }) : json(500, {});
    });
    const { api, getTokens } = await load();
    await expect(api.me()).resolves.toEqual({ ok: true });
    expect(f.mock.calls.some(([u]) => u.endsWith("/auth/refresh"))).toBe(false);
    expect(getTokens()?.accessToken).toBe("a2");
  });

  it("signs the user out when the refresh token is rejected", async () => {
    mockFetch((url) => (url.endsWith("/auth/refresh") ? json(401, { error: { code: "INVALID_TOKEN", message: "bad" } }) : expired()));
    const { api, getTokens } = await load();
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(getTokens()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the tokens when refresh fails for a transient reason", async () => {
    mockFetch((url) => (url.endsWith("/auth/refresh") ? json(503, {}) : expired()));
    const { api, getTokens } = await load();
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(getTokens()?.refreshToken).toBe("r1");
  });

  it("clears tokens when the session was revoked", async () => {
    mockFetch(() => json(401, { error: { code: "SESSION_REVOKED", message: "revoked" } }));
    const { api, getTokens } = await load();
    await expect(api.me()).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    expect(getTokens()).toBeNull();
  });

  it("serialises refresh through the Web Locks API when available", async () => {
    const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb());
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { locks: { request } }));
    mockFetch((url, init) => (url.endsWith("/auth/refresh") ? json(200, { tokens: tok(2) }) : auth(init) === "Bearer a2" ? json(200, {}) : expired()));
    const { api } = await load();
    await api.me();
    expect(request).toHaveBeenCalledWith("neon.refresh", expect.any(Function));
  });

  it("maps network failures to a friendly ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fail"))));
    const { api } = await load();
    await expect(api.me()).rejects.toMatchObject({ code: "NETWORK", status: 0 });
  });

  it("syncs when another tab signs out", async () => {
    mockFetch(() => json(200, {}));
    const { getTokens, onTokens } = await load();
    const seen = vi.fn();
    onTokens(seen);
    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(getTokens()).toBeNull();
    expect(seen).toHaveBeenCalledWith(null);
  });
});
