import { z } from 'zod';
import { selectionValueSchema } from './evaluate';

/**
 * Deklaratywne warunki reguł. Żadnego wykonywalnego kodu - wyłącznie dane.
 * Wykonanie odbywa się tylko na backendzie (apps/api/src/domain/rules-engine.ts).
 */
export const conditionLeafSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'ne', 'in', 'nin', 'lt', 'lte', 'gt', 'gte', 'between', 'truthy', 'falsy']),
  value: z.union([selectionValueSchema, z.array(z.number()), z.array(z.string())]).optional(),
});

export type Condition =
  | z.infer<typeof conditionLeafSchema>
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    conditionLeafSchema,
    z.object({ all: z.array(conditionSchema) }),
    z.object({ any: z.array(conditionSchema) }),
    z.object({ not: conditionSchema }),
  ]),
);

export const ruleEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('error'), fieldKey: z.string().nullable().optional() }),
  z.object({ type: z.literal('warn'), fieldKey: z.string().nullable().optional() }),
  z.object({ type: z.literal('require_field'), fieldKey: z.string() }),
  z.object({
    type: z.literal('exclude_option'),
    fieldKey: z.string(),
    optionValues: z.array(z.string()),
  }),
  z.object({ type: z.literal('hide_field'), fieldKey: z.string() }),
  z.object({
    type: z.literal('set_value'),
    fieldKey: z.string(),
    value: selectionValueSchema,
  }),
  z.object({
    type: z.literal('limit_dimension'),
    dimension: z.enum(['width_mm', 'height_mm']),
    minMm: z.number().int().nullable().optional(),
    maxMm: z.number().int().nullable().optional(),
  }),
]);
export type RuleEffect = z.infer<typeof ruleEffectSchema>;

export const ruleDefSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['compatibility', 'validation']),
  priority: z.number().int().default(100),
  /** Zakres: null = cała kategoria/tenant. */
  categoryKey: z.string().nullable().optional(),
  modelKey: z.string().nullable().optional(),
  when: conditionSchema,
  effects: z.array(ruleEffectSchema).min(1),
  /** Komunikat pokazywany klientowi końcowemu. */
  messagePublic: z.string(),
  /** Osobny komunikat techniczny dla administratora. */
  messageAdmin: z.string().nullable().optional(),
  activeFrom: z.string().nullable().optional(),
  activeTo: z.string().nullable().optional(),
});
export type RuleDef = z.infer<typeof ruleDefSchema>;
