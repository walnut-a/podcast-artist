import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile } from '../../shared/types';
import { requestResearchMarkdown } from './openAiCompatibleProvider';

const profile: ProviderProfile = {
  id: 'prv_test',
  kind: 'chat',
  displayName: 'Test provider',
  baseUrl: 'http://localhost:11434/v1/',
  model: 'test-model',
  credentialSource: { kind: 'none' },
  capabilities: ['research']
};

afterEach(() => vi.unstubAllEnvs());

describe('requestResearchMarkdown', () => {
  it('posts prompt and context to chat completions', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const result = await requestResearchMarkdown(
      { profile, prompt: '核实这段', contextMarkdown: '原始文稿' },
      async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ choices: [{ message: { content: '## 核查结果' } }] }), { status: 200 });
      }
    );
    expect(result).toBe('## 核查结果');
    expect(requests[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(JSON.parse(String(requests[0]?.init.body))).toMatchObject({ model: 'test-model', stream: false });
  });

  it('reads bearer credentials from the configured environment variable', async () => {
    vi.stubEnv('PODCAST_ARTIST_TEST_KEY', 'secret');
    let authorization = '';
    await requestResearchMarkdown(
      { profile: { ...profile, credentialSource: { kind: 'environment', envVar: 'PODCAST_ARTIST_TEST_KEY' } }, prompt: 'p', contextMarkdown: 'c' },
      async (_url, init) => {
        authorization = new Headers(init?.headers).get('authorization') ?? '';
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      }
    );
    expect(authorization).toBe('Bearer secret');
  });

  it('rejects missing configuration and malformed provider responses', async () => {
    await expect(requestResearchMarkdown({ profile: { ...profile, model: null }, prompt: 'p', contextMarkdown: 'c' })).rejects.toThrow('model');
    await expect(
      requestResearchMarkdown(
        { profile, prompt: 'p', contextMarkdown: 'c' },
        async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })
      )
    ).rejects.toThrow('content');
  });
});
