import type { AudioAssetPlaybackData, AudioClip, AudioEditPlan } from '../../shared/types';

interface TimelineMediaElement {
  currentTime: number;
  preload: string;
  src: string;
  load(): void;
  pause(): void;
  play(): Promise<void>;
}

interface TimelineSourceNode {
  connect(node: TimelineGainNode): void;
  disconnect(): void;
}

interface TimelineGainNode {
  gain: { value: number };
  connect(node: unknown): void;
  disconnect(): void;
}

interface TimelineAudioContext {
  currentTime: number;
  destination: unknown;
  createMediaElementSource(media: TimelineMediaElement): TimelineSourceNode;
  createGain(): TimelineGainNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface TimelineAudioPlayerDependencies {
  createContext(): TimelineAudioContext;
  createMediaElement(): TimelineMediaElement;
  requestFrame(callback: () => void): number;
  cancelFrame(frameId: number): void;
  onTimeUpdate(timeMs: number): void;
  onEnded(): void;
  onError?(error: unknown): void;
}

interface ClipMediaChain {
  clip: AudioClip;
  media: TimelineMediaElement;
  source: TimelineSourceNode;
  gain: TimelineGainNode;
  preferredUrl: string;
  playing: boolean;
}

export class TimelineAudioPlayer {
  private context: TimelineAudioContext | null = null;
  private plan: AudioEditPlan | null = null;
  private chains = new Map<string, ClipMediaChain>();
  private frameId: number | null = null;
  private playing = false;
  private timelineStartMs = 0;
  private contextStartSeconds = 0;
  private pausedTimeMs = 0;

  constructor(private readonly dependencies: TimelineAudioPlayerDependencies) {}

  activate(): void {
    void this.getContext()
      .resume()
      .catch((error) => {
        this.dependencies.onError?.(error);
        this.pause();
      });
  }

  async prepare(plan: AudioEditPlan, playbackDataByAssetId: Map<string, AudioAssetPlaybackData>): Promise<void> {
    this.pause();
    const context = this.getContext();
    const nextChains = new Map<string, ClipMediaChain>();

    for (const clip of plan.clips) {
      const playbackData = playbackDataByAssetId.get(clip.assetId);
      if (!playbackData) {
        throw new Error(`Playback data is missing for audio asset ${clip.assetId}.`);
      }
      const existing = this.chains.get(clip.id);
      if (existing && existing.preferredUrl === playbackData.preferredUrl) {
        existing.clip = clip;
        existing.gain.gain.value = gainDbToLinear(clip.gainDb + (plan.tracks.find((track) => track.id === clip.trackId)?.gainDb ?? 0));
        nextChains.set(clip.id, existing);
        continue;
      }

      if (existing) this.disposeChain(existing);
      const media = this.dependencies.createMediaElement();
      media.preload = 'auto';
      media.src = playbackData.preferredUrl;
      const source = context.createMediaElementSource(media);
      const gain = context.createGain();
      gain.gain.value = gainDbToLinear(clip.gainDb + (plan.tracks.find((track) => track.id === clip.trackId)?.gainDb ?? 0));
      source.connect(gain);
      gain.connect(context.destination);
      media.load();
      nextChains.set(clip.id, {
        clip,
        media,
        source,
        gain,
        preferredUrl: playbackData.preferredUrl,
        playing: false
      });
    }

    this.chains.forEach((chain, clipId) => {
      if (!nextChains.has(clipId)) this.disposeChain(chain);
    });
    this.chains = nextChains;
    this.plan = plan;
    this.pausedTimeMs = Math.min(this.pausedTimeMs, this.durationMs());
  }

  async play(startMs = this.pausedTimeMs): Promise<void> {
    const context = this.getContext();
    if (!this.plan) throw new Error('Timeline audio player is not prepared.');
    this.activate();
    this.stopMedia();
    this.cancelFrame();
    this.timelineStartMs = this.clampTime(startMs);
    this.pausedTimeMs = this.timelineStartMs;
    this.contextStartSeconds = context.currentTime;
    this.playing = true;
    this.syncMediaInBackground(this.timelineStartMs);
    if (this.timelineStartMs >= this.durationMs()) {
      this.finish();
      return;
    }
    this.scheduleFrame();
  }

