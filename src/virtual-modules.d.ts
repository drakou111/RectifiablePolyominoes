declare module "virtual:polyomino-entries" {
  import type { PolyominoEntry } from "./core/model";

  const entries: readonly PolyominoEntry[];
  export default entries;
}
