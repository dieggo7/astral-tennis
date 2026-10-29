# Astral Tennis

## Rodar local e testar online

1. Instale as dependencias com `npm install`.
2. (Opcional) Copie `.env.example` para `.env` para ajustar portas e origens.
3. Rode `npm run dev`. Isso inicia o Vite em `http://localhost:5173` e o servidor Socket.IO na porta `3001`.
4. Abra o endereco do Vite em duas abas ou dois navegadores. Selecione o mesmo formato, crie uma sala, compartilhe o codigo de seis caracteres e entre pela outra aba. Em 2v2, conecte quatro jogadores antes de iniciar.

O servidor e autoritativo para movimento, contatos, fisica do orbe, regras e placar. A simulacao compartilhada e exportada por `shared/sim.js`; o navegador usa interpolacao com 100 ms de atraso e predicao simples do movimento local.

## Acesso externo

O servidor escuta em `0.0.0.0`. Para testar com alguem fora da sua rede, exponha a porta `3001` com um tunel como ngrok ou Cloudflare Tunnel, ou hospede o processo Node em Render, Railway ou Fly.io. Sirva o cliente Vite/build separadamente e configure:

- `PORT`: porta HTTP/Socket.IO do processo Node (padrao `3001`).
- `CLIENT_ORIGIN`: origem permitida para o cliente, por exemplo `https://astral.example.com` (separe varias origens por virgula).
- `VITE_SERVER_URL`: URL publica do servidor Socket.IO usada pelo bundle do cliente, por exemplo `https://astral-server.example.com`.

Para desenvolvimento local, `CLIENT_ORIGIN` aceita qualquer origem e `VITE_SERVER_URL` assume `http://localhost:3001`. Em producao, defina `CLIENT_ORIGIN` explicitamente e use HTTPS no cliente e no servidor.

Build e verificacoes:

- `npm run build`
- `npm run simtest`
- `npm run networktest`
