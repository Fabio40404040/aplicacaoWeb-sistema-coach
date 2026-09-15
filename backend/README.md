# FRS Coach — Cloudflare Workers + D1

O backend usa Cloudflare D1 (SQLite), sem PostgreSQL ou Hyperdrive. HTML, CSS e JavaScript continuam separados no frontend.

## Testar localmente

1. Instale as dependências na raiz e em `backend` com `npm install` e `npm install --prefix backend`.
2. Na raiz do projeto, execute `npm run dev`. O comando aplica as migrações locais e inicia o Worker na porta 8787 e o Vite na porta 5173.
3. No primeiro início do Worker, uma chave de sessão aleatória local será criada automaticamente em `.dev.vars`, sem substituir uma configuração existente.

Para iniciar somente a interface, use `npm run dev:frontend`. O Vite encaminha `/api` para o Worker local, que precisa estar em execução para cadastro e login.

O banco local é persistido pelo Wrangler em .wrangler/state. Não é o banco de produção.

## Publicar na Cloudflare

1. Autentique o Wrangler com npx wrangler login.
2. Crie o banco com npx wrangler d1 create frs-coach.
3. Em wrangler.jsonc, substitua database_id pelo ID retornado. O binding deve continuar DB.
4. Execute npm run db:migrate:remote.
5. Cadastre a chave de produção com npx wrangler secret put SESSION_SECRET.
6. Ajuste ALLOWED_ORIGIN para a origem HTTPS do frontend.
7. Execute npm run deploy.
8. Defina VITE_API_URL com a URL do Worker antes de compilar/publicar o frontend.

Não publique com o ID composto por zeros. Nenhum banco remoto é criado pelos comandos locais.

## Primeiro personal

Gere o hash com node scripts/hash-password.mjs SUA_SENHA e insira no D1:

```sql
INSERT INTO trainers (name, email, password_hash)
VALUES ('Fabio Rocha', 'personal@frscoach.com', 'COLE_AQUI_O_HASH_GERADO');
```

O registro do aluno é separado da conta do personal. Tokens de aluno não acessam a administração. A vinculação autorizada entre contas de aluno e fichas de treino ainda está pendente; o painel mostra a espera por liberação.

## Recuperação de senha

O Cloudflare Worker guarda somente o hash do token no D1 e envia o link pela API da Brevo. Qualquer pessoa que criar uma conta de aluno com um e-mail válido poderá pedir a recuperação; não há lista manual de destinatários.

1. Crie uma conta gratuita na Brevo.
2. Em **Settings > Senders, Domains & Dedicated IPs > Senders**, adicione um remetente. Para demonstração sem domínio próprio, use um e-mail seu, como Gmail, e confirme o código de seis dígitos recebido nesse endereço.
3. Em **SMTP & API > API Keys**, crie uma API key.
4. No Worker publicado, salve a chave como secret com `npx wrangler secret put BREVO_API_KEY`.
5. Configure `EMAIL_FROM` com o mesmo endereço verificado na Brevo.
6. Configure `PUBLIC_SITE_URL` com a URL HTTPS pública do frontend, incluindo `/` no fim. O link enviado abrirá essa página em `#nova-senha?token=...`.
7. Confira o `database_id` do D1 em `wrangler.jsonc`, aplique a migração remota com `npm run db:migrate:remote` e publique o Worker com `npm run deploy`.

No desenvolvimento local, copie os campos de `.dev.vars.example` para `.dev.vars`. A Brevo enviará uma mensagem real. `PUBLIC_SITE_URL=http://localhost:5173/` funciona quando o link é aberto no mesmo computador; para compradores testarem de outros dispositivos, use a URL pública do frontend.

Sem domínio próprio, a Brevo pode substituir o endereço remetente por um endereço técnico para atender às regras dos provedores de e-mail. Isso serve para demonstrações, mas pode ter menor reconhecimento e entrega em spam. O plano gratuito permite até 300 envios por dia. Veja como [criar e verificar um remetente](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email) e os [limites do plano gratuito](https://help.brevo.com/hc/pt/articles/208580669-FAQ-Quais-s%C3%A3o-os-limites-do-plano-Gr%C3%A1tis).

Os tokens expiram em 30 minutos, são armazenados somente como hash e consumidos em um batch transacional D1. A troca de senha invalida sessões anteriores do aluno. Configure limitação de requisições na Cloudflare antes de disponibilizar os endpoints publicamente.

## Migrações

As migrações ativas ficam em migrations-d1 e são selecionadas pelo Wrangler. A pasta migrations preserva o esquema antigo apenas como histórico; não execute seus arquivos no D1. Não há conversão automática de dados existentes.

Documentação: https://developers.cloudflare.com/d1/get-started/
