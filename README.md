# FRS Coach

Painel administrativo responsivo para personal trainers, com login, gestão de alunos, fichas de treino, biblioteca de exercícios, avaliações e acompanhamento de evolução.

## Rodar o painel

```bash
npm install
npm install --prefix backend
npm run dev
```

O comando `npm run dev` prepara o banco local e inicia o site e a API de contas juntos. O cadastro e login do aluno usam Cloudflare Workers + D1; o Vite encaminha `/api` para a API na porta 8787. Para iniciar somente o site, use `npm run dev:frontend`. Para uma API publicada em outro domínio, informe sua URL em `VITE_API_URL` antes de compilar. A recuperação por e-mail é enviada pelo próprio Cloudflare Worker; veja [`backend/README.md`](backend/README.md) para ativá-la.

## Estrutura

- `index.html`: toda a marcação da interface, incluindo formulários e templates.
- `src/styles`: tokens visuais, base, layout, componentes e responsividade.
- `src/modules`: autenticação, rotas, estado, API e regras da interface.
- `src/main.js`: apenas importa e inicializa os módulos.
- `src/assets`: fontes e demais recursos locais.
- `public`: somente o favicon.
- `backend`: Cloudflare Worker, banco D1 e instruções de implantação na Cloudflare.

## Verificação

```bash
npm run lint
npm run build
```

As etapas específicas da API estão em `backend/README.md`.
