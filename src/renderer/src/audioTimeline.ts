import type { AudioClip, AudioTrack } from '../../shared/types';

export interface ActiveTimelineClipPlayback {
  clipId: string;
  assetId: string;
  sourceOffsetMs: number;
}

export function getActiveTimelineClipPlaybacks(input: {
  tracks: AudioTrack[];
  clips: AudioClip[];
  playheadMs: number;
}): ActiveTimelineClipPlayback[] {
  const trackById = new Map(input.tracks.map((track) => [track.id, track]));
  return input.clips
    .filter((clip) => {
      const track = trackById.get(clip.trackId);
      if (!track || track.muted) return false;
      const clipEndMs = clip.timelineStartMs + clip.sourceEndMs - clip.sourceStartMs;
      return input.playheadMs >= clip.timelineStartMs && input.playheadMs < clipEndMs;
    })
    .sort((a, b) => a.timelineStartMs - b.timelineStartMs || a.trackId.localeCompare(b.trackId))
    .map((clip) => ({
      clipId: clip.id,
      assetId: clip.assetId,
      sourceOffsetMs: clip.sourceStartMs + input.playheadMs - clip.timelineStartMs
    }));
}
