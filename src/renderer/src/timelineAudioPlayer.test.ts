import { describe, expect, it } from 'vitest';
import type { AudioAssetPlaybackData, AudioEditPlan } from '../../shared/types';
import { TimelineAudioPlayer } from './timelineAudioPlayer';

describe('TimelineAudioPlayer', () => {
  it('preloads clip media and starts active tracks from one timeline position', async () => {
    const harness = createHarness();
    const plan = createPlan([
      createClip('clp_host', 'trk_host', 'ast_host', 0, 5_000, 0),
      { ...createClip('clp_guest', 'trk_guest', 'ast_guest', 1_000, 6_000, 0), gainDb: -6 }
    ]);
    const player = new TimelineAudioPlayer(harness.dependencies);

    await player.prepare(plan, createPlaybackDataMap('ast_host', 'ast_guest'));
    await player.play(2_000);

    expect(harness.media).toHaveLength(2);
    expect(harness.media.map((item) => item.loadCount)).toEqual([1, 1]);
    expect(harness.media.map((item) => item.playCount)).toEqual([1, 1]);
    expect(harness.media.map((item) => item.currentTime)).toEqual([2, 3]);
    expect(harness.gains.map((item) => item.gain.value)).toEqual([1, expect.closeTo(10 ** (-6 / 20), 8)]);
  });

  it('does not play clips on muted tracks', async () => {
    const harness = createHarness();
    const plan = createPlan([createClip('clp_guest', 'trk_guest', 'ast_guest', 0, 5_000, 0)]);
    plan.tracks[1]!.muted = true;
    const player = new TimelineAudioPlayer(harness.dependencies);

    await player.prepare(plan, createPlaybackDataMap('ast_guest'));
    await player.play(0);

    expect(harness.media[0]?.playCount).toBe(0);
  });

  it('starts future clips once when the shared clock enters their range', async () => {
    const harness = createHarness();
    const plan = createPlan([
      createClip('clp_first', 'trk_host', 'ast_host', 0, 1_000, 0),
      createClip('clp_future', 'trk_host', 'ast_guest', 0, 2_000, 2_000)
    ]);
    const player = new TimelineAudioPlayer(harness.dependencies);

    await player.prepare(plan, createPlaybackDataMap('ast_host', 'ast_guest'));
    await player.play(0);
    expect(harness.media.map((item) => item.playCount)).toEqual([1, 0]);

    harness.context.currentTime = 2.1;
    harness.runFrame();
    harness.runFrame();

    expect(harness.media.map((item) => item.playCount)).toEqual([1, 1]);
    expect(harness.media[1]?.currentTime).toBeCloseTo(0.1, 5);
    expect(harness.times.at(-1)).toBeCloseTo(2_100, 5);
  });

  it('pauses and disposes every prepared media element', async () => {
    const harness = createHarness();
    const player = new TimelineAudioPlayer(harness.dependencies);
    await player.prepare(
      createPlan([createClip('clp_host', 'trk_host', 'ast_host', 0, 5_000, 0)]),
      createPlaybackDataMap('ast_host')
    );
    await player.play(0);

    player.pause();
    player.dispose();

    expect(harness.media[0]).toMatchObject({ pauseCount: 2, src: '' });
    expect(harness.context.closeCount).toBe(1);
  });
});

function createHarness() {
  const media: FakeMedia[] = [];
  const gains: FakeGain[] = [];
  const times: number[] = [];
  const context = new FakeContext(gains);
  let frame: (() => void) | null = null;
  return {
    context,
    gains,
    media,
    times,
    dependencies: {
      createContext: () => context,
      createMediaElement: () => {
        const item = new FakeMedia();
        media.push(item);
        return item;
      },
      requestFrame: (callback: () => void) => {
        frame = callback;
        return 1;
      },
      cancelFrame: () => {
        frame = null;
      },
      onTimeUpdate: (timeMs: number) => times.push(timeMs),
      onEnded: () => undefined
    },
    runFrame: () => {
      const callback = frame;
      frame = null;
      callback?.();
    }
  };
}

class FakeMedia {
  currentTime = 0;
  loadCount = 0;
  pauseCount = 0;
  playCount = 0;
  preload = '';
  src = '';

  load(): void {
    this.loadCount += 1;
  }

  pause(): void {
    this.pauseCount += 1;
  }

  async play(): Promise<void> {
    this.playCount += 1;
  }
}

class FakeGain {
  gain = { value: 1 };
  connect(): void {}
  disconnect(): void {}
}

class FakeSource {
  connect(): void {}
  disconnect(): void {}
}

class FakeContext {
  currentTime = 0;
  destination = {};
  closeCount = 0;

  constructor(private readonly gains: FakeGain[]) {}

  createMediaElementSource(): FakeSource {
    return new FakeSource();
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  async resume(): Promise<void> {}

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

function createPlaybackDataMap(...assetIds: string[]): Map<string, AudioAssetPlaybackData> {
  return new Map(
    assetIds.map((assetId) => [
      assetId,
      {
        schemaVersion: 'audioAssetPlayback.v1',
        projectId: 'prj_test',
        assetId,
        sourceUrl: `file:///${assetId}.wav`,
        proxyUrl: null,
        preferredUrl: `podcast-audio://asset/prj_test/${assetId}`,
        durationMs: 10_000,
        peaks: null,
        sourceHash: `hash_${assetId}`,
        loadedAt: '2026-07-15T00:00:00.000Z'
      }
    ])
  );
}

function createPlan(clips: AudioEditPlan['clips']): AudioEditPlan {
  return {
    schemaVersion: 'audioEditPlan.v1',
    id: 'pln_rough_cut',
    projectId: 'prj_test',
    title: '粗剪',
    timebase: { unit: 'ms', sampleRate: 48_000 },
    tracks: [
      { id: 'trk_host', name: '主持人', kind: 'voice', muted: false, solo: false, gainDb: 0 },
      { id: 'trk_guest', name: '嘉宾', kind: 'voice', muted: false, solo: false, gainDb: 0 }
    ],
    clips,
    processing: {
      loudnessNormalization: { enabled: true, targetLufs: -16 },
      denoise: { enabled: false, providerProfileId: null }
    },
    exportDefaults: { format: 'wav', sampleRate: 48_000, channels: 2 },
    updatedAt: '2026-07-15T00:00:00.000Z'
  };
}

function createClip(
  id: string,
  trackId: string,
  assetId: string,
  sourceStartMs: number,
  sourceEndMs: number,
  timelineStartMs: number
): AudioEditPlan['clips'][number] {
  return {
    id,
    trackId,
    assetId,
    sourceStartMs,
    sourceEndMs,
    timelineStartMs,
    gainDb: 0,
    fadeInMs: 20,
    fadeOutMs: 20
  };
}
