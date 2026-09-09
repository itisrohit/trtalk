// SchemaForm renders a form from a module's config_schema() JSON Schema —
// the contract that makes new modules' knobs appear with zero admin changes.
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SchemaForm } from "./SchemaForm"
import type { ConfigSchema } from "@/types/api"

// The real FaqSearchConfig schema shape (Pydantic model_json_schema output)
const FAQ_SCHEMA: ConfigSchema = {
  title: "FaqSearchConfig",
  properties: {
    top_k: {
      type: "integer",
      title: "Top K",
      description: "Maximum number of results",
      default: 4,
      minimum: 1,
      maximum: 20,
    },
    min_similarity: {
      type: "number",
      title: "Min Similarity",
      description: "Minimum cosine similarity for a result to count as relevant",
      default: 0.5,
      minimum: 0,
      maximum: 1,
    },
  },
}

describe("SchemaForm", () => {
  it("renders a numeric input per schema property with bounds", () => {
    render(<SchemaForm schema={FAQ_SCHEMA} values={{ top_k: 4 }} onChange={() => {}} />)

    const topK = screen.getByLabelText("Top K") as HTMLInputElement
    expect(topK.type).toBe("number")
    expect(topK.value).toBe("4")
    expect(topK.min).toBe("1")
    expect(topK.max).toBe("20")
  })

  it("falls back to the schema default when no value is stored", () => {
    render(<SchemaForm schema={FAQ_SCHEMA} values={{}} onChange={() => {}} />)

    const minSim = screen.getByLabelText("Min Similarity") as HTMLInputElement
    expect(minSim.value).toBe("0.5")
  })

  it("emits parsed numbers on change", () => {
    const onChange = vi.fn()
    render(<SchemaForm schema={FAQ_SCHEMA} values={{ top_k: 4 }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText("Top K"), { target: { value: "7" } })
    expect(onChange).toHaveBeenCalledWith({ top_k: 7 })
  })

  it("renders booleans as switches and strings as text inputs", () => {
    const schema: ConfigSchema = {
      properties: {
        verbose: { type: "boolean", title: "Verbose", default: false },
        greeting: { type: "string", title: "Greeting", default: "hi" },
      },
    }
    const onChange = vi.fn()
    render(<SchemaForm schema={schema} values={{}} onChange={onChange} />)

    const toggle = screen.getByRole("switch", { name: "Verbose" })
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ verbose: true })

    const greeting = screen.getByLabelText("Greeting") as HTMLInputElement
    expect(greeting.value).toBe("hi")
  })
})
