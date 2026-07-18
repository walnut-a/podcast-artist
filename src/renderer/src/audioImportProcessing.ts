import type { AudioAssetProcessingInput, GenerateAudioPeaksInput } from '../../shared/types';

interface AudioImportProcessingDependencies {
  analyze(input: AudioAssetProcessingInput): Promise<unknown>;
  generateProxy(input: AudioAssetProcessingInput): Promise<unknown>;
  generatePeaks(input: GenerateAudioPeaksInput): Promise<unknown>;
}

export async function processImportedAudioAsset(
  input: AudioAssetProcessingInput,
  dependencies: AudioImportProcessingDependencies
): Promise<void> {
  await dependencies.analyze(input);
  await Promise.all([
    dependencies.generateProxy(input),
    dependencies.generatePeaks({ ...input, pointsPerSecond: 20 })
  ]);
}

