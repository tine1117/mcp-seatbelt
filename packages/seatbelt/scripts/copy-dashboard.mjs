import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../apps/dashboard/dist");
const target = resolve(here, "../dist/dashboard");

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
