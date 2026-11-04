import { teamOf } from "../sim/Rules.js";
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1]

// Ritmo de uso das habilidades do rival (tudo em segundos). Sobrescrevível em gameConfig.bot.abilityAI.
const BOT_ABILITY_AI = {
  thinkMin: 0.3, // a IA só "decide" a cada thinkMin..thinkMax s (antes decidia a cada passo, 120x/s)
  thinkMax: 0.6,
  abilityArmMin: 4, // depois que a habilidade recarrega, espera isso antes de poder usar
  abilityArmMax: 9,
  ultimateArmMin: 6,
  ultimateArmMax: 12,
  minGapBetweenUses: 6, // intervalo mínimo entre QUALQUER habilidade/ultimate
};

/**
 * Rival inteligente. Gera "intents" (mover, golpear, mirar) como o jogador faria.
 * Dificuldade toda em gameConfig.bot. Além de prever onde o orbe vai quicar,
 * agora usa habilidades de forma tática, mira estrategicamente longe do adversário,
 * se posiciona melhor na quadra e adapta a agressividade conforme a situação.
 */
export class BotController {
  constructor(cfg, court, parryCfg) {
    this.cfg = cfg;
    this.ai = { ...BOT_ABILITY_AI, ...(cfg.abilityAI || {}) };
    this.parry = parryCfg;
    this.halfW = court.width / 2;
    this.halfL = court.length / 2;
    this.serviceLine = court.serviceLine || 6.2;
    this.reset();
  }

  reset() {
    this.incoming = false;
    this.reaction = 0;
    this.plan = 0;
    this.target = null;
    this.willSwing = true;
    this.jitter = 0;
    this.pressed = false;
    // --- Novos estados da IA ---
    this.rallyLength = 0;          // conta rebatidas no rali atual
    this.lastAimSide = 0;         // último lado mirado (-1 esquerda, 1 direita)
    this.abilityTimer = 0;        // cooldown interno para não usar habilidades em spam
    this.ultimateTimer = 0;       // cooldown interno para ultimate
    this.wantsAbility = false;    // flag para ativar ability neste frame
    this.wantsUltimate = false;   // flag para ativar ultimate neste frame
    this.aggression = 0.5;        // 0 = defensivo, 1 = agressivo (adapta ao rali)
    this.strongShot = false;      // se quer fazer smash nesta rebatida
    this.hitCounted = false;      // a rebatida atual já foi contada em rallyLength?
    this.thinkTimer = 0.5;        // tempo até a próxima decisão de habilidade
    this.useGap = 0;              // intervalo mínimo desde o último uso de habilidade
    this.abilityReadyFor = 0;     // há quanto tempo a habilidade está pronta
    this.abilityArm = -1;         // espera aleatória antes de poder usar (-1 = sorteia)
    this.ultimateReadyFor = 0;
    this.ultimateArm = -1;
  }

  /** Mira estratégica: longe do jogador, nos cantos, com variação. */
  pickAim(player, sign = -1, ball = null) {
    const c = this.cfg;
    const maxX = this.halfW - c.aimMargin;

    // --- Estratégia de mira baseada na posição do adversário ---
    // Identifica o lado mais aberto (longe do jogador)
    const openSide = player.x > 0 ? -1 : 1;

    // Escolhe entre diferentes estratégias com probabilidades
    const roll = Math.random();

    let aimX, aimZ;

    if (roll < 0.35) {
      // CROSS-COURT: mirar no canto oposto ao jogador (35% das vezes)
      aimX = clamp(
        openSide * (this.halfW * 0.7 + Math.random() * this.halfW * 0.2),
        -maxX,
        maxX
      );
      aimZ = -sign * (this.halfL * 0.6 + Math.random() * this.halfL * 0.25);
    } else if (roll < 0.55) {
      // DOWN THE LINE: mirar reto no fundo (20% das vezes)
      aimX = clamp(
        player.x * 0.3 + gauss() * 1.5,
        -maxX,
        maxX
      );
      aimZ = -sign * (this.halfL * 0.75 + Math.random() * this.halfL * 0.15);
    } else if (roll < 0.70 && this.aggression > 0.6) {
      // DROP SHOT: bola curta perto da rede quando agressivo (15% se agressivo)
      aimX = clamp(
        openSide * (Math.random() * this.halfW * 0.5),
        -maxX,
        maxX
      );
      aimZ = -sign * (1.5 + Math.random() * 3);
    } else if (roll < 0.85) {
      // ANGULAR: mirar no canto mais distante do jogador (15-30%)
      const cornerX = openSide * maxX * (0.8 + Math.random() * 0.2);
      aimX = clamp(cornerX, -maxX, maxX);
      aimZ = -sign * (4 + Math.random() * 5);
    } else {
      // AO CORPO: mirar diretamente no jogador para dificultar a reação (15%)
      aimX = clamp(
        player.x + gauss() * 0.8,
        -maxX,
        maxX
      );
      aimZ = -sign * (Math.abs(player.z) * 0.9 + gauss() * 1.5);
      aimZ = clamp(aimZ, sign > 0 ? -this.halfL + 0.5 : 1.5, sign > 0 ? -1.5 : this.halfL - 0.5);
    }

    // Variação aleatória para não ser previsível
    aimX += gauss() * c.aimSpread * 0.3;
    aimX = clamp(aimX, -maxX, maxX);

    // Evita repetir o mesmo lado 3+ vezes seguidas
    const currentSide = Math.sign(aimX);
    if (currentSide === this.lastAimSide && Math.random() < 0.4) {
      aimX = -aimX; // inverte o lado
    }
    this.lastAimSide = Math.sign(aimX);

    return { x: aimX, z: aimZ };
  }

