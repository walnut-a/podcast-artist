import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeJsonFile } from './jsonFile';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'podcast-artist-json-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('writeJsonFile', () => {
  it('uses unique temp files for concurrent writes', async () => {
    const filePath = path.join(tempDir, 'settings.json');

    await Promise.all([
      writeJsonFile(filePath, { value: 'first' }),
      writeJsonFile(filePath, { value: 'second' })
    ]);

    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as { value: string };
    expect(['first', 'second']).toContain(parsed.value);
  });
});
