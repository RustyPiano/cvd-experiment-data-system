import { describe, expect, it } from "vitest";

import { router } from "./router";

function hasCatchAllRoute(
  routes: typeof router.routes,
): boolean {
  return routes.some((route) => {
    if (route.path === "*") {
      return true;
    }
    return route.children ? hasCatchAllRoute(route.children) : false;
  });
}

function routesWithChildrenHaveErrorElement(routes: typeof router.routes): boolean {
  return routes.every((route) => {
    const childrenAreCovered = route.children ? routesWithChildrenHaveErrorElement(route.children) : true;
    if (!route.children || route.children.length === 0) {
      return childrenAreCovered;
    }
    return route.errorElement !== undefined && childrenAreCovered;
  });
}

describe("router", () => {
  it("defines a catch-all route for unknown paths", () => {
    expect(hasCatchAllRoute(router.routes)).toBe(true);
  });

  it("defines route-level error elements for route render failures", () => {
    expect(routesWithChildrenHaveErrorElement(router.routes)).toBe(true);
  });
});
