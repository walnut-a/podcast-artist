import { describe, expect, it, vi } from 'vitest';
import { processImportedAudioAsset } from './audioImportProcessing';

describe('processImportedAudioAsset', () => {
  it('analyzes first, then generates proxy and peaks', async () => {
    const calls: string[] = [];
    const dependencies = {
      analyze: vi.fn(async () => {
        calls.push('analyze');
      }),
      generateProxy: vi.fn(async () => {
        calls.push('proxy');
      }),
      generatePeaks: vi.fn(async () => {
        calls.push('peaks');
      })
    };

    await processImportedAudioAsset({ projectId: 'prj_audio', assetId: 'ast_audio' }, dependencies);

    expect(calls[0]).toBe('analyze');
    expect(calls.slice(1).sort()).toEqual(['peaks', 'proxy']);
    expect(dependencies.generateProxy).toHaveBeenCalledOnce();
    expect(dependencies.generatePeaks).toHaveBeenCalledWith({
      projectId: 'prj_audio',
      assetId: 'ast_audio',
      pointsPerSecond: 20
    });
  });

  it('does not start cache generation when analysis fails', async () => {
    const dependencies = {
      analyze: vi.fn().mockRejectedValue(new Error('ffprobe unavailable')),
      generateProxy: vi.fn(),
      generatePeaks: vi.fn()
    };

    await expect(
      processImportedAudioAsset({ projectId: 'prj_audio', assetId: 'ast_audio' }, dependencies)
    ).rejects.toThrow('ffprobe unavailable');
    expect(dependencies.generateProxy).not.toHaveBeenCalled();
    expect(dependencies.generatePeaks).not.toHaveBeenCalled();
  });
});

