import { ExtensionActivate } from "@foxglove/studio";

export const activate: ExtensionActivate = (ctx) => {
  ctx.registerPanel("map", () => import("./panels/map"));
};