  /** Mira do saque: dentro da caixa de saque diagonal, favorecendo cantos e T. */
  serveAim(box) {
    const m = 0.6;
    const roll = Math.random();

    if (roll < 0.4) {
      // Saque no canto externo (largo)
      const wide = Math.abs(box.xMax) > Math.abs(box.xMin) ? box.xMax : box.xMin;
      return {
        x: wide - Math.sign(wide) * m + gauss() * 0.3,
        z: (box.zMin + box.zMax) / 2 + gauss() * ((box.zMax - box.zMin) / 4),
      };
    } else if (roll < 0.7) {
      // Saque no T (perto do centro da rede)
      return {
        x: (box.xMin + box.xMax) / 2 + gauss() * 0.5,
        z: Math.abs(box.zMin) < Math.abs(box.zMax) ? box.zMin + m : box.zMax - m,
      };
    } else {
      // Saque ao corpo (centro da caixa)
      return {
        x: (box.xMin + box.xMax) / 2 + gauss() * 1.0,
        z: box.zMin + m + Math.random() * (box.zMax - box.zMin - 2 * m),
      };
    }
  }

  moveToward(out, bot, tx, tz, k = 1) {
    const dx = tx - bot.x,
      dz = tz - bot.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const s = Math.min(1, d / 0.5) * k;
    out.moveX = (dx / d) * s;
    out.moveZ = (dz / d) * s;
  }

