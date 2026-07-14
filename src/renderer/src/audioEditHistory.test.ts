import { describe, expect, it } from 'vitest';
import type { AudioEditPlan } from '../../shared/types';
import {
  createAudioEditHistory,
  prepareAudioEditRedo,
  prepareAudioEditUndo,
  recordAudioEditPlanChange,
  syncRestoredAudioEditPlan
} from './audioEditHistory';

describe('audio edit history', () => {
  it('undoes and redoes recorded plans', () => {
    const first = createPlan('2026-07-14T00:00:00.000Z', '音轨 1');
    const second = createPlan('2026-07-14T00:00:01.000Z', '主持人');
    const recorded = recordAudioEditPlanChange(createAudioEditHistory(first), second);

    const undone = prepareAudioEditUndo(recorded);
    expect(undone?.present.tracks[0]?.name).toBe('音轨 1');
    expect(undone?.future).toEqual([second]);

    const redone = prepareAudioEditRedo(undone!);
    expect(redone?.present.tracks[0]?.name).toBe('主持人');
    expect(redone?.past).toEqual([first]);
  });

  it('clears redo entries when a new edit is recorded', () => {
    const first = createPlan('2026-07-14T00:00:00.000Z', '音轨 1');
    const second = createPlan('2026-07-14T00:00:01.000Z', '主持人');
    const alternate = createPlan('2026-07-14T00:00:02.000Z', '嘉宾');
    const undone = prepareAudioEditUndo(recordAudioEditPlanChange(createAudioEditHistory(first), second));

    const recorded = recordAudioEditPlanChange(undone!, alternate);

    expect(recorded.future).toEqual([]);
    expect(prepareAudioEditRedo(recorded)).toBeNull();
  });

  it('keeps only the latest 50 past snapshots', () => {
    let history = createAudioEditHistory(createPlan('2026-07-14T00:00:00.000Z', '0'));
    for (let index = 1; index <= 55; index += 1) {
      history = recordAudioEditPlanChange(
        history,
        createPlan(`2026-07-14T00:00:${String(index).padStart(2, '0')}.000Z`, String(index))
      );
    }

    expect(history.past).toHaveLength(50);
    expect(history.past[0]?.tracks[0]?.name).toBe('5');
  });

  it('syncs the persisted timestamp without losing redo entries', () => {
    const first = createPlan('2026-07-14T00:00:00.000Z', '音轨 1');
    const second = createPlan('2026-07-14T00:00:01.000Z', '主持人');
    const undone = prepareAudioEditUndo(recordAudioEditPlanChange(createAudioEditHistory(first), second));
    const persisted = { ...first, updatedAt: '2026-07-14T00:00:02.000Z' };

    const synced = syncRestoredAudioEditPlan(undone!, persisted);

    expect(synced.present.updatedAt).toBe(persisted.updatedAt);
    expect(synced.future).toEqual([second]);
  });
});

function createPlan(updatedAt: string, trackName: string): AudioEditPlan {
  return {
    schemaVersion: 'audioEditPlan.v1',
    id: 'pln_rough_cut',
    projectId: 'prj_test',
    title: '粗剪',
    timebase: { unit: 'ms', sampleRate: 48_000 },
    tracks: [
      {
        id: 'trk_1',
        name: trackName,
        kind: 'voice',
        muted: false,
        solo: false,
        gainDb: 0
      }
    ],
    clips: [],
    processing: {
      loudnessNormalization: { enabled: true, targetLufs: -16 },
      denoise: { enabled: false, providerProfileId: null }
    },
    exportDefaults: { format: 'wav', sampleRate: 48_000, channels: 2 },
    updatedAt
  };
}
