import { randomUUID } from "node:crypto";
import type NodeCG from "nodecg/types";
import { z } from "zod";
import type { ScreensReplicant } from "@32dashboards/schema/core";
import { CommandError, formatZodError, listenForCommand, plain } from "@32dashboards/source-sdk";
import { displayTokenFile, newDisplayToken, readDisplayToken, writeDisplayToken } from "./displayToken.js";
import * as library from "../library.js";
import { LayoutsReplicantSchema, kioskMessageSchemas, type LayoutsReplicant } from "../library.js";

const deps: library.Deps = { now: () => new Date().toISOString(), newId: randomUUID };

/**
 * Keeps operator-saved layouts. Screens (fundraiser-core's `screens`) choose
 * among them; the kiosk graphic renders whichever its screen chose.
 */
export default function layoutKiosk(nodecg: NodeCG.ServerAPI, tokenFile = displayTokenFile()): void {
  const layouts = nodecg.Replicant<LayoutsReplicant>("layouts", { defaultValue: [] });
  const screens = nodecg.Replicant<ScreensReplicant>("screens", "fundraiser-core", { defaultValue: [] });

  // Only the dashboard can ask for these: NodeCG refuses them from a connection using the TV token.
  readDisplayToken(tokenFile);
  listenForCommand(nodecg, "displayToken", z.undefined().or(z.null()), () => readDisplayToken(tokenFile));
  listenForCommand(nodecg, "replaceDisplayToken", z.undefined().or(z.null()), () => {
    const token = newDisplayToken();
    writeDisplayToken(tokenFile, token);
    return token;
  });

  const stored = LayoutsReplicantSchema.safeParse(plain(layouts.value ?? []));
  if (!stored.success) nodecg.log.error(`Stored layouts don't match the schema: ${formatZodError(stored.error)}`);

  /** Runs a layout command, turning LayoutErrors into readable rejections. */
  function command<N extends library.KioskMessageName>(
    name: N,
    run: (
      current: LayoutsReplicant,
      payload: z.output<(typeof kioskMessageSchemas)[N]>,
    ) => {
      layouts: LayoutsReplicant;
      reply?: unknown;
    },
  ) {
    listenForCommand(nodecg, name, kioskMessageSchemas[name], (payload) => {
      try {
        const result = run(plain(layouts.value ?? []), payload);
        layouts.value = result.layouts;
        return result.reply;
      } catch (err) {
        throw err instanceof library.LayoutError ? new CommandError(err.message) : err;
      }
    });
  }

  command("copyLayout", (current, input) => {
    const { layouts: next, layoutId } = library.copyLayout(current, input, deps);
    return { layouts: next, reply: layoutId };
  });
  command("renameLayout", (current, { layoutId, name }) => ({
    layouts: library.renameLayout(current, layoutId, name, deps),
  }));
  command("saveLayoutDraft", (current, { layoutId, draft }) => {
    const { layouts: next, warnings } = library.saveLayoutDraft(current, layoutId, draft, deps);
    return { layouts: next, reply: { warnings } };
  });
  command("publishLayout", (current, { layoutId }) => {
    const { layouts: next, warnings } = library.publishLayout(current, layoutId, deps);
    return { layouts: next, reply: { warnings } };
  });
  command("discardLayoutDraft", (current, { layoutId }) => ({
    layouts: library.discardLayoutDraft(current, layoutId, deps),
  }));
  command("deleteLayout", (current, { layoutId }) => ({
    layouts: library.deleteLayout(current, layoutId, plain(screens.value ?? [])),
  }));
}
