import { z } from "zod";
import {
  BlockLayoutSchema,
  compileBlocks,
  normalizeBlocks,
  validateBlocks,
  type BlockLayout,
  type BlockProblems,
  type LayoutDefinition,
} from "@32dashboards/layout-engine/data";
import { ScreenViewSchema, timestamp, type Screen, type ScreenView } from "@32dashboards/schema/core";
import { kioskCatalog } from "./catalog.js";
import { BUILT_IN_PREFIX, builtInById, builtInLayouts, templateById } from "./layouts.js";

/*
 * Operator-saved layouts: the `layouts` Replicant's schema, the Messages that
 * change it, and the pure functions behind them. Screens (fundraiser-core's
 * `screens` Replicant) refer to layouts by id: a saved layout's UUID, or
 * `builtin:<view>` for a built-in one.
 */

export const SavedLayoutSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  /** The scene it was made for. A hint for pickers, not a restriction. */
  view: ScreenViewSchema,
  /** What screens show. */
  published: BlockLayoutSchema,
  /** Unpublished edits, if any. Screens never show a draft. */
  draft: BlockLayoutSchema.nullable().default(null),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});
export type SavedLayout = z.infer<typeof SavedLayoutSchema>;

export const MAX_LAYOUTS = 100;

/** Replicant `layouts` (persisted). */
export const LayoutsReplicantSchema = z.array(SavedLayoutSchema).max(MAX_LAYOUTS);
export type LayoutsReplicant = z.infer<typeof LayoutsReplicantSchema>;

const layoutRef = z.string().min(1).max(100);
const layoutId = z.string().uuid();
const name = z.string().trim().min(1).max(60);

export const kioskMessageSchemas = {
  /**
   * Copies a built-in layout, a template, or a saved layout under a new name,
   * optionally for another scene. Replies with the new id.
   */
  copyLayout: z.object({ fromId: layoutRef, name: name.optional(), view: ScreenViewSchema.optional() }).strict(),
  renameLayout: z.object({ layoutId, name }).strict(),
  /** Replaces the draft. Refused if it has errors; replies with its warnings. */
  saveLayoutDraft: z.object({ layoutId, draft: BlockLayoutSchema }).strict(),
  /** Makes the draft what screens show. Replies with its warnings. */
  publishLayout: z.object({ layoutId }).strict(),
  discardLayoutDraft: z.object({ layoutId }).strict(),
  /** Refused while a screen uses the layout. */
  deleteLayout: z.object({ layoutId }).strict(),
} as const;
export type KioskMessageName = keyof typeof kioskMessageSchemas;
export type KioskMessagePayload<N extends KioskMessageName> = z.input<(typeof kioskMessageSchemas)[N]>;

/** A problem an operator can fix; its message is shown in panels. */
export class LayoutError extends Error {
  override name = "LayoutError";
}

export interface Deps {
  now: () => string;
  newId: () => string;
}

/** Scenes whose layouts should show the total. */
const TOTAL_VIEWS: ScreenView[] = ["main", "intermission", "celebration"];

export function checkLayout(blocks: unknown, view: ScreenView): BlockProblems {
  return validateBlocks(blocks, kioskCatalog, { expectTotal: TOTAL_VIEWS.includes(view) });
}

function requireValid(blocks: BlockLayout, view: ScreenView): string[] {
  const { errors, warnings } = checkLayout(blocks, view);
  if (errors.length) throw new LayoutError(errors.join("; "));
  return warnings;
}

function find(layouts: SavedLayout[], id: string): SavedLayout {
  const layout = layouts.find((l) => l.id === id);
  if (!layout) throw new LayoutError(`No saved layout with id ${id}`);
  return layout;
}

const replace = (layouts: SavedLayout[], next: SavedLayout) => layouts.map((l) => (l.id === next.id ? next : l));

export function copyLayout(
  layouts: SavedLayout[],
  input: { fromId: string; name?: string; view?: ScreenView },
  deps: Deps,
): { layouts: SavedLayout[]; layoutId: string } {
  if (layouts.length >= MAX_LAYOUTS) throw new LayoutError(`There can be at most ${MAX_LAYOUTS} saved layouts.`);
  const builtIn = builtInById(input.fromId);
  const template = templateById(input.fromId);
  const source = builtIn
    ? { name: `Copy of ${builtIn.name}`, view: builtIn.view, published: builtIn.blocks }
    : template
      ? { name: template.name, view: "main" as const, published: template.blocks }
      : { ...find(layouts, input.fromId), name: `Copy of ${find(layouts, input.fromId).name}` };
  const now = deps.now();
  const copy = SavedLayoutSchema.parse({
    id: deps.newId(),
    name: input.name ?? source.name.slice(0, 60),
    view: input.view ?? source.view,
    published: normalizeBlocks(source.published, kioskCatalog),
    draft: null,
    createdAt: now,
    updatedAt: now,
  });
  return { layouts: [...layouts, copy], layoutId: copy.id };
}

