import { afterEach, describe, expect, it, vi } from "vitest";

import { API_UNAUTHORIZED_EVENT } from "./client";
import { apiRequest } from "./client";

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps non-json error bodies in HttpError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Bad gateway", {
          status: 502,
          headers: {
            "Content-Type": "text/plain",
          },
        }),
      ),
    );

    await expect(apiRequest("/api/v1/experiments")).rejects.toMatchObject({
      detail: "Bad gateway",
      name: "HttpError",
      status: 502,
    });
  });

  it("dispatches an unauthorized event for 401 responses on authenticated requests", async () => {
    const unauthorizedListener = vi.fn();
    window.addEventListener(API_UNAUTHORIZED_EVENT, unauthorizedListener);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Invalid token" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ),
    );

    await expect(
      apiRequest("/api/v1/experiments", {
        token: "expired-token",
      }),
    ).rejects.toMatchObject({
      detail: "Invalid token",
      status: 401,
    });

    expect(unauthorizedListener).toHaveBeenCalledTimes(1);
    window.removeEventListener(API_UNAUTHORIZED_EVENT, unauthorizedListener);
  });
});
