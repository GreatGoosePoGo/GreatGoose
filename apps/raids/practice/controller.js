/** Real-time adapter over the canonical manual engine. At most one tick is in flight. */
export class PracticeController {
  constructor({request, change = () => {}, error = () => {}, now = () => performance.now(),
    schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id)}) {
    Object.assign(this, {request, change, error, now, schedule, cancel});
    this.battle = null;
    this.running = false;
    this.busy = false;
    this.pending = null;
    this.repeatFast = false;
    this.speed = 1;
    this.timer = null;
    this.epoch = 0;
  }
  notify() { this.change(this); }
  clearTimer() { if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  pause() { this.running = false; this.pending = null; this.clearTimer(); this.notify(); }
  resume() {
    if (this.busy || this.battle?.status !== 'in_progress') return;
    this.running = true;
    this.deadline = this.now() + 500 / this.speed;
    this.arm(); this.notify();
  }
  arm() {
    this.clearTimer();
    if (this.running) this.timer = this.schedule(() => this.tick(), Math.max(0, this.deadline - this.now()));
  }
  async start(payload) {
    if (this.busy) return false;
    this.pause();
    this.busy = true; this.notify();
    const epoch = ++this.epoch;
    try {
      const battle = await this.request('practice/start', payload);
      if (epoch !== this.epoch) return false;
      this.battle = battle;
      this.setup = {...structuredClone(payload), random_seed: battle.seed};
      this.busy = false;
      this.resume();
      return true;
    } catch (error) {
      this.error(error);
      return false;
    } finally { this.busy = false; this.notify(); }
  }
  queue(action, slot = null) {
    if (!this.running || this.battle?.status !== 'in_progress') return;
    this.pending = {action, slot, incomingAt: action === 'dodge' ? this.battle.boss.hits_at : null}; this.notify();
  }
  allowed(command) {
    const available = this.battle?.available;
    return command?.action === 'switch' ? available?.switch_slots.includes(command.slot) : !!available?.[command?.action];
  }
  async tick() {
    if (!this.running || this.busy || this.battle?.status !== 'in_progress') return;
    // A suspended browser must never replay a burst of missed ticks.
    if (this.now() - this.deadline > 1000) {
      this.pause(); this.error(new Error('Practice paused because the browser fell behind. Press Resume to continue.')); return;
    }
    this.busy = true;
    const previous = this.battle, epoch = this.epoch;
    if (this.pending?.action === 'dodge' && this.pending.incomingAt !== previous.boss.hits_at) this.pending = null;
    let command = {action: 'wait', slot: null};
    if (this.pending) {
      if (this.allowed(this.pending)) { command = this.pending; this.pending = null; }
      else if (this.pending.action === 'dodge' && !previous.boss.incoming) this.pending = null;
    } else if (this.repeatFast && previous.available.fast) command.action = 'fast';
    try {
      const battle = await this.request('practice/step', {
        session_id: previous.session_id, expected_tick: previous.tick, ...command,
      });
      if (epoch !== this.epoch) return;
      this.battle = battle;
      if (battle.player.faints !== previous.player.faints || battle.player.slot !== previous.player.slot || battle.player.in_lobby !== previous.player.in_lobby)
        this.pending = null;
      if (battle.status !== 'in_progress') { this.running = false; this.pending = null; }
    } catch (error) { this.pause(); this.error(error); }
    finally {
      this.busy = false;
      this.deadline += 500 / this.speed;
      this.notify(); this.arm();
    }
  }
  async end() {
    if (this.busy || this.battle?.status !== 'in_progress') return;
    this.pause(); this.busy = true; this.notify();
    try {
      this.battle = await this.request('practice/stop', {session_id: this.battle.session_id, expected_tick: this.battle.tick});
    } catch (error) { this.error(error); }
    finally { this.busy = false; this.notify(); }
  }
  setSpeed(speed) {
    if (![0.5, 1].includes(speed)) return;
    this.speed = speed;
    if (this.running && !this.busy) { this.deadline = this.now() + 500 / speed; this.arm(); }
  }
}

/** A drag in any direction dodges once. A swipe never also produces a fast tap. */
export function installBattleGestures(surface, {enabled, tap, swipe}) {
  let gesture = null;
  const controls = 'button, a, input, select, textarea, label, summary, dialog';
  surface.addEventListener('pointerdown', event => {
    if (!event.isPrimary) { gesture = null; return; }
    if (!enabled() || event.button !== 0 || event.target.closest(controls)) return;
    gesture = {id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, swiped: false};
    surface.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  const move = event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture.distance = Math.max(gesture.distance, Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y));
    if (!gesture.swiped && gesture.distance >= 28) {
      gesture.swiped = true;
      if (enabled()) swipe();
    }
  };
  surface.addEventListener('pointermove', move);
  surface.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    move(event);
    if (!gesture.swiped && gesture.distance < 12 && enabled()) tap();
    gesture = null;
  });
  for (const type of ['pointercancel', 'lostpointercapture']) surface.addEventListener(type, () => { gesture = null; });
}
