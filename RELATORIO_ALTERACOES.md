# Astral Tennis — Relatório de alterações

Três rodadas: (1) MVP jogável solo; (2) ajustes de gameplay e arena (rede, orbe, mira com risco, limites de quadra, saque com minigame); (3) timing do saque aleatório e linhas menos brilhantes.

## Controles
| Ação | Controle |
|---|---|
| Mover | WASD ou setas |
| Mirar | Mouse (anel sobre a quadra rival) |
| Parry / minigame de saque | Botão esquerdo (Espaço/Enter também) |
| Cortada | Botao direito durante o rali |
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
| SERVE_TIMING_MIN / MAX | 0.45 / 1.85 | s, faixa do sorteio do instante perfeito do saque |
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
- A faixa de timing agora vai de 0,45 a 1,85 s; saques consecutivos evitam repetir timings com diferenca menor que 0,22 s.
- **Cortada:** botao direito inicia o mesmo golpe/Parry, mas a bola sai com 2,25x a velocidade atual. Fora do timing perfeito ha 70% de chance de erro para fora pela lateral; no perfeito, a mira varia em ate 20% das dimensoes do alvo. O saque continua no botao esquerdo.
- **Habilidades de Ignis:** Parrys perfeitos consecutivos acumulam bônus de velocidade; `E` ativa a Investida Flamejante (recarga de 6 s), e um Parry na janela logo após o dash cria uma curva forte. `Q` ativa o Meteoro (recarga de 60 s): a bola sobe e cai no alvo da mira sem indicação no chão; o bot só começa a reagir na queda e precisa alcançar o centro para devolver.
- **Timing do saque:** o instante perfeito e sorteado em cada saque dentro da faixa de 0,45 a 1,85 s depois do anel aparecer. O anel acompanha o instante sorteado; saques consecutivos evitam timings separados por menos de 0,22 s. O timeout de 3 s continua respeitado.
- **Linhas menos brilhantes:** as linhas de limite saíram de brilho 1,9 para 0,8 (abaixo do limiar do bloom, então não "estouram"), ficaram mais finas (0,26 para 0,20) e o halo caiu de 0,16 para 0,05. As linhas internas (saque, centro, rede) têm brilho próprio e bem mais baixo (0,35). A caixa de saque destacada também ficou mais discreta. Tudo ajustável em `TUNING` (LINE_*).

## Rodada 4
- O seletor agora oferece Ignis, Glacia, Zephyr e Volta, cada um com modelo procedural próprio, passiva, habilidade, ultimate e recargas descritas. A seleção troca o modelo e os atributos do jogador.
- Glacia: janela de Parry perfeito maior; Muralha de Cristal reduz pela metade a velocidade de um tiro rápido que a atravessa; Pista de Patinação reduz a aceleração do rival na metade dele por 10 s.
- Zephyr: maior velocidade de movimento; Rajada de Vento empurra lateralmente a bola no ar; Olho do Furacão prende a bola na rede por 2 s e a dispara para o lado rival em alta velocidade e ângulo aleatório.
- Volta: as rebatidas ziguezagueiam; Curto-Circuito suspende a bola por 0,5 s e a solta; Sobrecarga dispara em linha reta na velocidade máxima e interrompe a reação do rival por um breve clarão.
- A HUD mostra os nomes e cooldowns da habilidade e ultimate do personagem escolhido. Foram adicionados efeitos visuais para gelo, vento e eletricidade.
- Ajustes de balanceamento: habilidade E de todos os personagens com recarga de 20 s; ultimates com recarga de 90 s.
- Olho do Furacão agora dispara para uma posição aleatória dentro das linhas da quadra rival.
- Muralha de Cristal ocupa toda a largura da quadra, no meio do lado de Glacia, e rebate a primeira bola que a atravessa durante a duração.
- Combustão recebeu bônus de velocidade maior por cada Parry perfeito consecutivo.

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
