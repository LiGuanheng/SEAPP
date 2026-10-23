import type { Settings } from '../game/types.ts';

export class GameAudio {
  private context: AudioContext | null = null;
  play(kind: 'build' | 'pulse' | 'click' | 'win', settings: Settings): void {
    if (settings.muted || settings.volume === 0) return;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      void context.resume().catch(() => {});
      const oscillator = context.createOscillator(), gain = context.createGain();
      const now = context.currentTime;
      const frequency = { build: 520, pulse: 120, click: 680, win: 880 }[kind];
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'pulse' ? 440 : frequency * 0.65, now + 0.18);
      gain.gain.setValueAtTime(settings.volume * 0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now); oscillator.stop(now + 0.23);
    } catch { /* 音频不可用时不影响游戏。 */ }
  }
}
