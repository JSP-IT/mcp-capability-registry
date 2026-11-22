/** Synthetic demo data. Kept identical to examples/before.json and examples/after.json (enforced by tests). */

export function demoBefore(): Record<string, unknown> {
  return {
    protocolVersion: "2025-06-18",
    name: "inventory-server",
    title: "Inventory Example",
    tools: [
      {
        name: "lookup_product",
        description: "Look up a product.",
        inputSchema: { type: "object", properties: { sku: { type: "string" } } }
      }
    ],
    resources: [
      { uri: "inventory://products/current", name: "Current inventory", description: "Current product inventory." }
    ],
    prompts: [
      { name: "summarize_inventory", description: "Summarize inventory.", arguments: [{ name: "format", required: false }] }
    ]
  };
}

export function demoAfter(): Record<string, unknown> {
  return {
    protocolVersion: "2025-06-18",
    name: "inventory-server",
    title: "Inventory Example",
    tools: [
      {
        name: "lookup_product",
        description: "Look up a product and location.",
        inputSchema: {
          type: "object",
          properties: { sku: { type: "string" }, warehouse: { type: "string" } },
          required: ["sku", "warehouse"]
        }
      },
      {
        name: "reorder_product",
        description: "Create a reorder draft.",
        inputSchema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] }
      }
    ],
    resources: [
      { uri: "inventory://products/current", name: "Current inventory", description: "Updated product inventory." }
    ],
    prompts: [
      { name: "summarize_inventory", description: "Summarize inventory.", arguments: [{ name: "format", required: true }] }
    ]
  };
}
