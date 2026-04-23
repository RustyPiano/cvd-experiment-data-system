import { describe, expect, it, vi } from "vitest";

import { apiRequest } from "./client";

describe("apiRequest", () => {
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
});
