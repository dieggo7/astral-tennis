# Astral Tennis — Relatório das alterações (MVP jogável solo)

## O que foi feito
Partida completa de tênis contra um rival controlado pelo computador: saque, rali, Parry no clique do mouse, regras de tênis, placar até 15 e HUD. Um mago jogável (Ignis) contra um rival (visual da Glacia, sem habilidades).

## Como jogar
| Ação | Controle |
|---|---|
| Mover | WASD ou setas |
| Mirar | Mouse (o anel sobre a quadra rival; fica vermelho se está fora das linhas) |
| Parry / sacar | Botão esquerdo do mouse (Espaço/Enter também) |
| Ver timing do último Parry | T (depuração; mostra erro em ms, negativo = cedo, positivo = tarde) |
| Câmera livre / bloom | C / B (já existiam) |

Clique na tela inicial para começar. Você saca primeiro; o saque alterna a cada ponto. Fim da partida: clique para jogar de novo.

## Regras implementadas (src/sim/Rules.js)
- O orbe precisa quicar primeiro DENTRO da quadra do adversário (linha vale como dentro, tolerância 0,3).
- Quique fora, na própria quadra ou orbe baixo demais na barreira = ponto do adversário.
- Quem recebe pode rebater no ar (voleio) ou depois de UM quique. Segundo quique = ponto de quem rebateu.
- Ninguém rebate duas vezes seguidas.
- Vence quem chegar primeiro a `winScore` (15; troque para 25 em `gameConfig.winScore`).
- Simplificações: sem caixa de saque, sem segundo saque, sem vantagem (deuce).

## Parry (src/sim/Parry.js)
O clique inicia um golpe de 0,34 s. Se o orbe entra no alcance (2,1 un.) durante o golpe, há contato. O instante do contato, medido desde o clique, define a qualidade em relação a um instante secreto (0,12 s):
- **Perfeito:** dentro de ±0,07 s do instante secreto. Velocidade do rali x2 (limitada à máxima) e mira quase exata.
- **Normal:** qualquer outro contato dentro do golpe. Velocidade x1,04 e mira com imprecisão.
- **Erro:** o orbe não chegou ao alcance durante o golpe (clicou cedo demais). Recarga maior (0,45 s) para punir spam.
- Clicar tarde (orbe já no alcance) dá golpe normal.
- Clique antecipado de até 0,12 s é guardado (buffer).
- Feedback: escudo brilha, shake de câmera, pausa curta (hit-stop) e texto "PARRY PERFEITO!" no perfeito.

## Física do orbe (src/sim/BallPhysics.js)
A rebatida lança o orbe por uma parábola exata até o ponto mirado, então o orbe cai onde a mira apontou (menos a imprecisão). O tempo de voo vem da velocidade do rali; se a parábola bateria na barreira, o voo fica mais alto/lento o bastante para passar. O chão só existe sobre a laje; fora dela o orbe cai no vácuo. Foi removido o autoRally e as paredes de teste.

## Rival (src/input/BotController.js)
Prevê onde o orbe vai quicar, ignora bolas que vão sair, corre até um ponto alcançável, clica com pequeno erro de timing e mira no lado oposto ao seu. Dificuldade em `gameConfig.bot` (velocidade, reação, chance de falhar, imprecisão, chance de Parry perfeito).

## Arquitetura (separação simulação / entrada / visual, pensando no online)
- `src/sim/` (puro, sem THREE, passo fixo de 120 Hz, recebe intents como dados): BallPhysics, Rules, MatchState, Parry, Match.
- `src/input/`: InputManager (teclado/mouse vira intent) e BotController.
- `src/characters/`: Character, CharacterLoader (GLB com fallback), ProceduralWizard (placeholder), roster.
- `src/ui/Hud.js`, `src/arena/CourtMarkers.js` (mira e marcas de quique: verde = dentro, vermelho = fora).

## Arquivos
**Novos:** src/sim/{BallPhysics,Rules,MatchState,Parry,Match}.js, src/input/{InputManager,BotController}.js, src/characters/{Character,CharacterLoader,ProceduralWizard,roster}.js, src/ui/Hud.js, src/arena/CourtMarkers.js, scripts/simtest.mjs, public/models/LEIA-ME.txt, este relatório.
**Alterados:**
- `src/config/constants.js`: novo `gameConfig` (todo o "feeling"); `arenaConfig.orb` ficou só com o visual (raio, velocidades de referência da cor, cores) e perdeu bounceApex, hitMultiplier, autoRally e gravity.
- `src/objects/ChaosOrb.js`: virou só visual. A física saiu; `update(dt, ball)` lê o estado; `pulse()` substitui o antigo flash por rebatida; `reset()` e `consumeEvents()`/`hit()` foram removidos.
- `src/core/Game.js`: integra Match, entrada, personagens, marcadores e HUD; traduz eventos em feedback. Teclas Espaço (reiniciar orbe) e R (rebatida simulada) foram removidas; C, B e T continuam.
- `src/style.css` (estilos do HUD), `index.html` (título e idioma), `package.json` (script `npm run simtest`).

## Mago (GLB)
Coloque `ignis.glb` e `glacia.glb` em `public/models/` (instruções em LEIA-ME.txt). Sem os arquivos, aparece o mago procedural (manto, chapéu, varinha e escudo). Animações esperadas: idle, run, swing, win, lose; nomes e escala configuráveis em `roster.js`.

## O que foi testado e o que NÃO foi
- Testado: `vite build` sem erros; `npm run simtest` joga partidas completas automáticas (todas terminam, regras e placar corretos, parábolas acertam o alvo e passam acima da barreira); HUD, entrada e animação do mago procedural em DOM simulado.
- **Não testado:** o jogo rodando num navegador (não consegui abrir um aqui). Nunca vi o visual, o FPS, nem o "feeling" do Parry. É onde mais pode precisar de ajuste (ver abaixo). O GLTF também não foi testado com um modelo real.

## O que ajustar ao testar (tudo em gameConfig)
- Parry difícil/fácil demais: `parry.perfectWindow` (0,07 s), `parry.sweetTime`, `parry.reach`.
- Rali rápido/lento demais: `ball.baseSpeed`, `ball.maxSpeed`, `ball.hitMultiplier`, `ball.perfectMultiplier`.
- Rival forte/fraco: `bot.speed`, `bot.reaction`, `bot.missChance`, `bot.scatter`.
- Lobs muito altos no começo do rali (velocidade baixa, orbe sai alto): subir `ball.baseSpeed` ou descer `ball.gravity`.

## Problemas conhecidos
- O mouse também move a câmera (parallax leve); a mira compensa, mas dá um pequeno arrasto.
- Escudo e orbe foram desenhados sem referência de escala real do GLB.
- O Vite avisa que o bundle passa de 500 kB (Three.js); não afeta o jogo.
