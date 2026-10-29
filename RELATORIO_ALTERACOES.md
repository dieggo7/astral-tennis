<<<<<<< HEAD
# Astral Tennis — Relatório de alterações

Três rodadas: (1) MVP jogável solo; (2) ajustes de gameplay e arena (rede, orbe, mira com risco, limites de quadra, saque com minigame); (3) timing do saque aleatório e linhas menos brilhantes.

## Controles
| Ação | Controle |
|---|---|
| Mover | WASD ou setas |
| Mirar | Mouse (anel sobre a quadra rival) |
| Parry / minigame de saque | Botão esquerdo (Espaço/Enter também) |
| Ver timing do último Parry | T (depuração) |
| Câmera livre / bloom | C / B |

## Todos os valores de balanceamento: `TUNING` (topo de src/config/constants.js)
| Constante | Valor | O que faz |
|---|---|---|
| NET_HEIGHT | 0.55 | altura da rede como proporção da altura do mago (CHARACTER_HEIGHT 2.6 → rede de 1,43 un.) |
| BALL_RADIUS | 0.38 | raio do orbe (antes 0,6; -37%) |
| ARENA_MARGIN | 3.0 | borda de pedra fora das linhas (antes 1,5) |
| PERFECT_PARRY_WINDOW | 0.08 | s, tolerância do Parry perfeito |
| MAX_AIM_DEVIATION | 25 | graus, desvio máximo |
| AIM_RISK_CURVE / AIM_RISK_BASE | 2 / 0.08 | curva de risco por extremidade / risco mínimo no centro |
| AIM_TIMING_ERROR_MAX | 0.2 | s, erro de timing que gera 100% do desvio |
| SERVE_TIMEOUT | 3 | s, tempo máximo do saque (estourou = saque automático fraco) |
| SERVE_ALTERNATE_EVERY | 1 | alterna o sacador a cada N pontos (1 ou 2) |
| SERVE_ATTEMPTS | 2 | saques por ponto |
| SERVE_TIMING_MIN / MAX | 0.8 / 1.7 | s, faixa do sorteio do instante perfeito do saque |
| LINE_BRIGHTNESS / LINE_INNER_BRIGHTNESS / LINE_GLOW | 0.8 / 0.35 / 0.05 | brilho das linhas de limite, das internas e do halo |
Demais parâmetros (bot, velocidades, anel do saque) ficam em `gameConfig`.

## Rodada 2 — o que mudou

### 1. Rede mais baixa
- Altura = NET_HEIGHT × CHARACTER_HEIGHT (1,43 un.), no visual **e** na regra: o orbe precisa passar com a borda inferior acima do topo da rede.
- A altura dos obeliscos foi separada da rede (`barrier.pillarHeight`, 3,6). O feixe que liga os obeliscos agora fica na altura da rede, e o topo da barreira brilha mais: o limite fica nítido. Efeito de luz, brilho e transparência mantidos.

### 2. Orbe menor
- Raio 0,38 (colisão e visual, o mesmo valor). Compensação: halo maior, núcleo mais brilhante, anéis e rastro maiores.
- A sombra no chão tem tamanho mínimo fixo (não encolhe junto com o raio) e mais opacidade.

### 3. Mira com precisão dependente do timing (src/sim/Aim.js)
- **Parry perfeito: desvio zero.** Teste: erro médio de ~0,1 un. de 400 lançamentos (só discretização do passo).
- Fora do perfeito: `desvio = fatorDeTiming × risco(mira) × MAX_AIM_DEVIATION`, aplicado como ângulo aleatório (mais um pequeno erro de profundidade). Fator de timing = erro do clique ÷ AIM_TIMING_ERROR_MAX. Risco = curva da distância da mira ao centro da região-alvo (metade do adversário, ou caixa de saque).
- Resultado medido (400 lançamentos): timing ruim e mira no centro = 0% fora; mira intermediária = 0% fora; mira no canto = **49% fora** (timing 0,6) a **59% fora** (timing pior).
- Indicador de mira: cor vai de branco (seguro) a vermelho (arriscado); **treme** mais quanto maior o risco; um anel externo mostra o espalhamento típico de uma rebatida fora do perfeito.
- O rival usa o mesmo sistema (`bot.aimDeviationMult`). Removidos `parry.scatter*` e `bot.scatter`.

### 4. Arena maior e limites claros
- Laje com margem de 3,0 ao redor da quadra: o "fora" é visível e o orbe pode quicar ali. A câmera reenquadra sozinha (a quadra fica menor na tela; ajuste ARENA_MARGIN se quiser).
- **Linhas externas** (as que definem dentro/fora) mais grossas, mais brilhantes (bloom) e com glow forte. Linhas internas ficam discretas. As linhas de simples ficam desligadas (`court.showSinglesLines`) para não gerar dúvida de qual é o limite no 1v1; ligue no 2v2.
- Regra: quique dentro das linhas do lado adversário vale; **linha conta como dentro** (tolerância 0,25); fora = ponto de quem **não** rebateu por último.
- Feedback de **OUT!**: mensagem grande, explosão vermelha de partículas no ponto do quique, anel vermelho, shake e **slow motion** (0,75 s a 28%). Quiques dentro têm faíscas verdes discretas; fora, faíscas vermelhas.

