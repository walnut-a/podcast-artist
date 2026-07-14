import { describe, expect, it } from 'vitest';
import { createAudioProtocolRequestHandler, createAudioProtocolUrl, parseAudioProtocolUrl } from './audioProtocol';

describe('audio protocol', () => {
  it('round-trips registered project and asset ids', () => {
    const url = createAudioProtocolUrl({ projectId: 'prj_一', assetId: 'ast_1' });

    expect(url).toBe('podcast-audio://asset/prj_%E4%B8%80/ast_1');
    expect(parseAudioProtocolUrl(url)).toEqual({ projectId: 'prj_一', assetId: 'ast_1' });
  });

  it('rejects paths, traversal, query strings, fragments, and the wrong host', () => {
    expect(parseAudioProtocolUrl('podcast-audio://asset/prj_1/%2E%2E%2Fsecret')).toBeNull();
    expect(parseAudioProtocolUrl('podcast-audio://asset/prj_1/ast_1?path=/tmp/a.wav')).toBeNull();
    expect(parseAudioProtocolUrl('podcast-audio://asset/prj_1/ast_1#fragment')).toBeNull();
    expect(parseAudioProtocolUrl('podcast-audio://files/prj_1/ast_1')).toBeNull();
  });

  it('rejects invalid ids before creating a URL', () => {
    expect(() => createAudioProtocolUrl({ projectId: '../project', assetId: 'ast_1' })).toThrow('project');
    expect(() => createAudioProtocolUrl({ projectId: 'prj_1', assetId: '' })).toThrow('asset');
  });

  it('resolves valid requests and keeps invalid URLs away from the filesystem resolver', async () => {
    const resolved: string[] = [];
    const handler = createAudioProtocolRequestHandler({
      resolvePath: async (input) => {
        resolved.push(`${input.projectId}/${input.assetId}`);
        return '/workspace/audio.wav';
      },
      fetchFile: async (filePath) => new Response(filePath)
    });

    const valid = await handler(new Request('podcast-audio://asset/prj_1/ast_1'));
    const invalid = await handler(new Request('podcast-audio://files/prj_1/ast_1'));

    expect(await valid.text()).toBe('/workspace/audio.wav');
    expect(invalid.status).toBe(400);
    expect(resolved).toEqual(['prj_1/ast_1']);
  });

  it('returns not found when a registered asset can no longer be resolved', async () => {
    const handler = createAudioProtocolRequestHandler({
      resolvePath: async () => {
        throw new Error('missing');
      },
      fetchFile: async () => new Response('unreachable')
    });

    expect((await handler(new Request('podcast-audio://asset/prj_1/ast_1'))).status).toBe(404);
  });
});
