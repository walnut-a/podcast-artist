import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppSettings, CreateResearchTaskInput, ProviderProfilesFile } from '../../shared/types';
import { createProject, readResearchTaskResult } from './workspace';
import { startResearchTask } from './researchTaskRunner';

let tempDir: string;
let settings: AppSettings;
let providers: ProviderProfilesFile;
let input: CreateResearchTaskInput;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'podcast-artist-research-runner-'));
  settings = {
    schemaVersion: 'appSettings.v1',
    workspacePath: tempDir,
    defaultProviderProfileId: 'prv_test',
    defaultTranscriptionProfileId: null,
    tools: {
      ffmpeg: { path: null },
      ffprobe: { path: null },
      whisperCpp: { path: null, modelDirectory: null, defaultModelPath: null }
    }
  };
  providers = {
    schemaVersion: 'providerProfiles.v1',
    profiles: [{
      id: 'prv_test',
      kind: 'chat',
      displayName: '测试资料服务',
      baseUrl: 'https://example.com/v1',
      model: 'test-model',
      credentialSource: { kind: 'none' },
      capabilities: ['research']
    }]
  };
  const project = await createProject(settings, { title: '第 24 期 本地优先' });
  input = {
    projectId: project.id,
    userPrompt: '核实这一段说法',
    contextMarkdown: '用户正在查看：本地优先工具为什么重要。',
    title: '本地优先资料核实'
  };
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('research task runner', () => {
  it('returns a running task immediately and persists provider completion', async () => {
    const started = await startResearchTask(settings, providers, input, async () => '## 候选资料');
    expect(started.task.status).toBe('running');
    expect((await started.completion).status).toBe('completed');
    expect((await readResearchTaskResult(settings, { projectId: input.projectId, taskId: started.task.id })).resultMarkdown).toContain('候选资料');
  });

  it('persists provider failures instead of losing the task', async () => {
    const started = await startResearchTask(settings, providers, input, async () => { throw new Error('provider offline'); });
    const failed = await started.completion;
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('provider offline');
  });
});
