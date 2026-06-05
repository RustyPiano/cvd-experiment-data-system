import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuthenticatedImage } from "./authenticated-image";

describe("AuthenticatedImage", () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-blob");
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["mock"], { type: "image/png" })),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders image after loading authentication", async () => {
    render(<AuthenticatedImage url="/test/image.png" token="secret" alt="test-alt" />);
    await waitFor(() => {
      const img = screen.getByRole("img", { name: "test-alt" });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "blob:http://localhost/mock-blob");
    });
  });
});
