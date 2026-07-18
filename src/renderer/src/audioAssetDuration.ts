import type { LibraryAsset } from '../../shared/types';

interface AudioDurationAnalysis {
  durationMs: number;
}

export async function resolveAudioAssetDurationMs(
  asset: LibraryAsset,
  analyze: () => Promise<AudioDurationAnalysis>
): Promise<number> {
  const existingDurationMs = readAudioAssetDurationMs(asset);
  if (existingDurationMs !== null) return existingDurationMs;

  const analysis = await analyze();
  const durationMs = Number(analysis.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('音频分析没有返回有效时长。');
  }
  return Math.round(durationMs);
}

function readAudioAssetDurationMs(asset: LibraryAsset): number | null {
  const audioMetadata = asset.metadata.audio as { durationMs?: unknown } | undefined;
  const durationMs = Number(audioMetadata?.durationMs);
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : null;
}
