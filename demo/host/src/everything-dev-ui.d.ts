import "everything-dev/ui/types";

declare module "everything-dev/ui/types" {
  interface RouterContext {
    session?: unknown;
  }

  interface RenderOptions {
    session?: unknown;
  }
}
