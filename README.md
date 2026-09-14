# FRS Coach

Painel administrativo responsivo para personal trainers, com login, gestão de alunos, fichas de treino, biblioteca de exercícios, avaliações e acompanhamento de evolução.

## Rodar o painel

```bash
npm install
npm run dev
```

O painel demonstrativo do coach guarda alterações no dispositivo. O cadastro e login do aluno usam Cloudflare Workers + D1: dentro de `backend`, execute `npm run db:migrate:local` e `npm run dev`. O Vite encaminha `/api` para esse serviço na porta 8787. Para uma API publicada em outro domínio, informe sua URL em `VITE_API_URL` antes de compilar.

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
