/**
 * Personagens do MVP. Todos usam modelos procedurais locais para manter o elenco leve
 * e disponível sem downloads de modelos externos.
 */
export const ROSTER = {
  ignis: {
    id: 'ignis', name: 'Ignis', title: 'o Piromante', element: 'Fogo', focus: 'Agressividade e velocidade',
    color: '#d8341c', accent: '#ffb347', model: null, procedural: true, scale: 1, yawOffset: 0, speed: 9.5, perfectWindow: 0.08,
    passiveName: 'Combustão', passiveDescription: 'Cada Parry perfeito consecutivo aumenta a velocidade da bola com um bônus exclusivo de Ignis.',
    abilityName: 'Investida Flamejante', abilityDescription: 'Avança rapidamente na direção da bola. Um Parry logo após a investida ganha uma curva muito fechada.', abilityCooldown: 20,
    ultimateName: 'Meteoro', ultimateDescription: 'Lança a bola para o alto e a faz cair no lado adversário. O bot só reage durante a queda e precisa alcançar o centro exato para devolver.', ultimateCooldown: 90,
  },
  glacia: {
    id: 'glacia', name: 'Glacia', title: 'a Criomante', element: 'Gelo', focus: 'Defesa e quebra de ritmo',
    color: '#2f7fd8', accent: '#9be8ff', model: null, procedural: true, scale: 1, yawOffset: 0, speed: 9.5, perfectWindow: 0.12,
    passiveName: 'Pés Frios', passiveDescription: 'Tem uma janela de Parry perfeito 50% maior para segurar a pressão.',
    abilityName: 'Muralha de Cristal', abilityDescription: 'Ergue uma parede de lado a lado na própria quadra. A primeira bola que a tocar é rebatida de volta.', abilityCooldown: 20,
    ultimateName: 'Pista de Patinação', ultimateDescription: 'Congela a metade adversária por 10 segundos. O rival perde tração e tem dificuldade para frear e se posicionar.', ultimateCooldown: 90,
  },
  zephyr: {
    id: 'zephyr', name: 'Zephyr', title: 'o Aeromante', element: 'Vento', focus: 'Mobilidade e trajetória',
    color: '#168e75', accent: '#8dffd2', model: null, procedural: true, scale: 1, yawOffset: 0, speed: 12, perfectWindow: 0.08,
    passiveName: 'Pés de Vento', passiveDescription: 'Move-se mais rápido que os outros magos e cobre a quadra com facilidade.',
    abilityName: 'Rajada de Vento', abilityDescription: 'Emite um pulso sem tocar na bola e a empurra para um dos lados enquanto está no ar.', abilityCooldown: 20,
    ultimateName: 'Olho do Furacão', ultimateDescription: 'Um tornado no centro da rede suga a bola por 2 segundos e a cospe para o lado adversário em alta velocidade e ângulo aleatório.', ultimateCooldown: 90,
  },
  volta: {
    id: 'volta', name: 'Volta', title: 'o Eletromante', element: 'Eletricidade', focus: 'Ataques erráticos e reflexos',
    color: '#6946c8', accent: '#ffe45c', model: null, procedural: true, scale: 1, yawOffset: 0, speed: 9.5, perfectWindow: 0.08,
    passiveName: 'Fio Desencapado', passiveDescription: 'Suas rebatidas fazem a bola ziguezaguear em cortes curtos e difíceis de ler.',
    abilityName: 'Curto-Circuito', abilityDescription: 'Para a bola no ar por meio segundo, solta uma faísca e retoma a velocidade de repente.', abilityCooldown: 20,
    ultimateName: 'Sobrecarga', ultimateDescription: 'Converte a bola em um raio reto na velocidade máxima e desorienta o bot com um clarão rápido.', ultimateCooldown: 90,
  },
};

export const MVP_MATCHUP = { player: 'ignis', bot: 'glacia' };
