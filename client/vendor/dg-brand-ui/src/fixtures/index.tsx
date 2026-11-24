/**
 * Example apps and sample data, for building screens before the agent works and for the
 * Storybook. Import from "@deepgram-devs/dg-brand-ui/fixtures".
 *
 * Each example is a DemoExample: one domain's brand, personas, copy, record, search results, and
 * conversations. The reference screens in stories/screens/templates.tsx take any of them. To start
 * a new domain, copy the example closest to it and rewrite it.
 */
import { bankingExample } from "./examples/banking";
import { healthcareExample } from "./examples/healthcare";
import { insuranceExample } from "./examples/insurance";
import { retailExample } from "./examples/retail";
import { supportExample } from "./examples/support";
import type { DemoExample } from "./types";

export type { DemoExample, Persona } from "./types";
export { bankingExample, healthcareExample, insuranceExample, retailExample, supportExample };
export * from "./marks";
export { ASSET_BASE, BUILT_WITH, EN_META, agent, at, caller, languageOptions, tool } from "./shared";

/** Every example, by id, in menu order. The first is the default. */
export const EXAMPLES: Record<string, DemoExample> = {
  support: supportExample,
  insurance: insuranceExample,
  banking: bankingExample,
  healthcare: healthcareExample,
  retail: retailExample,
};

/** The neutral starting point: customer support */
export const DEFAULT_EXAMPLE = supportExample;

/** An example by id, falling back to the default */
export function getExample(id?: string | null): DemoExample {
  return (id && EXAMPLES[id]) || DEFAULT_EXAMPLE;
}
