/** Real-time adapter over the canonical manual engine. At most one tick is in flight. */
export class PracticeController {
  constructor({request, change = () => {}, error = () => {}, now = () => performance.now(),
    schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id)}) {
    Object.assign(this, {request, change, error, now, schedule, cancel});
    this.battle = null;
    this.running = false;
    this.busy = false;
    this.pending = null;
    this.realistic = false;
    this.catchingUp = false;
    this.repeatFast = false;
    this.speed = 1;
    this.timer = null;
    this.epoch = 0;
  }
  notify() { this.change(this); }
  clearTimer() { if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  pause(force = false) { if (this.realistic && !force) return; this.running = false; this.pending = null; this.clearTimer(); this.notify(); }
  resume() {
    if (this.running || this.busy || this.battle?.status !== 'in_progress') return;
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
    this.pause(true);
    this.realistic = !!payload.realistic;
    if (this.realistic) { this.speed = 1; this.repeatFast = false; }
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
    if (this.realistic && this.now() - this.deadline >= 500) return;
    const command = {action, slot};
    // Ready inputs belong to the next turn. During recovery, keep only the newest
    // input for 250 ms of battle time; never store an attack for a whole animation.
    const turnMs = 500 / this.speed;
    const nextTurn = this.deadline + Math.max(this.busy ? 1 : 0, Math.ceil((this.now() - this.deadline) / turnMs)) * turnMs;
    const expiresAt = this.allowed(command) ? Math.max(this.now(), nextTurn) : this.now() + 250 / this.speed;
    this.pending = {...command, expiresAt, targetTurn: nextTurn}; this.notify();
  }
  allowed(command) {
    const available = this.battle?.available;
    return command?.action === 'switch' ? available?.switch_slots.includes(command.slot) : !!available?.[command?.action];
  }
  async tick() {
    if (!this.running || this.busy || this.battle?.status !== 'in_progress') return;
    if (!this.realistic && this.now() - this.deadline > 1000) {
      this.pause(); this.error(new Error('Practice paused because the browser fell behind. Press Resume to continue.')); return;
    }
    this.busy = true;
    const epoch = this.epoch;
    // Catch up elapsed real time with waits, never a burst of stale attacks. Yield between batches.
    const steps = this.realistic ? Math.min(20, Math.max(1, Math.floor((this.now() - this.deadline) / 500) + 1)) : 1;
    this.catchingUp = steps > 1;
    if (this.catchingUp) this.pending = null;
    try {
      for (let i = 0; i < steps && this.running; i++) {
        const previous = this.battle;
        let command = {action: 'wait', slot: null};
        if (!this.catchingUp && this.pending && this.pending.targetTurn <= this.deadline) {
          // Judge expiry against the turn's scheduled time, allowing normal timer jitter.
          if (this.pending.expiresAt >= this.deadline) command = {action: this.pending.action, slot: this.pending.slot};
          this.pending = null;
        } else if (!this.realistic && this.repeatFast && (previous.available.fast ||
          (previous.player.on_field && previous.player.busy_until <= previous.elapsed + .5 && previous.player.lag_until <= previous.elapsed + .5))) command.action = 'fast';
        const battle = await this.request('practice/step', {
          session_id: previous.session_id, expected_tick: previous.tick, ...command,
        });
        if (epoch !== this.epoch) return;
        this.battle = battle;
        this.deadline += 500 / this.speed;
        if (battle.player.faints !== previous.player.faints || battle.player.slot !== previous.player.slot || battle.player.in_lobby !== previous.player.in_lobby)
          this.pending = null;
        if (battle.status !== 'in_progress') { this.running = false; this.pending = null; }
      }
    } catch (error) { this.pause(true); this.error(error); }
    finally {
      this.busy = false;
      this.catchingUp = false;
      this.notify(); this.arm();
    }
  }

  async end() {
    if (this.busy || this.battle?.status !== 'in_progress') return;
    this.pause(true); this.busy = true; this.notify();
    try {
      this.battle = await this.request('practice/stop', {session_id: this.battle.session_id, expected_tick: this.battle.tick});
    } catch (error) { this.error(error); }
    finally { this.busy = false; this.notify(); }
  }
  setSpeed(speed) {
    if (this.realistic || ![0.5, 1].includes(speed)) return;
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
