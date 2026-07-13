import type { AudioClip, AudioEditPlan, SplitAudioClipResult } from './types';

export const MIN_SPLIT_CLIP_DURATION_MS = 250;

export interface SplitAudioClipInPlanInput {
  plan: AudioEditPlan;
  clipId: string;
  timelineSplitMs: number;
  rightClipId: string;
  updatedAt: string;
}

export function canSplitAudioClipAtTimelineMs(clip: AudioClip, timelineSplitMs: number): boolean {
  if (!Number.isFinite(timelineSplitMs)) return false;
  const roundedSplitMs = Math.round(timelineSplitMs);
  const timelineEndMs = clip.timelineStartMs + clip.sourceEndMs - clip.sourceStartMs;
  return (
    roundedSplitMs - clip.timelineStartMs >= MIN_SPLIT_CLIP_DURATION_MS &&
    timelineEndMs - roundedSplitMs >= MIN_SPLIT_CLIP_DURATION_MS
  );
}

export function splitAudioClipInPlan(input: SplitAudioClipInPlanInput): SplitAudioClipResult {
  if (!Number.isFinite(input.timelineSplitMs)) {
    throw new Error('Split timeline position must be a finite number.');
  }

  const clip = input.plan.clips.find((item) => item.id === input.clipId);
  if (!clip) {
    throw new Error(`Audio clip not found: ${input.clipId}`);
  }

  const rightClipId = input.rightClipId.trim();
  if (!rightClipId || input.plan.clips.some((item) => item.id === rightClipId)) {
    throw new Error('Split right clip id must be unique.');
  }

  const timelineSplitMs = Math.round(input.timelineSplitMs);
  if (!canSplitAudioClipAtTimelineMs(clip, timelineSplitMs)) {
    throw new Error(`Split must leave at least ${MIN_SPLIT_CLIP_DURATION_MS}ms on both sides.`);
  }

  const sourceSplitMs = clip.sourceStartMs + timelineSplitMs - clip.timelineStartMs;
  const leftClip: AudioClip = {
    ...clip,
    sourceEndMs: sourceSplitMs,
    fadeOutMs: 0
  };
  const rightClip: AudioClip = {
    ...clip,
    id: rightClipId,
    sourceStartMs: sourceSplitMs,
    timelineStartMs: timelineSplitMs,
    fadeInMs: 0
  };
  const nextPlan: AudioEditPlan = {
    ...input.plan,
    clips: [...input.plan.clips.map((item) => (item.id === clip.id ? leftClip : item)), rightClip].sort(sortAudioClips),
    updatedAt: input.updatedAt
  };

  return {
    plan: nextPlan,
    leftClipId: leftClip.id,
    rightClipId: rightClip.id
  };
}

function sortAudioClips(a: AudioClip, b: AudioClip): number {
  if (a.trackId !== b.trackId) return a.trackId.localeCompare(b.trackId);
  if (a.timelineStartMs !== b.timelineStartMs) return a.timelineStartMs - b.timelineStartMs;
  return a.id.localeCompare(b.id);
}
