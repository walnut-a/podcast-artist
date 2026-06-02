import { describe, expect, it } from 'vitest';
import { slugifyProjectTitle } from './ids';

describe('slugifyProjectTitle', () => {
  it('keeps readable unicode project names', () => {
    expect(slugifyProjectTitle('第 24 期：本地优先的创作工具')).toBe('第-24-期-本地优先的创作工具');
  });

  it('falls back when the title has no usable characters', () => {
    expect(slugifyProjectTitle('---')).toMatch(/^project-\d{4}-\d{2}-\d{2}$/);
  });
});
