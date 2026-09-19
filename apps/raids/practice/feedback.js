/** Original synthesized cues: no recordings, downloads, or third-party sound assets. */
export const cues = {
  fast: [[430, 180, .07, 0, 'triangle', .18]],
  charged: [[160, 640, .23, 0, 'triangle', .22], [800, 380, .16, .15, 'sine', .12]],
  dodge: [[780, 220, .12, 0, 'sine', .12]],
  hit: [[100, 45, .13, 0, 'triangle', .22]],
  warning: [[260, 260, .1, 0, 'sine', .18], [340, 340, .1, .14, 'sine', .18]],
  ready: [[740, 740, .09, 0, 'sine', .12], [990, 990, .13, .09, 'sine', .12]],
  faint: [[300, 100, .35, 0, 'triangle', .2]],
  defeated: [[240, 180, .22, 0, 'triangle', .18], [160, 80, .36, .24, 'triangle', .18]],
  rejoin: [[330, 660, .2, 0, 'sine', .18]],
  victory: [[440, 440, .15, 0, 'sine', .2], [550, 550, .15, .14, 'sine', .2], [880, 880, .35, .28, 'sine', .2]],
};
const pulses = {charged:35, dodge:15, hit:25, ready:[15,40,15], faint:65, defeated:[65,70,65], rejoin:20, victory:[25,50,25,50,60]};
export function synthesize(context, output, name, voices = new Set()) {
  for (const [from,to,duration,delay,type,level] of cues[name] || []) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    const at = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain); gain.connect(output); voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + duration + .01);
  }
}
export class BattleFeedback {
  constructor({audio = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
    vibrate = pattern => globalThis.navigator?.vibrate?.(pattern), visible = () => !globalThis.document?.hidden} = {}) {
    Object.assign(this,{audio,vibrate,visible});
    this.sound = true; this.haptics = false; this.volume = .3;
    this.voices = new Set(); this.previous = null;
  }
  unlock() {
    if (!this.sound) return;
    try {
      if (!this.context) {
        this.context = this.audio(); this.master = this.context.createGain();
        this.master.gain.value = this.volume; this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* Unsupported or blocked audio must not interrupt battle controls. */ }
  }
  configure({sound = this.sound, haptics = this.haptics, volume = this.volume} = {}) {
    this.sound = sound; this.haptics = haptics; this.volume = Math.max(0,Math.min(1,volume));
    if (this.master) this.master.gain.value = sound ? this.volume : 0;
    if (!sound) this.silence();
    if (!haptics) { try { this.vibrate(0); } catch {} }
  }
  silence() {
    for (const voice of this.voices) { try { voice.stop(); } catch {} }
    this.voices.clear();
    try { this.vibrate(0); } catch {}
  }
  play(name) {
    if (!this.visible()) return;
    if (this.sound && this.context?.state === 'running') {
      try { synthesize(this.context,this.master,name,this.voices); } catch {}
    }
    if (this.haptics && pulses[name]) { try { this.vibrate(pulses[name]); } catch {} }
  }
  observe(battle, command = 'wait', silent = false) {
    const previous = this.previous; this.previous = battle;
    if (silent || !previous || previous.session_id !== battle.session_id) return;
    const p = battle.player, before = previous.player;
    if (battle.status === 'victory' && previous.status !== 'victory') { this.play('victory'); return; }
    if (battle.status === 'time_expired' && previous.status !== 'time_expired') { this.play('defeated'); return; }
    if (p.lobby_phase === 'defeated' && before.lobby_phase !== 'defeated') { this.play('defeated'); return; }
    if (p.faints > before.faints) { this.play('faint'); return; }
    if (['fast','charged','dodge'].includes(command)) this.play(command);
    if (before.in_lobby && !p.in_lobby) this.play('rejoin');
    if (p.slot === before.slot && p.hp < before.hp) this.play('hit');
    if (p.on_field && p.slot === before.slot && p.energy >= p.charged_energy && before.energy < before.charged_energy) this.play('ready');
    if (battle.boss.incoming_charged && battle.boss.hits_at !== previous.boss.hits_at) this.play('warning');
  }
}
