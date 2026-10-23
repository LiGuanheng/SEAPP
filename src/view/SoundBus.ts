import type { NightEvent } from '../core/night-world.ts';
import type { CombatEvent } from '../core/types.ts';
import { MusicTrack } from './MusicTrack.ts';

/** 原创 Web Audio 音色；仅在用户操作后解锁，不依赖外部音频文件。 */
export class SoundBus {
  private static preference = false;
  private static initialized = false;
  private static musicPreference = false;
  muted = false;
  musicMuted = false;
  private music: MusicTrack | null = null;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private drone: OscillatorNode | null = null;
  private voices = 0;
  private lastShot = -1;
  private paused = false;
  private ambient: boolean;
  constructor(ambient = true) {
    this.ambient = ambient;
    if (!SoundBus.initialized) {
      try { const saved = localStorage.getItem('last-light.sound-muted'); if (saved !== null) SoundBus.preference = saved === '1'; } catch { /* 存储不可用时保留本次会话偏好。 */ }
      try { SoundBus.musicPreference = localStorage.getItem('last-light.music-muted') === '1'; } catch { /* 使用会话设置。 */ }
      SoundBus.initialized = true;
    }
    this.muted = SoundBus.preference;
    this.musicMuted = SoundBus.musicPreference;
  }
  unlock(): void {
    if (this.muted || this.paused) return;
    try {
      if (!this.context) {
        this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = 0.18; this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        this.music = new MusicTrack(this.context, this.master, this.ambient); this.music.setEnabled(!this.musicMuted);
        const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        if (this.ambient) {
          this.drone = this.context.createOscillator(); this.drone.frequency.value = 55;
          const gain = this.context.createGain(); gain.gain.value = 0.045; this.drone.connect(gain).connect(this.master); this.drone.start();
        }
      }
      void this.context.resume().then(() => { if (!this.paused && !this.muted) this.music?.start(); }).catch(() => {});
    } catch { this.muted = true; }
  }
  toggle(): void { this.muted = !this.muted; SoundBus.preference = this.muted; try { localStorage.setItem('last-light.sound-muted', this.muted ? '1' : '0'); } catch { /* 不影响战斗与静音。 */ } if (this.muted) { if (this.context) void this.context.suspend().catch(() => {}); } else this.unlock(); }
  toggleMusic(): void { this.musicMuted = !this.musicMuted; SoundBus.musicPreference = this.musicMuted; this.music?.setEnabled(!this.musicMuted); try { localStorage.setItem('last-light.music-muted', this.musicMuted ? '1' : '0'); } catch { /* 会话内仍可切换。 */ } this.unlock(); }
  pause(value: boolean): void { if (this.paused === value) return; this.paused = value; if (value && this.context) void this.context.suspend().catch(() => {}); else if (!value) this.unlock(); }
  private sound(kind: 'fire' | 'explosion' | 'hit' | 'wave' | 'reload' | 'pickup'): void {
    const c = this.context;
    if (!c || c.state !== 'running' || this.muted || this.paused || !this.master || !this.noise || this.voices >= 8) return;
    if (kind === 'fire' && c.currentTime - this.lastShot < 0.055) return;
    if (kind === 'fire') this.lastShot = c.currentTime;
    this.voices++;
    const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(); source.buffer = this.noise;
    const duration = kind === 'explosion' ? 0.65 : kind === 'wave' ? 0.4 : kind === 'pickup' ? 0.16 : 0.06;
    filter.type = 'lowpass'; filter.frequency.value = kind === 'explosion' ? 450 : kind === 'wave' ? 170 : kind === 'hit' ? 1000 : 2200;
    if (kind === 'reload' || kind === 'pickup') { filter.type = 'bandpass'; filter.frequency.setValueAtTime(kind === 'pickup' ? 1800 : 850, c.currentTime); filter.frequency.exponentialRampToValueAtTime(kind === 'pickup' ? 3600 : 400, c.currentTime + duration); }
    gain.gain.setValueAtTime(kind === 'explosion' ? 0.8 : kind === 'wave' ? 0.35 : 0.2, c.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master); source.onended = () => { this.voices--; source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(); source.stop(c.currentTime + duration);
  }
  handle(events: readonly NightEvent[]): void {
    for (const e of events) if (e.type === 'fire' || e.type === 'explosion' || e.type === 'wave') this.sound(e.type === 'fire' && e.projectile === 'arrow' ? 'reload' : e.type);
    else if (e.type === 'boss' || e.type === 'cast') this.sound('wave');
    else if (e.type === 'boss-defeated') this.sound('pickup');
    else if (e.type === 'swing') this.sound('reload');
    else if (e.type === 'lamp-hit' || e.type === 'unit-death') this.sound('hit');
  }
  combat(events: readonly CombatEvent[]): void {
    for (const e of events) if (e.type === 'shot') this.sound('fire');
    else if (e.type === 'ally-shot' || e.type === 'swing') this.sound('reload');
    else if (e.type === 'hurt') this.sound('hit');
    else if (e.type === 'reload' || e.type === 'reloaded') this.sound('reload');
  }
  pickup(): void { this.sound('pickup'); }
  destroy(): void { this.music?.destroy(); this.music = null; this.drone?.stop(); if (this.context) void this.context.close().catch(() => {}); this.context = null; }
}
