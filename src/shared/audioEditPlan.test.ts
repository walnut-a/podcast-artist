import { describe, expect, it } from 'vitest';
import type { AudioClip, AudioEditPlan } from './types';
import {
  MIN_SPLIT_CLIP_DURATION_MS,
  canSplitAudioClipAtTimelineMs,
  splitAudioClipInPlan
} from './audioEditPlan';

function createClip(input: Partial<AudioClip> & Pick<AudioClip, 'id' | 'trackId' | 'assetId'>): AudioClip {
  return {
    sourceStartMs: 0,
    sourceEndMs: 1_000,
    timelineStartMs: 0,
    gainDb: 0,
    fadeInMs: 20,
    fadeOutMs: 20,
    ...input
  };
}

function createPlan(): AudioEditPlan {
  return {
    schemaVersion: 'audioEditPlan.v1',
    id: 'pln_rough_cut',
    projectId: 'prj_test',
    title: 'Rough Cut',
    timebase: { unit: 'ms', sampleRate: 48_000 },
    tracks: [
      { id: 'trk_host', name: '主持人', kind: 'voice', muted: false, solo: false, gainDb: 0 },
      { id: 'trk_music', name: '音乐', kind: 'music', muted: false, solo: false, gainDb: -6 }
    ],
    clips: [
      createClip({
        id: 'clp_target',
        trackId: 'trk_host',
        assetId: 'ast_host',
        sourceStartMs: 1_000,
        sourceEndMs: 5_000,
        timelineStartMs: 2_000,
        gainDb: -3,
        fadeInMs: 20,
        fadeOutMs: 30
      }),
      createClip({
        id: 'clp_later',
        trackId: 'trk_host',
        assetId: 'ast_host',
        sourceStartMs: 5_000,
        sourceEndMs: 6_000,
        timelineStartMs: 6_000
      }),
      createClip({
        id: 'clp_music',
        trackId: 'trk_music',
        assetId: 'ast_music',
        sourceStartMs: 0,
        sourceEndMs: 8_000,
        timelineStartMs: 0
      })
    ],
    processing: {
      loudnessNormalization: { enabled: true, targetLufs: -16 },
      denoise: { enabled: false, providerProfileId: null }
    },
    exportDefaults: { format: 'wav', sampleRate: 48_000, channels: 2 },
    updatedAt: '2026-07-13T08:00:00.000Z'
  };
}

describe('splitAudioClipInPlan', () => {
  it('splits source time at the playhead without moving existing clips', () => {
    const original = createPlan();
    const result = splitAudioClipInPlan({
      plan: original,
      clipId: 'clp_target',
      timelineSplitMs: 3_500,
      rightClipId: 'clp_right',
      updatedAt: '2026-07-13T08:05:00.000Z'
    });

    expect(result.leftClipId).toBe('clp_target');
    expect(result.rightClipId).toBe('clp_right');
    expect(result.plan.clips.find((clip) => clip.id === 'clp_target')).toMatchObject({
      sourceStartMs: 1_000,
      sourceEndMs: 2_500,
      timelineStartMs: 2_000,
      gainDb: -3,
      fadeInMs: 20,
      fadeOutMs: 0
    });
    expect(result.plan.clips.find((clip) => clip.id === 'clp_right')).toMatchObject({
      trackId: 'trk_host',
      assetId: 'ast_host',
      sourceStartMs: 2_500,
      sourceEndMs: 5_000,
      timelineStartMs: 3_500,
      gainDb: -3,
      fadeInMs: 0,
      fadeOutMs: 30
    });
    expect(result.plan.clips.find((clip) => clip.id === 'clp_later')?.timelineStartMs).toBe(6_000);
    expect(result.plan.clips.find((clip) => clip.id === 'clp_music')?.timelineStartMs).toBe(0);
    expect(result.plan.updatedAt).toBe('2026-07-13T08:05:00.000Z');
    expect(original.clips.find((clip) => clip.id === 'clp_target')?.sourceEndMs).toBe(5_000);
    expect(original.clips.find((clip) => clip.id === 'clp_target')?.fadeOutMs).toBe(30);
  });

  it('uses the same inclusive 250ms boundary for eligibility and mutation', () => {
    const clip = createPlan().clips.find((item) => item.id === 'clp_target')!;
    expect(MIN_SPLIT_CLIP_DURATION_MS).toBe(250);
    expect(canSplitAudioClipAtTimelineMs(clip, 2_250)).toBe(true);
    expect(canSplitAudioClipAtTimelineMs(clip, 5_750)).toBe(true);
    expect(canSplitAudioClipAtTimelineMs(clip, 2_249)).toBe(false);
    expect(canSplitAudioClipAtTimelineMs(clip, 5_751)).toBe(false);
    expect(canSplitAudioClipAtTimelineMs(clip, Number.NaN)).toBe(false);
  });

  it('rejects invalid positions, missing clips, and duplicate right ids', () => {
    const plan = createPlan();
    expect(() =>
      splitAudioClipInPlan({
        plan,
        clipId: 'clp_target',
        timelineSplitMs: Number.NaN,
        rightClipId: 'clp_right',
        updatedAt: '2026-07-13T08:05:00.000Z'
      })
    ).toThrow('finite');
    expect(() =>
      splitAudioClipInPlan({
        plan,
        clipId: 'clp_missing',
        timelineSplitMs: 3_500,
        rightClipId: 'clp_right',
        updatedAt: '2026-07-13T08:05:00.000Z'
      })
    ).toThrow('not found');
    expect(() =>
      splitAudioClipInPlan({
        plan,
        clipId: 'clp_target',
        timelineSplitMs: 2_249,
        rightClipId: 'clp_right',
        updatedAt: '2026-07-13T08:05:00.000Z'
      })
    ).toThrow('250ms');
    expect(() =>
      splitAudioClipInPlan({
        plan,
        clipId: 'clp_target',
        timelineSplitMs: 3_500,
        rightClipId: 'clp_later',
        updatedAt: '2026-07-13T08:05:00.000Z'
      })
    ).toThrow('unique');
  });
});
