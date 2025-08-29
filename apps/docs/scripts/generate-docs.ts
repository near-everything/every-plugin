import { generateFiles } from 'fumadocs-openapi';
import { openapi } from '../src/lib/openapi';

void generateFiles({
  input: openapi,
  output: './content/docs/api',
  // Enable description inclusion for better documentation
  includeDescription: true,
  // Group endpoints by tags for better organization
  groupBy: 'tag',
});
