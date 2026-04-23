import { describe, expect, it } from "vitest";

import { createSessionSnapshot } from "./auth-store";

describe("createSessionSnapshot", () => {
  it("returns anonymous session when no token is present", () => {
    expect(createSessionSnapshot(null)).toEqual({
      accessToken: null,
      currentUser: null,
      isAuthenticated: false,
    });
  });
});
