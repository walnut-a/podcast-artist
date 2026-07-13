import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('documents research task controls', () => {
  it('disables the task-start button when no project is selected', async () => {
    const source = await readFile(new URL('./App.tsx', import.meta.url), 'utf8');

    expect(source).toMatch(
      /disabled=\{[^}]*!currentProjectId[^}]*isSubmittingTask[^}]*!selectedProviderProfileId[^}]*!taskPrompt\.trim\(\)[^}]*\}/
    );
  });
});
