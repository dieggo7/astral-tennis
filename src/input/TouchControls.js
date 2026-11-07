/**
 * Controles de toque (celular/tablet). Só aparecem em telas de toque.
 *  - Joystick (canto esquerdo): mover (mesmo efeito de WASD)
 *  - Arrastar/tocar na quadra: mirar (a mira fica onde o dedo parou)
 *  - Botão PARRY (canto direito): parry / saque
 *  - Botão CORTADA: smash (o botão direito do mouse)
 *  - Habilidade e ultimate: botões que o HUD já tem
 * Tocar na quadra NÃO faz parry (no mouse o clique faz), para dar para mirar sem rebater sem querer.
 */
const DEADZONE = 0.18;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.moveX = 0;
    this.moveZ = 0;
    this.enabled = false;
    this.joyId = null;
    if (typeof document === "undefined") return;

    this.root = document.createElement("div");
    this.root.className = "touch-ui";
    this.root.innerHTML = `
      <div class="touch-joy" data-joy><i class="touch-joy-knob"></i></div>
      <button class="touch-btn touch-smash" type="button" data-smash>CORTADA</button>
      <button class="touch-btn touch-parry" type="button" data-parry>PARRY</button>
      <p class="touch-tip">Arraste na quadra para mirar</p>
      <div class="touch-rotate">Gire o celular para jogar na horizontal</div>`;
    document.body.appendChild(this.root);

    this.joy = this.root.querySelector("[data-joy]");
    this.knob = this.joy.querySelector("i");
    this.bindJoystick();
    this.bindButton(this.root.querySelector("[data-parry]"), () => (this.input.pressQueued = true));
    this.bindButton(this.root.querySelector("[data-smash]"), () => (this.input.strongPressQueued = true));

    // ativa a interface no 1º toque (também em notebooks com tela de toque) ou já se o aparelho for só toque
    window.addEventListener("pointerdown", (e) => e.pointerType === "touch" && this.enable(), { capture: true });
    if (window.matchMedia?.("(pointer: coarse)").matches) this.enable();
    document.addEventListener("visibilitychange", () => this.releaseJoystick());
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add("touch-mode");
  }

  bindJoystick() {
    const joy = this.joy;
    joy.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      joy.setPointerCapture?.(e.pointerId);
      this.updateJoystick(e);
    });
    joy.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.joyId) return;
      e.stopPropagation(); // senão a mira pularia para o canto do joystick
      this.updateJoystick(e);
    });
    const end = (e) => {
      if (e.pointerId !== this.joyId) return;
      e.stopPropagation();
      this.releaseJoystick();
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) joy.addEventListener(type, end);
  }

  updateJoystick(e) {
    const r = this.joy.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = e.clientX - (r.left + radius);
    let dy = e.clientY - (r.top + radius);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    let nx = dx / radius;
    let nz = dy / radius;
    const mag = Math.hypot(nx, nz);
    if (mag < DEADZONE) {
      nx = 0;
      nz = 0;
    } else {
      const s = ((mag - DEADZONE) / (1 - DEADZONE) / mag) * 1.15; // chega na velocidade máxima antes da borda
      nx = clamp(nx * s, -1, 1);
      nz = clamp(nz * s, -1, 1);
    }
    this.moveX = nx; // arrastar para cima = rumo à rede (como W)
    this.moveZ = nz;
  }

  releaseJoystick() {
    this.joyId = null;
    this.moveX = 0;
    this.moveZ = 0;
    if (this.knob) this.knob.style.transform = "translate(-50%, -50%)";
  }

  bindButton(button, onPress) {
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      button.classList.add("down");
      onPress();
    });
    const up = (e) => {
      e.stopPropagation();
      button.classList.remove("down");
    };
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(type, up);
  }
}
