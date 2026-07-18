import { describe, expect, it, vi } from 'vitest';
import type { LibraryAsset } from '../../shared/types';
import { resolveAudioAssetDurationMs } from './audioAssetDuration';

describe('resolveAudioAssetDurationMs', () => {
  it('uses existing library metadata without running analysis again', async () => {
    const analyze = vi.fn();

    await expect(resolveAudioAssetDurationMs(createAudioAsset(7_174), analyze)).resolves.toBe(7_174);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('analyzes an uninspected asset before returning its duration', async () => {
    const analyze = vi.fn().mockResolvedValue({ durationMs: 7_174 });

    await expect(resolveAudioAssetDurationMs(createAudioAsset(), analyze)).resolves.toBe(7_174);
    expect(analyze).toHaveBeenCalledOnce();
  });

  it('rejects invalid analysis duration instead of creating a 60 second placeholder clip', async () => {
    const analyze = vi.fn().mockResolvedValue({ durationMs: 0 });

    await expect(resolveAudioAssetDurationMs(createAudioAsset(), analyze)).rejects.toThrow('有效时长');
  });
});

function createAudioAsset(durationMs?: number): LibraryAsset {
  return {
    id: 'ast_audio',
    workspaceId: 'ws_audio',
    projectId: 'prj_audio',
    scope: 'project',
    kind: 'audio',
    originalFileName: 'recording.wav',
    originalPath: '/recording.wav',
    libraryPath: 'assets/audio/ast_audio/recording.wav',
    mimeType: 'audio/wav',
    sizeBytes: 1024,
    sha256: 'hash',
    importedAt: '2026-07-18T00:00:00.000Z',
    importedBy: 'user',
    metadata: durationMs ? { audio: { durationMs } } : {}
  };
}
