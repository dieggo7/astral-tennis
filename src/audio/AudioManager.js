/**
 * Áudio do jogo, 100% gerado por código (Web Audio API): não há arquivos de som, então não há
 * direitos autorais para checar e o build continua pequeno.
 *
 *  - Efeitos: um som para cada evento da simulação (`onEvent`).
 *  - Música: trilha ambiente gerada ao vivo (acordes suaves + notas de harpa com eco) que fica um
 *    pouco mais agitada conforme o orbe acelera.
 *  - Controles: botão de som + volume (canto superior esquerdo) e tecla M para silenciar.
 *  - Autoplay: os navegadores só liberam áudio depois do 1º toque/clique/tecla; o som começa aí.
 *  - Gancho para anúncios: `setAdMuted(true/false)` (para o SDK do CrazyGames).
 */
const STORAGE_KEY = "astral-audio";
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // número MIDI -> Hz
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

// Progressão da música: Am - F - C - G (notas MIDI de cada acorde, grave -> agudo)
const CHORDS = [
  [45, 52, 57, 60],
  [41, 48, 53, 57],
  [48, 55, 60, 64],
  [43, 50, 55, 59],
];
const PENTATONIC = [69, 72, 74, 76, 79, 81, 84]; // A menor pentatônica (notas da "harpa")

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.muted = false;
    this.adMuted = false;
    this.volume = 0.7;
    this.active = 0;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.chordIndex = 0;
    this.nextChordAt = 0;
    this.nextNoteAt = 0;
    this.musicTimer = null;
    this.noiseBuffer = null;
    this.load();
    if (typeof document === "undefined") return;
    this.buildUi();
    const unlock = () => this.unlock();
    for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
    this.unlockHandler = unlock;
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyM" && !e.repeat) this.toggleMute();
    });
    // som de clique nos botões do menu/HUD (não nos botões de jogo do toque)
    document.addEventListener(
      "click",
      (e) => {
        const button = e.target.closest?.("button");
        if (button && !button.classList.contains("touch-btn") && !button.closest(".audio-ui")) this.ui();
      },
      true,
    );
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend?.();
      else if (this.unlocked) this.ctx.resume?.();
    });
  }

  // ---------------------------------------------------------------- estado e preferências
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        this.muted = !!saved.muted;
        this.volume = clamp(Number(saved.volume ?? 0.7), 0, 1);
      }
    } catch {
      /* sem storage */
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: this.muted, volume: this.volume }));
    } catch {
      /* sem storage */
    }
  }

  setMuted(value) {
    this.muted = !!value;
    this.applyVolume();
    this.save();
    this.refreshUi();
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.volume > 0 && this.muted) this.muted = false;
    this.applyVolume();
    this.save();
    this.refreshUi();
  }

  /** Para o SDK de anúncios: silencia sem mexer na preferência do jogador. */
  setAdMuted(value) {
    this.adMuted = !!value;
    this.applyVolume();
  }

  applyVolume() {
    if (!this.master) return;
    const level = this.muted || this.adMuted ? 0 : this.volume * this.volume; // curva suave
    this.master.gain.setTargetAtTime(level, this.ctx.currentTime, 0.03);
  }

  // ---------------------------------------------------------------- inicialização do áudio
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.buildGraph();
    }
    if (this.ctx.state === "suspended") this.ctx.resume?.();
    if (!this.unlocked) {
      this.unlocked = true;
      this.startMusic();
    }
    if (this.ctx.state === "running" && this.unlockHandler) {
      for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
        window.removeEventListener(type, this.unlockHandler, { capture: true });
      }
      this.unlockHandler = null;
    }
  }

  buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); // evita estourar quando vários sons tocam juntos
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    // eco da música (espaço mágico)
    this.echoIn = ctx.createGain();
    this.echo = ctx.createDelay(1.5);
    this.echo.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.6;
    this.echoIn.connect(this.echo);
    this.echo.connect(feedback);
    feedback.connect(this.echo);
    this.echo.connect(echoOut);
    echoOut.connect(this.music);
    // ruído branco reaproveitado em todos os efeitos
    const length = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.master.gain.value = this.muted ? 0 : this.volume * this.volume;
  }

  get ready() {
    return !!this.ctx && this.unlocked && this.ctx.state !== "closed";
  }

  // ---------------------------------------------------------------- blocos básicos de som
  /** Nota com envelope. `to` faz o tom deslizar; `pan` vai de -1 a 1. */
  tone({ freq, to, dur = 0.2, type = "sine", vol = 0.25, delay = 0, attack = 0.004, pan = 0, bus, send = 0 }) {
    if (!this.ready || this.active > 56) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    this.route(gain, pan, bus || this.sfx, send);
    this.active += 1;
    osc.onended = () => (this.active -= 1);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Rajada de ruído filtrado (vento, impacto, faísca...). `to` desliza a frequência do filtro. */
  noise({ dur = 0.2, vol = 0.2, filter = "bandpass", freq = 1000, to, q = 1, delay = 0, attack = 0.005, pan = 0 }) {
    if (!this.ready || this.active > 56) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(freq, t);
    if (to) biquad.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(biquad);
    biquad.connect(gain);
    this.route(gain, pan, this.sfx, 0);
    this.active += 1;
    src.onended = () => (this.active -= 1);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  route(node, pan, bus, send) {
    let out = node;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      node.connect(p);
      out = p;
    }
    out.connect(bus);
    if (send && this.echoIn) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      out.connect(s);
      s.connect(this.echoIn);
    }
  }

  // ---------------------------------------------------------------- efeitos
  ui() {
    this.tone({ freq: 880, to: 1320, dur: 0.07, type: "triangle", vol: 0.12 });
  }

  /** Rebatida. quality: "perfect" | "normal"; strong = cortada; ratio = velocidade do orbe (0..1). */
  hit({ quality, strong, curve, ratio = 0, pan = 0 }) {
    const lift = 1 + ratio * 0.5;
    this.tone({ freq: 240 * lift, to: 110, dur: 0.1, type: "sine", vol: 0.34, pan });
    this.noise({ dur: 0.06, vol: 0.2, freq: 2200, q: 0.8, pan });
    if (strong) {
      this.tone({ freq: 130, to: 45, dur: 0.28, type: "sine", vol: 0.45, pan });
      this.noise({ dur: 0.25, vol: 0.25, filter: "lowpass", freq: 3000, to: 200, pan });
    }
    if (curve) this.noise({ dur: 0.4, vol: 0.14, freq: 700, to: 2400, q: 2, pan });
    if (quality === "perfect") {
      // brilho mágico do parry perfeito
      [880, 1320, 1760, 2640].forEach((f, i) =>
        this.tone({ freq: f * lift, dur: 0.3 + i * 0.05, type: "triangle", vol: 0.12, delay: i * 0.035, pan, send: 0.25 }),
      );
    }
  }

  serve(quality, pan = 0) {
    this.noise({ dur: 0.28, vol: 0.16, freq: 400, to: 2200, q: 1.2, pan });
    this.hit({ quality, strong: quality === "perfect", pan });
  }

  bounce(inside, ratio = 0, pan = 0) {
    const f = inside ? 190 : 130;
    this.tone({ freq: f * (1 + ratio * 0.3), to: f * 0.5, dur: 0.1, type: "sine", vol: 0.26, pan });
    this.noise({ dur: 0.04, vol: 0.1, filter: "lowpass", freq: 1500, pan });
  }

  net(ratio = 0, pan = 0) {
    this.tone({ freq: 320, to: 180, dur: 0.22, type: "triangle", vol: 0.2, pan, send: 0.2 });
    this.noise({ dur: 0.18, vol: 0.12 + ratio * 0.1, filter: "highpass", freq: 3500, pan });
  }

  out() {
    this.tone({ freq: 420, to: 140, dur: 0.38, type: "sawtooth", vol: 0.16 });
    this.tone({ freq: 95, to: 60, dur: 0.4, type: "sine", vol: 0.3 });
  }

  fault() {
    this.tone({ freq: 392, dur: 0.12, type: "square", vol: 0.1 });
    this.tone({ freq: 294, dur: 0.2, type: "square", vol: 0.1, delay: 0.13 });
  }

  /** Fanfarra curta de ponto: sobe quando é seu time, desce quando é do rival. */
  point(good, delay = 0) {
    const notes = good ? [72, 76, 79] : [67, 63];
    notes.forEach((n, i) =>
      this.tone({ freq: NOTE(n), dur: good ? 0.28 : 0.34, type: "triangle", vol: 0.2, delay: delay + i * 0.11, send: 0.3 }),
    );
  }

  matchOver(win) {
    const notes = win ? [72, 76, 79, 84, 88] : [67, 64, 60, 55];
    notes.forEach((n, i) =>
      this.tone({ freq: NOTE(n), dur: win ? 0.5 : 0.7, type: "triangle", vol: 0.22, delay: i * (win ? 0.14 : 0.22), send: 0.4 }),
    );
    if (win) this.noise({ dur: 1.2, vol: 0.08, filter: "highpass", freq: 5000, delay: 0.5 });
  }

  startChime() {
    this.noise({ dur: 0.6, vol: 0.14, freq: 300, to: 3000, q: 1.5 });
    [64, 69, 76].forEach((n, i) => this.tone({ freq: NOTE(n), dur: 0.5, type: "triangle", vol: 0.14, delay: 0.1 + i * 0.09, send: 0.35 }));
  }

  /** Liga cada evento da simulação a um som. ctx = { isFriendly(id), isLocal(id), ratio }. */
  onEvent(e, c = {}) {
    if (!this.ready) return;
    const ratio = clamp(c.ratio ?? 0, 0, 1);
    const pan = typeof e.x === "number" ? clamp(e.x / 9, -1, 1) * 0.7 : 0;
    switch (e.type) {
      case "start":
        this.targetIntensity = 0;
        this.startChime();
        break;
      case "serveReady":
        this.tone({ freq: NOTE(79), dur: 0.25, type: "sine", vol: 0.1, send: 0.3 });
        this.tone({ freq: NOTE(84), dur: 0.3, type: "sine", vol: 0.08, delay: 0.1, send: 0.3 });
        break;
      case "serve":
        this.serve(e.quality, pan);
        break;
      case "hit":
        this.targetIntensity = ratio;
        this.hit({ quality: e.quality, strong: e.strong, curve: e.curve, ratio, pan });
        break;
      case "swing":
        this.noise({ dur: 0.12, vol: 0.07, filter: "highpass", freq: 1800, to: 4000, pan });
        break;
      case "whiff":
        this.noise({ dur: 0.22, vol: 0.1, freq: 900, to: 300, q: 0.7, pan });
        break;
      case "bounce":
        this.bounce(e.inside !== false, ratio, pan);
        break;
      case "net":
        this.net(ratio, pan);
        break;
      case "out":
        this.out();
        break;
      case "fault":
        this.fault();
        break;
      case "point":
        this.targetIntensity = 0;
        this.point(c.isFriendly ? c.isFriendly(e.winner) : true, e.kind === "out" ? 0.35 : 0.1);
        break;
      case "matchOver":
        this.targetIntensity = 0;
        this.matchOver(c.isFriendly ? c.isFriendly(e.winner) : true);
        break;
      // ---- Ignis
      case "dash":
        this.noise({ dur: 0.45, vol: 0.26, freq: 300, to: 1800, q: 1.2, pan });
        this.tone({ freq: 90, to: 220, dur: 0.4, type: "sawtooth", vol: 0.14, pan });
        break;
      case "dashReady":
        this.tone({ freq: 1320, dur: 0.18, type: "sine", vol: 0.1, send: 0.3 });
        break;
      case "meteor":
        this.noise({ dur: 0.9, vol: 0.3, filter: "lowpass", freq: 200, to: 900 });
        this.tone({ freq: 60, to: 40, dur: 0.9, type: "sawtooth", vol: 0.18 });
        break;
      case "meteorFall":
        this.tone({ freq: 1400, to: 150, dur: 0.9, type: "sine", vol: 0.16, pan });
        break;
      case "meteorImpact":
        this.tone({ freq: 95, to: 28, dur: 0.7, type: "sine", vol: 0.6, pan });
        this.noise({ dur: 0.7, vol: 0.4, filter: "lowpass", freq: 1400, to: 90, pan });
        break;
      case "meteorReturn":
        this.hit({ quality: "perfect", strong: true, ratio, pan });
        break;
      // ---- Glacia
      case "frostWall":
        [88, 93, 97].forEach((n, i) => this.tone({ freq: NOTE(n), dur: 0.7, type: "triangle", vol: 0.12, delay: i * 0.07, pan, send: 0.4 }));
        this.noise({ dur: 0.5, vol: 0.1, filter: "highpass", freq: 6000 });
        break;
      case "wallReflect":
        this.tone({ freq: 3000, to: 2200, dur: 0.18, type: "triangle", vol: 0.2, pan, send: 0.3 });
        this.tone({ freq: 160, to: 80, dur: 0.15, type: "sine", vol: 0.25, pan });
        break;
      case "iceRink":
        for (let i = 0; i < 6; i++) this.noise({ dur: 0.08, vol: 0.12, filter: "highpass", freq: 5000, delay: i * 0.07 });
        [100, 96, 91, 86].forEach((n, i) => this.tone({ freq: NOTE(n), dur: 0.4, type: "sine", vol: 0.09, delay: i * 0.1, send: 0.4 }));
        break;
      // ---- Zephyr
      case "gust":
        this.noise({ dur: 0.6, vol: 0.24, freq: 500, to: 1600, q: 1.5, pan, attack: 0.15 });
        break;
      case "tornado":
        this.noise({ dur: 1.3, vol: 0.26, freq: 400, to: 900, q: 2, attack: 0.4 });
        this.tone({ freq: 70, to: 110, dur: 1.3, type: "sawtooth", vol: 0.08, attack: 0.4 });
        break;
      case "tornadoLaunch":
        this.noise({ dur: 0.5, vol: 0.26, freq: 600, to: 3200, q: 1.5, pan });
        break;
      // ---- Volta
      case "shortCircuit":
      case "shortCircuitRelease":
        this.zap(e.type === "shortCircuit" ? 0.3 : 0.18, 0.16, pan);
        break;
      case "overload":
        this.tone({ freq: 80, to: 1200, dur: 0.5, type: "square", vol: 0.12 });
        this.zap(0.5, 0.2);
        this.tone({ freq: 70, to: 35, dur: 0.6, type: "sine", vol: 0.45, delay: 0.05 });
        break;
      default:
        break;
    }
  }

  /** Estalo elétrico: frequências aleatórias em sequência rápida + faíscas. */
  zap(dur, vol, pan = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    for (let i = 0; i < 12; i++) osc.frequency.setValueAtTime(rand(180, 1800), t + (i * dur) / 12);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    this.route(gain, pan, this.sfx, 0);
    this.active += 1;
    osc.onended = () => (this.active -= 1);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    this.noise({ dur, vol: vol * 0.9, filter: "highpass", freq: 4000, pan });
  }

  // ---------------------------------------------------------------- música
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.nextChordAt = t + 0.2;
    this.nextNoteAt = t + 1.5;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 250);
    this.scheduleMusic();
  }

  scheduleMusic() {
    if (!this.ready || this.ctx.state !== "running") return;
    const ctx = this.ctx;
    const horizon = ctx.currentTime + 1.2;
    this.intensity += (this.targetIntensity - this.intensity) * 0.15;
    while (this.nextChordAt < horizon) {
      this.pad(CHORDS[this.chordIndex % CHORDS.length], this.nextChordAt, 4.4);
      this.chordIndex += 1;
      this.nextChordAt += 4;
    }
    while (this.nextNoteAt < horizon) {
      const chance = 0.4 + this.intensity * 0.5;
      if (Math.random() < chance) {
        const note = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        this.pluck(NOTE(note), this.nextNoteAt, rand(0.05, 0.1));
      }
      this.nextNoteAt += rand(0.45, 0.6) - this.intensity * 0.22;
    }
  }

  /** Acorde suave: cada nota entra devagar e sai devagar. */
  pad(notes, start, dur) {
    for (const n of notes) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n < 50 ? "sine" : "triangle";
      osc.frequency.value = NOTE(n);
      osc.detune.value = rand(-6, 6);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(n < 50 ? 0.16 : 0.07, start + 1.4);
      gain.gain.linearRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(this.music);
      osc.start(start);
      osc.stop(start + dur + 0.1);
    }
  }

  /** Nota de harpa com eco. */
  pluck(freq, start, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
    osc.connect(gain);
    gain.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.7;
    gain.connect(send);
    send.connect(this.echoIn);
    osc.start(start);
    osc.stop(start + 1.2);
  }

  // ---------------------------------------------------------------- interface (botão de som)
  buildUi() {
    this.ui_ = document.createElement("div");
    this.ui_.className = "audio-ui";
    this.ui_.innerHTML = `
      <button class="audio-btn" type="button" aria-label="Som (tecla M)" title="Som (M)"></button>
      <input class="audio-vol" type="range" min="0" max="100" step="1" aria-label="Volume" />`;
    document.body.appendChild(this.ui_);
    this.btn = this.ui_.querySelector("button");
    this.slider = this.ui_.querySelector("input");
    this.btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMute();
    });
    // o toque/clique no controle não pode virar mira nem parry
    for (const type of ["pointerdown", "pointermove"]) this.ui_.addEventListener(type, (e) => e.stopPropagation());
    this.slider.addEventListener("input", () => this.setVolume(Number(this.slider.value) / 100));
    this.refreshUi();
  }

  refreshUi() {
    if (!this.btn) return;
    const off = this.muted || this.volume === 0;
    this.btn.textContent = off ? "🔇" : this.volume < 0.4 ? "🔈" : "🔊";
    this.btn.classList.toggle("off", off);
    this.slider.value = String(Math.round(this.volume * 100));
  }
}
