import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const assetPaths = ["/index.html", "/styles.css", "/course-studio-v15.js", "/pptx-v15.js"];
const assets = Object.fromEntries(
  await Promise.all(
    assetPaths.map(async (path) => [path, await readFile(resolve(root, "dist", path.slice(1)), "utf8")]),
  ),
);

const workerSource = await readFile(resolve(root, "worker/index.js"), "utf8");
const marker = "const ASSETS = {}; // injected by scripts/build-worker.mjs";
if (!workerSource.includes(marker)) throw new Error("Worker asset marker is missing.");

const output = workerSource.replace(marker, `const ASSETS = ${JSON.stringify(assets)};`);
const serverDir = resolve(root, "dist/server");
await mkdir(serverDir, { recursive: true });
await writeFile(resolve(serverDir, "index.js"), output);

process.stdout.write(JSON.stringify({ output: "dist/server/index.js", assets: assetPaths.length }));
