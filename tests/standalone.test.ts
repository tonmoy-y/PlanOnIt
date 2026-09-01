import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('standalone root entry',()=>{
  it('contains the production app without external file assets',()=>{
    const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
    expect(html).toContain('<style>');expect(html).toContain('document.modelContext');
    expect(html).not.toMatch(/<script[^>]+src=/i);expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet/i);
    expect(html.length).toBeGreaterThan(250_000);
  });
});
