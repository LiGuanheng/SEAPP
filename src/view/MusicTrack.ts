/** 原创 E 小调循环：白天柔和钟琴与和弦，夜间加入低音节奏；按音频时间调度。 */
export class MusicTrack {
  private timer: ReturnType<typeof setInterval> | null = null;
  private voices = new Set<OscillatorNode>();
  private output: GainNode;
  private next = 0;
  private step = 0;
  private enabled = true;
  constructor(private context: AudioContext, master: GainNode, private night: boolean) {
    this.output = context.createGain(); this.output.gain.value = 0.34; this.output.connect(master);
  }
  setEnabled(value: boolean): void { this.enabled = value; this.output.gain.setTargetAtTime(value ? 0.34 : 0, this.context.currentTime, 0.08); }
  start(): void { if (this.timer) return; this.next = this.context.currentTime + 0.05; this.timer = setInterval(() => this.schedule(), 50); this.schedule(); }
  private note(midi: number, at: number, length: number, volume: number, type: OscillatorType): void {
    if (this.voices.size >= 24) return;
    const c = this.context, oscillator = c.createOscillator(), gain = c.createGain(); oscillator.type = type; oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + 0.035); gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain).connect(this.output); this.voices.add(oscillator);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + length + 0.03);
  }
  private schedule(): void {
    const c = this.context; if (c.state !== 'running') return;
    if (this.next < c.currentTime - 0.2) this.next = c.currentTime + 0.03;
    const melody = [64, 67, 71, 74, 71, 67, 66, 62, 64, 67, 72, 76, 74, 71, 67, 66, 62, 67, 71, 74, 79, 74, 71, 67, 62, 66, 69, 74, 72, 69, 66, 62];
    const chords = [[52, 55, 59], [48, 52, 55], [43, 47, 50], [50, 54, 57]];
    while (this.next < c.currentTime + 0.18) {
      if (this.enabled) {
        const i = this.step % 32, chord = chords[Math.floor(i / 8)];
        this.note(melody[i], this.next, this.night ? 0.7 : 1.2, 0.1, 'sine');
        if (i % 8 === 0) for (const n of chord) this.note(n, this.next, 3.1, 0.045, 'triangle');
        if (i % 4 === 0) this.note(chord[0] - 12, this.next, this.night ? 0.25 : 0.8, this.night ? 0.22 : 0.075, 'sine');
      }
      this.step++; this.next += this.night ? 0.34 : 0.43;
    }
  }
  destroy(): void { if (this.timer) clearInterval(this.timer); this.timer = null; for (const voice of this.voices) { voice.onended = null; try { voice.stop(); } catch { /* 已经结束的节点无需再次停止。 */ } voice.disconnect(); } this.voices.clear(); this.output.disconnect(); }
}
