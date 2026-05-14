import { main } from "./main.js";
import { log } from "./utils.js";

main().catch((err: unknown) => {
  log.error({ err }, "Fatal error");
  process.exit(1);
});
