import { describe, expect, it } from 'vitest';
import type { AudioClip, AudioTrack } from '../../shared/types';
import { getActiveTimelineClipPlaybacks } from './audioTimeline';

function createClip(input: Partial<AudioClip> & Pick<AudioClip, 'id' | 'trackId' | 'assetId'>): AudioClip {
  return {
    sourceStartMs: 0,
    sourceEndMs: 1_000,
    timelineStartMs: 0,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...input
  };
}

function createTrack(input: Pick<AudioTrack, 'id' | 'name'> & Partial<AudioTrack>): AudioTrack {
  return {
    kind: 'voice',
    muted: false,
    solo: false,
    gainDb: 0,
    ...input
  };
}

describe('audio timeline playback helpers', () => {
  it('returns active unmuted clips at the playhead with source offsets', () => {
    const tracks = [
      createTrack({ id: 'track_1', name: '音轨 1' }),
      createTrack({ id: 'track_2', name: '音轨 2' }),
      createTrack({ id: 'track_3', name: '音轨 3', muted: true })
    ];
    const clips = [
      createClip({
        id: 'clip_1',
        trackId: 'track_1',
        assetId: 'asset_host',
        sourceStartMs: 5_000,
        sourceEndMs: 8_000,
        timelineStartMs: 1_000
      }),
      createClip({
        id: 'clip_2',
        trackId: 'track_2',
        assetId: 'asset_guest',
        sourceStartMs: 0,
        sourceEndMs: 2_000,
        timelineStartMs: 1_250
      }),
      createClip({
        id: 'clip_3',
        trackId: 'track_3',
        assetId: 'asset_muted',
        sourceStartMs: 0,
        sourceEndMs: 2_000,
        timelineStartMs: 1_000
      })
    ];

    expect(getActiveTimelineClipPlaybacks({ tracks, clips, playheadMs: 1_500 })).toEqual([
      {
        clipId: 'clip_1',
        assetId: 'asset_host',
        sourceOffsetMs: 5_500
      },
      {
        clipId: 'clip_2',
        assetId: 'asset_guest',
        sourceOffsetMs: 250
      }
    ]);
  });
});