  /**
   * Decide se deve usar habilidade/ultimate baseado na situação do jogo.
   * Cada personagem tem lógica diferente.
   */
  thinkAbilities(dt, { bot, player, ball, rules }) {
    const ai = this.ai;
    this.abilityTimer = Math.max(0, this.abilityTimer - dt);
    this.ultimateTimer = Math.max(0, this.ultimateTimer - dt);
    this.useGap = Math.max(0, this.useGap - dt);
    this.wantsAbility = false;
    this.wantsUltimate = false;

    // "Armar": quando a recarga acaba, a IA espera um tempo aleatório antes de poder usar.
    // Sem isso ela disparava no instante em que a habilidade ficava pronta.
    if (bot.aiAbilityCooldown > 0) {
      this.abilityReadyFor = 0;
      this.abilityArm = -1;
    } else {
      if (this.abilityArm < 0) this.abilityArm = ai.abilityArmMin + Math.random() * (ai.abilityArmMax - ai.abilityArmMin);
      this.abilityReadyFor += dt;
    }
    if (bot.aiUltimateCooldown > 0) {
      this.ultimateReadyFor = 0;
      this.ultimateArm = -1;
    } else {
      if (this.ultimateArm < 0) this.ultimateArm = ai.ultimateArmMin + Math.random() * (ai.ultimateArmMax - ai.ultimateArmMin);
      this.ultimateReadyFor += dt;
    }

    // Decide só a cada ~0.3-0.6 s. Antes o sorteio de chance rodava a CADA passo da simulação
    // (120x por segundo), então "60% de chance" virava ~100% no primeiro instante possível.
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = ai.thinkMin + Math.random() * (ai.thinkMax - ai.thinkMin);

    const characterId = bot.characterId || "glacia";
    const ballDist = Math.hypot(ball.x - bot.x, ball.z - bot.z);
    const ballApproaching = Math.sign(ball.vz) === bot.sign;
    const ballSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
    const botOnDefense = teamOf(rules.lastHitter) !== teamOf(bot.team || "bot");
    const gapOk = this.useGap <= 0;
    const abilityReady = gapOk && bot.aiAbilityCooldown <= 0 && this.abilityTimer <= 0 && this.abilityReadyFor >= this.abilityArm;
    const ultimateReady = gapOk && bot.aiUltimateCooldown <= 0 && this.ultimateTimer <= 0 && this.ultimateReadyFor >= this.ultimateArm;

    switch (characterId) {
      case "ignis": {
        // Investida Flamejante: usa quando a bola está vindo rápido e longe demais
        if (abilityReady && botOnDefense && ballApproaching && ballDist > 4 && ballDist < 12 && ballSpeed > 15) {
          if (Math.random() < 0.6) {
            this.wantsAbility = true;
            this.abilityTimer = 3; // não tenta de novo por 3s
          }
        }
        // Meteoro: usa quando está confortável (não está correndo) e o rali dura bastante
        if (ultimateReady && this.rallyLength >= 3 && ballDist < 5 && !ballApproaching) {
          if (Math.random() < 0.3) {
            this.wantsUltimate = true;
            this.ultimateTimer = 5;
          }
        }
        break;
      }
      case "glacia": {
        // Muralha de Cristal: usa quando a bola está vindo forte e rápida
        if (abilityReady && botOnDefense && ballApproaching && ballSpeed > 18) {
          if (Math.random() < 0.5) {
            this.wantsAbility = true;
            this.abilityTimer = 4;
          }
        }
        // Pista de Patinação: usa quando o rali está longo (desorienta o rival)
        if (ultimateReady && this.rallyLength >= 4) {
          if (Math.random() < 0.25) {
            this.wantsUltimate = true;
            this.ultimateTimer = 5;
          }
        }
        break;
      }
      case "zephyr": {
        // Rajada de Vento: usa quando a bola vai passar por cima da rede em posição difícil
        if (abilityReady && !ball.held && !ball.fallen && ballDist < 8) {
          const ballGoingToCorner = Math.abs(ball.x + ball.vx * 0.5) > this.halfW * 0.6;
          if (ballGoingToCorner && Math.random() < 0.5) {
            this.wantsAbility = true;
            this.abilityTimer = 3;
          }
        }
        // Olho do Furacão: usa quando a bola está por perto e o rali dura
        if (ultimateReady && !ball.held && !ball.fallen && this.rallyLength >= 3 && ballDist < 6) {
          if (Math.random() < 0.25) {
            this.wantsUltimate = true;
            this.ultimateTimer = 5;
          }
        }
        break;
      }
      case "volta": {
        // Curto-Circuito: usa quando a bola está passando por cima da rede rumo ao adversário (confunde)
        if (abilityReady && !ball.held && !ball.fallen && !botOnDefense && Math.abs(ball.z) < 3) {
          if (Math.random() < 0.45) {
            this.wantsAbility = true;
            this.abilityTimer = 3;
          }
        }
        // Sobrecarga: usa quando está perto da bola e tem boa posição
        if (ultimateReady && !ball.held && !ball.fallen && ballDist < 5 && this.rallyLength >= 2) {
          if (Math.random() < 0.3) {
            this.wantsUltimate = true;
            this.ultimateTimer = 5;
          }
        }
        break;
      }
    }
    if (this.wantsAbility || this.wantsUltimate) this.useGap = ai.minGapBetweenUses;
  }

