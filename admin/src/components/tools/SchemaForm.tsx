// Auto-form renderer for module config schemas (ARCHITECTURE §8).
//
// Modules declare their knobs as a FLAT Pydantic model (str/int/float/bool
// fields with optional min/max) — config_schema() → JSON Schema → this form.
// A new module's settings appear in the admin with ZERO admin-code changes;
// that convention is why this is ~100 lines instead of a JSON-Schema-form
// library (omakase: convention over configuration).
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ConfigSchema, ConfigSchemaProperty } from "@/types/api"

export type ConfigValues = Record<string, unknown>

interface SchemaFormProps {
  schema: ConfigSchema
  values: ConfigValues
  onChange: (values: ConfigValues) => void
  idPrefix?: string
}

function bounds(prop: ConfigSchemaProperty): { min?: number; max?: number } {
  return {
    min: prop.minimum ?? prop.exclusiveMinimum,
    max: prop.maximum ?? prop.exclusiveMaximum,
  }
}

function FieldHint({ prop }: { prop: ConfigSchemaProperty }) {
  const { min, max } = bounds(prop)
  const range =
    min !== undefined && max !== undefined
      ? ` (${min}–${max})`
      : min !== undefined
        ? ` (≥ ${min})`
        : max !== undefined
          ? ` (≤ ${max})`
          : ""
  if (!prop.description && !range) return null
  return (
    <p className="text-xs text-muted-foreground">
      {prop.description}
      {range}
    </p>
  )
}

export function SchemaForm({ schema, values, onChange, idPrefix = "cfg" }: SchemaFormProps) {
  const setValue = (key: string, value: unknown) => onChange({ ...values, [key]: value })

  return (
    <div className="space-y-4">
      {Object.entries(schema.properties).map(([key, prop]) => {
        const id = `${idPrefix}-${key}`
        const label = prop.title ?? key
        const current = values[key] ?? prop.default

        if (prop.type === "boolean") {
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor={id}>{label}</Label>
                <FieldHint prop={prop} />
              </div>
              <Switch
                id={id}
                checked={Boolean(current)}
                onCheckedChange={(checked) => setValue(key, checked)}
              />
            </div>
          )
        }

        if (prop.type === "integer" || prop.type === "number") {
          const { min, max } = bounds(prop)
          return (
            <div key={key} className="space-y-1">
              <Label htmlFor={id}>{label}</Label>
              <Input
                id={id}
                type="number"
                value={current === undefined || current === null ? "" : String(current)}
                min={min}
                max={max}
                step={prop.type === "integer" ? 1 : "any"}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === "") {
                    setValue(key, undefined)
                    return
                  }
                  const parsed = prop.type === "integer" ? parseInt(raw, 10) : parseFloat(raw)
                  if (!Number.isNaN(parsed)) setValue(key, parsed)
                }}
                className="max-w-40"
              />
              <FieldHint prop={prop} />
            </div>
          )
        }

        // Default: string input (the flat-schema convention has no nesting)
        return (
          <div key={key} className="space-y-1">
            <Label htmlFor={id}>{label}</Label>
            <Input
              id={id}
              value={current === undefined || current === null ? "" : String(current)}
              onChange={(e) => setValue(key, e.target.value)}
            />
            <FieldHint prop={prop} />
          </div>
        )
      })}
    </div>
  )
}
