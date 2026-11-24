import type { Score } from '../types/score';
import { TICKS_PER_QUARTER } from '../core/constants';
import { midiToFrequency } from '../core/pitch';
import { buildPlaybackSequence, type ScheduledNote } from './scoreSequence';

export interface PlayheadPosition {
  measureIndex: number;
  tickInMeasure: number;
}

export interface PlaybackCallbacks {
  onPlayheadChange: (pos: PlayheadPosition | null) => void;
  onStateChange: (isPlaying: boolean) => void;
}

class PianoPlaybackEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isPlaying = false;
  private activeOscillators = new Set<OscillatorNode>();
  private schedulerTimer: number | null = null;
  private rafId: number | null = null;

  private events: ScheduledNote[] = [];
  private measureOrder: number[] = [];
  private measureTicks = 1920;
  private totalTicks = 0;
  private secondsPerTick = 0.5 / TICKS_PER_QUARTER;
  private startAudioTime = 0;
  private nextEventIndex = 0;
  private callbacks: PlaybackCallbacks | null = null;

  private ensureAudioContext(): { ctx: AudioContext; destination: AudioNode } {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      compressor.knee.setValueAtTime(18, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.004, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
      this.masterGain.connect(compressor);
      compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return { ctx: this.ctx, destination: this.masterGain! };
  }

  public play(score: Score, callbacks: PlaybackCallbacks, startMeasure = 0): void {
    this.stop();

    const seq = buildPlaybackSequence(score, {
      respectMuteSolo: true,
      expandRepeats: true,
      startMeasure,
    });

    if (seq.totalTicks <= 0) {
      callbacks.onStateChange(false);
      callbacks.onPlayheadChange(null);
      return;
    }

    const { ctx } = this.ensureAudioContext();

    this.events = seq.events;
    this.measureOrder = seq.measureOrder;
    this.measureTicks = seq.measureTicks;
    this.totalTicks = seq.totalTicks;
    this.secondsPerTick = 60 / Math.max(20, score.tempo) / TICKS_PER_QUARTER;
    this.startAudioTime = ctx.currentTime + 0.06;
    this.nextEventIndex = 0;
    this.callbacks = callbacks;
    this.isPlaying = true;

    callbacks.onStateChange(true);

    // Lookahead scheduler every 40ms (schedules 220ms ahead)
    const scheduleAheadSec = 0.22;
    const scheduleLoop = () => {
      if (!this.isPlaying || !this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const horizon = now + scheduleAheadSec;

      while (this.nextEventIndex < this.events.length) {
        const ev = this.events[this.nextEventIndex];
        const noteStartTime = this.startAudioTime + ev.startTick * this.secondsPerTick;
        if (noteStartTime > horizon) break;

        const durSec = Math.max(0.06, ev.durationTick * this.secondsPerTick);
        this.schedulePianoNote(
          this.ctx,
          this.masterGain,
          midiToFrequency(ev.midi),
          Math.max(now, noteStartTime),
          durSec,
          ev.velocity,
        );
        this.nextEventIndex++;
      }

      const endTime = this.startAudioTime + this.totalTicks * this.secondsPerTick + 0.15;
      if (now >= endTime) {
        this.stop();
      }
    };

    scheduleLoop();
    this.schedulerTimer = window.setInterval(scheduleLoop, 40);

    // Smooth playhead animation via requestAnimationFrame
    const updatePlayhead = () => {
      if (!this.isPlaying || !this.ctx) return;
      const elapsedSec = Math.max(0, this.ctx.currentTime - this.startAudioTime);
      const elapsedTicks = elapsedSec / this.secondsPerTick;

      if (elapsedTicks >= this.totalTicks) {
        this.stop();
        return;
      }

      const posIdx = Math.min(
        this.measureOrder.length - 1,
        Math.floor(elapsedTicks / this.measureTicks),
      );
      const tickInMeasure = elapsedTicks - posIdx * this.measureTicks;
      const measureIndex = this.measureOrder[posIdx] ?? 0;

      this.callbacks?.onPlayheadChange({
        measureIndex,
        tickInMeasure,
      });

      this.rafId = window.requestAnimationFrame(updatePlayhead);
    };
    this.rafId = window.requestAnimationFrame(updatePlayhead);
  }

  public stop(): void {
    const wasPlaying = this.isPlaying;
    this.isPlaying = false;

    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const now = this.ctx?.currentTime ?? 0;
    for (const osc of this.activeOscillators) {
      try {
        osc.stop(now + 0.02);
      } catch {
        // already stopped
      }
    }
    this.activeOscillators.clear();

    if (wasPlaying && this.callbacks) {
      this.callbacks.onPlayheadChange(null);
      this.callbacks.onStateChange(false);
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private schedulePianoNote(
    ctx: AudioContext,
    destination: AudioNode,
    freq: number,
    startTime: number,
    durationSec: number,
    velocity: number,
  ): void {
    const noteGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    // Brightness envelope (piano hammer attack -> warm decay)
    const brightFreq = Math.min(8000, freq * (4 + velocity * 4));
    const warmFreq = Math.min(3200, freq * 2.2);
    filter.frequency.setValueAtTime(brightFreq, startTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(180, warmFreq),
      startTime + Math.min(0.6, durationSec * 0.7),
    );

    // Amplitude envelope
    const peakGain = Math.max(0.05, velocity * 0.32);
    const sustainGain = peakGain * 0.42;
    const releaseStart = startTime + durationSec;
    const releaseEnd = releaseStart + 0.14;

    noteGain.gain.setValueAtTime(0.0001, startTime);
    noteGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.008);
    noteGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0005, sustainGain),
      startTime + Math.min(0.35, durationSec * 0.55 + 0.04),
    );
    noteGain.gain.setValueAtTime(Math.max(0.0005, sustainGain), releaseStart);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

    filter.connect(noteGain);
    noteGain.connect(destination);

    // Fundamental (triangle) + 2nd & 3rd harmonics (sine) for warm piano-like timbre
    const harmonics: { type: OscillatorType; ratio: number; gain: number }[] = [
      { type: 'triangle', ratio: 1, gain: 0.75 },
      { type: 'sine', ratio: 2, gain: 0.22 },
      { type: 'sine', ratio: 3, gain: 0.07 },
    ];

    for (const h of harmonics) {
      const osc = ctx.createOscillator();
      const hGain = ctx.createGain();
      osc.type = h.type;
      osc.frequency.setValueAtTime(freq * h.ratio, startTime);
      hGain.gain.setValueAtTime(h.gain, startTime);

      osc.connect(hGain);
      hGain.connect(filter);

      this.activeOscillators.add(osc);
      osc.onended = () => {
        this.activeOscillators.delete(osc);
      };

      osc.start(startTime);
      osc.stop(releaseEnd + 0.02);
    }
  }
}

export const pianoPlayer = new PianoPlaybackEngine();
