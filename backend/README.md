# FRS Coach — Cloudflare Workers + D1

O backend usa Cloudflare D1 (SQLite), sem PostgreSQL ou Hyperdrive. HTML, CSS e JavaScript continuam separados no frontend.

## Testar localmente

1. Na pasta backend, execute npm install.
2. No primeiro npm run dev, uma chave de sessão aleatória local será criada automaticamente em .dev.vars, sem substituir uma configuração existente.
3. Execute npm run db:migrate:local.
4. Execute npm run dev. O Worker escuta na porta 8787.
5. Na raiz do projeto, execute npm run dev. O Vite encaminha /api para o Worker local.

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

O Cloudflare Worker guarda somente o hash do token de recuperação no D1 e envia o link diretamente pelo binding `EMAIL` do Cloudflare Email Service. Render e Resend não são necessários.

1. Na Cloudflare, acesse **Compute > Email Service > Email Sending**, selecione **Onboard Domain** e escolha um domínio que esteja no DNS da sua conta. Aguarde a configuração dos registros SPF e DKIM. O endereço usado em `EMAIL_FROM`, por exemplo `noreply@seu-dominio.com`, deve pertencer ao domínio ativado.
2. No Worker, configure `PUBLIC_SITE_URL` com a URL HTTPS pública do frontend e `EMAIL_FROM` com o remetente acima. O binding `EMAIL` já está declarado em `wrangler.jsonc`. Para desenvolvimento local, adicione essas duas variáveis em `.dev.vars`; o envio local é simulado e registrado no console, sem mandar mensagem real.
3. Confira o `database_id` do D1 em `wrangler.jsonc`, aplique a migração remota com `npm run db:migrate:remote` e publique o Worker com `npm run deploy`. Publique também o frontend com o formulário de recuperação. Teste com uma conta de aluno cadastrada.

O envio para qualquer endereço de aluno exige **Workers Paid** com **Email Sending** ativo. No plano gratuito, a Cloudflare permite enviar apenas para endereços de destino verificados na conta; isso serve para testes, mas não para a recuperação de todos os alunos. Consulte a [visão geral do Email Service](https://developers.cloudflare.com/email-service/), o [guia de ativação do domínio](https://developers.cloudflare.com/email-service/get-started/send-emails/) e a [simulação local](https://developers.cloudflare.com/email-service/local-development/sending/).

Os tokens expiram em 30 minutos, são armazenados somente como hash e consumidos em um batch transacional D1. A troca de senha invalida sessões anteriores do aluno. Configure limitação de requisições na Cloudflare antes de disponibilizar os endpoints publicamente.

## Migrações

As migrações ativas ficam em migrations-d1 e são selecionadas pelo Wrangler. A pasta migrations preserva o esquema antigo apenas como histórico; não execute seus arquivos no D1. Não há conversão automática de dados existentes.

Documentação: https://developers.cloudflare.com/d1/get-started/
