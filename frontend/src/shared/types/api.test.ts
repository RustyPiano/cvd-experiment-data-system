import { expect, test } from "vitest";

import type { ExperimentExportRead } from "./api";

test("ExperimentExportRead exposes setup methods", () => {
  const selectSetupMethods = (payload: ExperimentExportRead) => payload.setup_methods;

  expect(selectSetupMethods).toBeTypeOf("function");
});