  pause(): void {
    if (this.playing) {
      this.pausedTimeMs = this.currentTimeMs();
    }
    this.playing = false;
    this.stopMedia();
    this.cancelFrame();
    this.dependencies.onTimeUpdate(this.pausedTimeMs);
  }

  async seek(timeMs: number): Promise<void> {
    const boundedTimeMs = this.clampTime(timeMs);
    if (this.playing) {
      await this.play(boundedTimeMs);
      return;
    }
    this.pausedTimeMs = boundedTimeMs;
    this.stopMedia();
    this.dependencies.onTimeUpdate(boundedTimeMs);
  }

  currentTimeMs(): number {
    if (!this.playing || !this.context) return this.pausedTimeMs;
    return this.clampTime(this.timelineStartMs + (this.context.currentTime - this.contextStartSeconds) * 1000);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    this.playing = false;
    this.stopMedia();
    this.cancelFrame();
    this.chains.forEach((chain) => this.disposeChain(chain));
    this.chains.clear();
    this.plan = null;
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
  }

  private getContext(): TimelineAudioContext {
    this.context ??= this.dependencies.createContext();
    return this.context;
  }

  private scheduleFrame(): void {
    this.frameId = this.dependencies.requestFrame(() => this.tick());
  }

  private tick(): void {
    if (!this.playing) return;
    const timeMs = this.currentTimeMs();
    if (timeMs >= this.durationMs()) {
      this.finish();
      return;
    }
    this.dependencies.onTimeUpdate(timeMs);
    this.syncMediaInBackground(timeMs);
    this.scheduleFrame();
  }

  private syncMediaInBackground(timeMs: number): void {
    void this.syncMedia(timeMs).catch((error) => {
      this.dependencies.onError?.(error);
      this.pause();
    });
  }

  private async syncMedia(timeMs: number): Promise<void> {
    if (!this.plan) return;
    const trackById = new Map(this.plan.tracks.map((track) => [track.id, track]));
    const starts: Promise<void>[] = [];
    this.chains.forEach((chain) => {
      const clip = chain.clip;
      const track = trackById.get(clip.trackId);
      const clipDurationMs = Math.max(0, clip.sourceEndMs - clip.sourceStartMs);
      const clipEndMs = clip.timelineStartMs + clipDurationMs;
      const shouldPlay = !track?.muted && timeMs >= clip.timelineStartMs && timeMs < clipEndMs;
      if (shouldPlay && !chain.playing) {
        chain.media.currentTime = Math.max(0, (clip.sourceStartMs + timeMs - clip.timelineStartMs) / 1000);
        chain.playing = true;
        starts.push(
          chain.media.play().catch((error) => {
            chain.playing = false;
            throw error;
          })
        );
      } else if (!shouldPlay && chain.playing) {
        chain.media.pause();
        chain.playing = false;
      }
    });
    await Promise.all(starts);
  }

  private finish(): void {
    this.pausedTimeMs = this.durationMs();
    this.playing = false;
    this.stopMedia();
    this.cancelFrame();
    this.dependencies.onTimeUpdate(this.pausedTimeMs);
    this.dependencies.onEnded();
  }

  private stopMedia(): void {
    this.chains.forEach((chain) => {
      if (chain.playing) chain.media.pause();
      chain.playing = false;
    });
  }

  private cancelFrame(): void {
    if (this.frameId === null) return;
    this.dependencies.cancelFrame(this.frameId);
    this.frameId = null;
  }

  private disposeChain(chain: ClipMediaChain): void {
    chain.media.pause();
    chain.media.src = '';
    chain.source.disconnect();
    chain.gain.disconnect();
  }

  private durationMs(): number {
    return Math.max(
      0,
      ...(this.plan?.clips.map((clip) => clip.timelineStartMs + Math.max(0, clip.sourceEndMs - clip.sourceStartMs)) ?? [])
    );
  }

  private clampTime(timeMs: number): number {
    return Math.min(Math.max(0, timeMs), this.durationMs());
  }
}

function gainDbToLinear(gainDb: number): number {
  return Math.min(1, Math.max(0, 10 ** (gainDb / 20)));
}
