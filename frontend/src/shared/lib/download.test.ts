import { afterEach, describe, expect, it, vi } from "vitest";

import { triggerBlobDownload } from "./download";

describe("triggerBlobDownload", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("revokes the blob URL asynchronously after the click", () => {
    vi.useFakeTimers();
    const createObjectUrl = vi.fn(() => "blob:download");
    const revokeObjectUrl = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    globalThis.URL.createObjectURL = createObjectUrl;
    globalThis.URL.revokeObjectURL = revokeObjectUrl;

    triggerBlobDownload(new Blob(["payload"]), "export.json");

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:download");
  });
});