### 5. Saque com minigame
- Todo ponto começa com saque. O receptor se posiciona durante a espera (0,7 s). Depois aparece um **anel que contrai ao redor do orbe**; clique (mesmo botão do Parry) quando ele encostar no **círculo dourado**.
- **Perfeito** (±0,09 s em torno do instante sorteado, ver Rodada 3): saque 1,5× mais rápido, preciso, com explosão dourada, shake e pausa curta. **Bom** (±0,38 s): saque normal, pouco desvio. **Ruim**: saque lento (0,62×) e muito impreciso (alta chance de falta).
- **Timeout** de 3 s: saque automático fraco ("Tempo esgotado!").
- **Caixa de saque diagonal** destacada na quadra; a mira do saque fica presa a ela. O sacador alterna de lado a cada ponto (direita primeiro) e o orbe deve cair na caixa do lado oposto.
- **Falta** (caiu fora da caixa, na própria quadra, ou na rede): 2º saque; segunda falta = **dupla falta** (ponto do receptor). Saque sem resposta = **ACE!**.
- Alternância do sacador: **a cada ponto** (padrão; troque `SERVE_ALTERNATE_EVERY` para 2). O ponto "em aberto" ficou como parâmetro.
- O rival saca com qualidade sorteada (`bot.serveQuality`).
- **2v2:** não existe ainda. A estrutura (`MatchState`) já alterna por contagem de pontos; a alternância entre as duplas e entre os jogadores de cada dupla fica para quando o 2v2 existir.

## Rodada 3
- **Timing do saque aleatório:** a cada saque (inclusive no 2º saque) o instante perfeito é sorteado entre `SERVE_TIMING_MIN` e `SERVE_TIMING_MAX` (0,8 a 1,7 s depois do anel aparecer). O anel sempre encosta no círculo dourado no instante sorteado, então a velocidade de contração muda de saque para saque e não dá para decorar o ritmo. O sorteio respeita o timeout: no pior caso a janela "boa" termina em 2,78 s (limite 3 s). O rival também usa o instante sorteado. Janelas de acerto (±0,09 s perfeito, ±0,38 s bom) não mudaram.
- **Linhas menos brilhantes:** as linhas de limite saíram de brilho 1,9 para 0,8 (abaixo do limiar do bloom, então não "estouram"), ficaram mais finas (0,26 para 0,20) e o halo caiu de 0,16 para 0,05. As linhas internas (saque, centro, rede) têm brilho próprio e bem mais baixo (0,35). A caixa de saque destacada também ficou mais discreta. Tudo ajustável em `TUNING` (LINE_*).

## Arquivos
**Novos:** src/sim/Aim.js, src/effects/Burst.js. (Rodada 1: src/sim/{BallPhysics,Rules,MatchState,Parry,Match}.js, src/input/*, src/characters/*, src/ui/Hud.js, src/arena/CourtMarkers.js, scripts/simtest.mjs.)
**Alterados na rodada 2:** constants.js (TUNING, serve, aim), Match.js (saque, faltas, mira com risco), Rules.js (caixa de saque, tipos de ponto), MatchState.js, BotController.js, Game.js (anel, caixa, partículas, slow motion, mira), CourtMarkers.js (mira com risco, ServeBox, ServeRing), Court.js (linhas), Obelisks.js, LightBarrier.js, ChaosOrb.js, Hud.js, style.css.

## Testado e não testado
- Testado: `vite build`; `npm run simtest` (partidas completas com saque por minigame, faltas, dupla falta, aces, OUT e rede; precisão da mira); `Game.handleEvents` e os marcadores rodando em Node com uma partida inteira simulada, sem exceções.
- **Não testado: o jogo num navegador** (não consegui abrir um aqui). Nunca vi o visual real: legibilidade das linhas, tamanho do orbe, enquadramento da câmera, anel do saque, nem o "feeling".

## Pontos de atenção ao testar
- Com a rede a 1,43 un., tiros de longe passam por cima em arco; o Parry perfeito pode sair mais lento que 2× quando a rede limita (é o tempo mínimo de voo para passar por cima).
- Se a quadra ficar pequena na tela: reduza ARENA_MARGIN.
- Parry/saque fácil ou difícil demais: PERFECT_PARRY_WINDOW e `serve.perfectWindow`/`goodWindow`.
- Risco de mira forte/fraco: MAX_AIM_DEVIATION, AIM_RISK_CURVE.
- Se as linhas de simples fizerem falta, `court.showSinglesLines: true`.
=======
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
>>>>>>> d06335d8faa8607b9cf40fe136addf79477a138d
