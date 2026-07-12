import { z } from 'zod';

/**
 * Kontrolowany słownik ról semantycznych. Runtime nigdy nie odwołuje się do nazw
 * meshy z pliku klienta - wyłącznie do ról zmapowanych w panelu administracyjnym.
 */
export const SEMANTIC_ROLES = [
  'door_leaf',
  'frame',
  'glass',
  'glass_frame',
  'handle_inside',
  'handle_outside',
  'lock_escutcheon',
  'hinges_public',
  'threshold',
  'sliding_rail',
  'sliding_cover',
  'sidelight_left',
  'sidelight_right',
  'toplight',
  'passive_leaf',
  'active_leaf',
  'mirror',
  'decor_strip',
  'wall_panel',
  'leaf_side_a',
  'leaf_side_b',
] as const;

export const semanticRoleSchema = z.enum(SEMANTIC_ROLES);
export type SemanticRole = z.infer<typeof semanticRoleSchema>;

/** Role, które mogą być slotem całego modułu GLB w AssetBundle. */
export const MODULE_SLOTS = [
  'door_leaf',
  'frame',
  'passive_leaf',
  'active_leaf',
  'sidelight_left',
  'sidelight_right',
  'toplight',
  'sliding_rail',
  'sliding_cover',
  'threshold',
  'handle_inside',
  'handle_outside',
] as const;

export const moduleSlotSchema = z.enum(MODULE_SLOTS);
export type ModuleSlot = z.infer<typeof moduleSlotSchema>;

/** Semantyczne punkty kotwiczenia zapisywane w manifeście assetu (wartości w mm). */
export const ANCHOR_KEYS = [
  'hinge_axis',
  'handle_center',
  'lock_center',
  'glass_center',
  'wall_mount_plane',
  'floor_contact',
  'rail_start',
  'leaf_center',
  'meeting_stile',
] as const;

export const anchorKeySchema = z.enum(ANCHOR_KEYS);
export type AnchorKey = z.infer<typeof anchorKeySchema>;

export const MATERIAL_SLOTS = [
  'leaf_side_a',
  'leaf_side_b',
  'leaf_edge',
  'frame_inside',
  'frame_outside',
  'glass',
  'glass_frame',
  'handle',
  'hinges',
  'threshold',
  'rail',
  'mirror',
  'decor',
  'wall_panel',
] as const;

export const materialSlotSchema = z.enum(MATERIAL_SLOTS);
export type MaterialSlot = z.infer<typeof materialSlotSchema>;