  think(dt, { bot, player, ball, rules, home, team = "bot" }) {
    const c = this.cfg;
    const out = {
      moveX: 0,
      moveZ: 0,
      press: false,
      strongPress: false,
      aimX: bot.aimX,
      aimZ: bot.aimZ,
      ability: false,
      ultimate: false,
    };
    const live = rules.state === "live" && teamOf(rules.lastHitter) !== teamOf(team);
    if (rules.state !== "live") {
      // ponto acabou / saque: zera o rali (antes rallyLength nunca zerava)
      this.rallyLength = 0;
      this.hitCounted = false;
    }

    if (!live) {
      this.incoming = false;
      this.target = null;

      // Posicionamento mais inteligente quando a bola não está vindo:
      // Fica numa posição central com leve viés para cobrir o lado aberto
      let homeX = home[0];
      let homeZ = home[1];

      if (rules.state === "live" && teamOf(rules.lastHitter) === teamOf(team)) {
        // Bola foi rebatida pelo bot: volta ao centro para cobrir a resposta
        homeX = 0;
        homeZ = bot.sign * (this.halfL * 0.6);
        // conta UMA vez por rebatida (antes somava a cada passo da simulação)
        if (!this.hitCounted) {
          this.rallyLength += 1;
          this.hitCounted = true;
        }
      }

      this.moveToward(out, bot, homeX, homeZ, 0.7);

      // Usa habilidades mesmo quando não está na defesa (abilities ofensivas)
      if (rules.state === "live") {
        this.thinkAbilities(dt, { bot, player, ball, rules });
        out.ability = this.wantsAbility;
        out.ultimate = this.wantsUltimate;
      }

      return out;
    }

    if (!this.incoming) {
      // bola nova vindo
      this.incoming = true;
      this.hitCounted = false;
      this.reaction = c.reaction * (0.8 + Math.random() * 0.5);
      this.willSwing = Math.random() >= c.missChance;
      this.jitter = gauss() * c.timingJitter;
      this.pressed = false;
      this.plan = 0;
      this.strongShot = false;

      // Atualiza agressividade baseado no rali
      const ballSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
      if (ballSpeed > 20) {
        this.aggression = Math.max(0.2, this.aggression - 0.15); // bola rápida = mais defensivo
      } else if (ballSpeed < 12) {
        this.aggression = Math.min(0.9, this.aggression + 0.2); // bola lenta = mais agressivo
      }

      // Decide se vai tentar smash (bola alta e lenta = oportunidade)
      if (ball.y > 2.5 && ballSpeed < 15 && this.aggression > 0.5) {
        this.strongShot = Math.random() < 0.4;
      }
    }

    this.reaction -= dt;
    if (this.reaction > 0) return out;

    this.plan -= dt;
    if (this.plan <= 0) {
      this.plan = 0.1;
      this.replan(bot, ball, rules);
    }

    // Pensa em usar habilidades
    this.thinkAbilities(dt, { bot, player, ball, rules });
    out.ability = this.wantsAbility;
    out.ultimate = this.wantsUltimate;

    if (!this.target) {
      // vai sair: move-se para posição de cobertura em vez de simplesmente ficar parado
      const coverX = -Math.sign(ball.vx || 0) * this.halfW * 0.2;
      const coverZ = bot.sign * (this.halfL * 0.55);
      this.moveToward(out, bot, coverX, coverZ, 0.5);
      return out;
    }

    this.moveToward(out, bot, this.target.x, this.target.z);

    // Clique: quando o orbe está a (alcance + velocidade * tempo ideal) de distância.
    if (this.willSwing && !this.pressed && Math.sign(ball.z) === bot.sign) {
      const rx = bot.x,
        ry = 1.4,
        rz = bot.z - bot.sign * 0.5;
      const dx = ball.x - rx,
        dy = ball.y - ry,
        dz = ball.z - rz;
      const dist = Math.hypot(dx, dy, dz);
      const sp = Math.hypot(ball.vx, ball.vy, ball.vz);
      const approaching = dx * ball.vx + dy * ball.vy + dz * ball.vz < 0;
      if (
        approaching &&
        dist <= this.parry.reach + sp * (this.parry.sweetTime + this.jitter)
      ) {
        const aim = this.pickAim(player, bot.sign, ball);
        out.press = true;
        out.strongPress = this.strongShot;
        out.aimX = aim.x;
        out.aimZ = aim.z;
        this.pressed = true;
      }
    }
    return out;
  }

  replan(bot, ball, rules) {
    const c = this.cfg;
    const samples = ball.predict(2.5);
    const tolW = this.halfW + 0.3,
      tolL = this.halfL + 0.3;
    let from = 0;

    if (rules.bounces === 0) {
      const fb = samples.find((s) => s.bounce);
      if (fb && (Math.abs(fb.x) > tolW || Math.abs(fb.z) > tolL || Math.sign(fb.z) !== bot.sign)) {
        this.target = null; // vai cair fora/na rede: não corre atrás
        return;
      }
      from = fb ? samples.indexOf(fb) + 6 : 0; // um pouco depois do quique
    }

    const reach = this.parry.reach;
    let best = null;
    let bestScore = -Infinity;

    for (let i = from; i < samples.length; i += 1) {
      const s = samples[i];
      if (Math.sign(s.z) !== bot.sign || Math.abs(s.z) < 1 || Math.abs(s.z) > this.halfL - 0.3 || Math.abs(s.x) > this.halfW)
        continue;
      if (s.y < 0.5 || s.y > 2.4) continue;

      const need = Math.hypot(s.x - bot.x, s.z - bot.z) - reach * 0.7;
      const can = c.speed * Math.max(0, s.t - 0.05);

      // Score: prefere interceptações mais cedo e mais centrais (melhor posição depois)
      const timePenalty = s.t * 0.5; // mais cedo é melhor
      const positionBonus = (1 - Math.abs(s.x) / this.halfW) * 0.3; // mais central é melhor
      const heightBonus = (s.y > 1.2 && s.y < 2.0) ? 0.3 : 0; // altura ideal para rebater
      const score = -timePenalty + positionBonus + heightBonus;

      if (need <= can && score > bestScore) {
        best = s;
        bestScore = score;
      } else if (!best) {
        best = s; // plano B: o último candidato alcançável
      }
    }

    this.target = best
      ? {
          x: clamp(
            best.x + gauss() * c.positionError,
            -this.halfW + 0.3,
            this.halfW - 0.3,
          ),
          z: clamp(best.z - bot.sign * 0.5, bot.sign > 0 ? 1.2 : -(this.halfL - 0.3), bot.sign > 0 ? this.halfL - 0.3 : -1.2),
        }
      : null;
  }
}
