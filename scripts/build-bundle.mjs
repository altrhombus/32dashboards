#!/usr/bin/env node
// Builds the NodeCG bundle in the current working directory. Every bundle's
// `build` script calls this, so all bundles share one layout convention:
//
//   src/schemas/index.ts   -> schemas/<export>.json  each exported zod schema becomes the
//                                                    JSON Schema NodeCG validates the
//                                                    Replicant of the same name against
//   src/extension/index.ts -> extension/index.js     esbuild, CommonJS (NodeCG require()s it)
//   src/graphics/*.html    -> graphics/              Vite + React
//   src/dashboard/*.html   -> dashboard/             Vite + React
//
// --watch rebuilds the extension, graphics, and panels on change. Graphics and
// panels only need a browser refresh; extension and schema changes need a
// NodeCG restart.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";
import { zodToJsonSchema } from "zod-to-json-schema";

const bundleDir = process.cwd();
const watch = process.argv.includes("--watch");
const src = (...segments) => path.join(bundleDir, "src", ...segments);

async function buildSchemas() {
  const entry = src("schemas", "index.ts");
  if (!existsSync(entry)) return;

  // Bundle the schema module (zod included) to a temp ESM file we can import.
  const tmp = path.join(bundleDir, "node_modules", ".cache", "build-bundle", "schemas.mjs");
  await esbuild.build({
    entryPoints: [entry],
    outfile: tmp,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "warning",
  });
  const mod = await import(`${pathToFileURL(tmp).href}?t=${Date.now()}`);

  const outDir = path.join(bundleDir, "schemas");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [name, schema] of Object.entries(mod)) {
    if (!schema || typeof schema.safeParse !== "function") continue;
    const json = zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" });
    writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`);
    console.log(`schemas/${name}.json`);
  }
}

async function buildExtension() {
  const entry = src("extension", "index.ts");
  if (!existsSync(entry)) return;

  const options = {
    entryPoints: [entry],
    outfile: path.join(bundleDir, "extension", "index.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    sourcemap: true,
    logLevel: "info",
  };
  if (watch) await (await esbuild.context(options)).watch();
  else await esbuild.build(options);
}

async function buildPages(kind) {
  const root = src(kind);
  if (!existsSync(root)) return;
  const pages = readdirSync(root).filter((file) => file.endsWith(".html"));
  if (pages.length === 0) return;

  await viteBuild({
    root,
    base: "./",
    configFile: false,
    logLevel: "info",
    plugins: [react()],
    build: {
      outDir: path.join(bundleDir, kind),
      emptyOutDir: true,
      watch: watch ? {} : null,
      rollupOptions: {
        input: Object.fromEntries(pages.map((page) => [path.basename(page, ".html"), path.join(root, page)])),
      },
    },
  });
}

await buildSchemas();
await buildExtension();
await buildPages("graphics");
await buildPages("dashboard");