export function renameLayout(layouts: SavedLayout[], id: string, newName: string, deps: Deps): SavedLayout[] {
  return replace(layouts, { ...find(layouts, id), name: newName, updatedAt: deps.now() });
}

export function saveLayoutDraft(
  layouts: SavedLayout[],
  id: string,
  draft: BlockLayout,
  deps: Deps,
): { layouts: SavedLayout[]; warnings: string[] } {
  const layout = find(layouts, id);
  const normalized = normalizeBlocks(draft, kioskCatalog);
  const warnings = requireValid(normalized, layout.view);
  return { layouts: replace(layouts, { ...layout, draft: normalized, updatedAt: deps.now() }), warnings };
}

export function publishLayout(
  layouts: SavedLayout[],
  id: string,
  deps: Deps,
): { layouts: SavedLayout[]; warnings: string[] } {
  const layout = find(layouts, id);
  if (!layout.draft) throw new LayoutError(`"${layout.name}" has no changes to publish.`);
  const warnings = requireValid(layout.draft, layout.view);
  return {
    layouts: replace(layouts, { ...layout, published: layout.draft, draft: null, updatedAt: deps.now() }),
    warnings,
  };
}

export function discardLayoutDraft(layouts: SavedLayout[], id: string, deps: Deps): SavedLayout[] {
  return replace(layouts, { ...find(layouts, id), draft: null, updatedAt: deps.now() });
}

export function deleteLayout(layouts: SavedLayout[], id: string, screens: Screen[]): SavedLayout[] {
  const layout = find(layouts, id);
  const users = screens.filter((s) => Object.values(s.layouts).includes(id)).map((s) => s.name);
  if (users.length) throw new LayoutError(`"${layout.name}" is in use on ${users.join(", ")}. Choose another layout there first.`);
  return layouts.filter((l) => l.id !== id);
}

export interface ResolvedLayout {
  layout: LayoutDefinition;
  /** Why the built-in layout is showing instead of the chosen one. */
  problem: string | null;
}

/**
 * The layout a screen shows for a view. Never fails: anything missing or
 * invalid falls back to the view's built-in layout, with the reason.
 */
export function resolveLayout(view: ScreenView, screen: Screen | undefined, layouts: SavedLayout[]): ResolvedLayout {
  const fallback = (problem: string | null): ResolvedLayout => ({ layout: builtInLayouts[view].layout, problem });
  const ref = screen?.layouts[view];
  if (!ref) return fallback(null);
  if (ref.startsWith(BUILT_IN_PREFIX)) {
    const builtIn = builtInById(ref);
    return builtIn ? { layout: builtIn.layout, problem: null } : fallback(`Unknown built-in layout "${ref}"`);
  }
  const saved = layouts.find((l) => l.id === ref);
  if (!saved) return fallback(`Layout ${ref} no longer exists`);
  const { errors } = checkLayout(saved.published, saved.view);
  if (errors.length) return fallback(`"${saved.name}" can't be shown: ${errors.join("; ")}`);
  return { layout: compileBlocks(saved.published, { id: saved.id, name: saved.name }), problem: null };
}

/**
 * The layout a dashboard preview shows: `ref` (a saved or built-in layout
 * id), its draft when `draft` is set and it has one. Falls back like
 * `resolveLayout`.
 */
export function resolvePreview(
  ref: string,
  view: ScreenView,
  layouts: SavedLayout[],
  draft: boolean,
): ResolvedLayout {
  const saved = layouts.find((l) => l.id === ref);
  if (!saved) return resolveLayout(view, { id: "preview", name: "Preview", layouts: { [view]: ref } }, layouts);
  const blocks = (draft && saved.draft) || saved.published;
  const { errors } = checkLayout(blocks, saved.view);
  if (errors.length) return { layout: builtInLayouts[view].layout, problem: errors.join("; ") };
  return { layout: compileBlocks(blocks, { id: saved.id, name: saved.name }), problem: null };
}
