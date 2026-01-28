/**
 * Normalizes a package name into the module federation remote name.
 * This function must produce identical results in both runtime and build contexts.
 * 
 * Normalization rules:
 * - Convert to lowercase
 * - Strip a single leading '@' symbol
 * - Replace '/' with '_'
 * - Preserve hyphens and other characters
 * 
 * Examples:
 * - "@scope/my-plugin" → "scope_my-plugin"
 * - "@SCOPE/Foo/Bar" → "scope_foo_bar"
 * - "foo/bar" → "foo_bar"
 * - "simple-plugin" → "simple-plugin"
 */
export const getNormalizedRemoteName = (name: string): string =>
  name.toLowerCase().replace(/^@/, "").replace(/\//g, "_");
