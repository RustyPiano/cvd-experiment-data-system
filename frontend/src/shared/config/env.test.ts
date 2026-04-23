import { describe, expect, it } from "vitest";

import * as envModule from "./env";

type ResolveApiBaseUrl = (options?: {
  runtimeApiBaseUrl?: string | null;
  buildTimeApiBaseUrl?: string | null;
  fallbackApiBaseUrl?: string;
}) => string;

const resolveApiBaseUrl = (envModule as Record<string, unknown>)
  .resolveApiBaseUrl as ResolveApiBaseUrl | undefined;

describe("resolveApiBaseUrl", () => {
  it("prefers runtime config over build-time config", () => {
    expect(resolveApiBaseUrl).toBeTypeOf("function");
    expect(
      resolveApiBaseUrl?.({
        runtimeApiBaseUrl: "https://runtime.example.com/",
        buildTimeApiBaseUrl: "https://build.example.com",
      }),
    ).toBe("https://runtime.example.com");
  });

  it("falls back to build-time config when runtime config is empty", () => {
    expect(resolveApiBaseUrl).toBeTypeOf("function");
    expect(
      resolveApiBaseUrl?.({
        runtimeApiBaseUrl: "   ",
        buildTimeApiBaseUrl: "https://build.example.com/",
      }),
    ).toBe("https://build.example.com");
  });

  it("keeps same-origin mode when runtime config points at root", () => {
    expect(resolveApiBaseUrl).toBeTypeOf("function");
    expect(
      resolveApiBaseUrl?.({
        runtimeApiBaseUrl: "/",
      }),
    ).toBe("");
  });

  it("uses the local fallback when neither runtime nor build-time config is present", () => {
    expect(resolveApiBaseUrl).toBeTypeOf("function");
    expect(resolveApiBaseUrl?.()).toBe("http://127.0.0.1:8000");
  });
});
