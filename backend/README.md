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

O Cloudflare Worker guarda somente o hash do token de recuperação no D1 e envia o link diretamente pelo binding `EMAIL` do Cloudflare Email Service. Render e Resend não são necessários. Esta versão opera **somente para endereços de teste autorizados**.

1. Na Cloudflare, acesse **Compute > Email Service > Email Routing**, selecione **Onboard Domain** e escolha um domínio que esteja no DNS da sua conta. Se esse domínio já recebe e-mails por outro serviço, use um subdomínio de teste para não substituir os registros MX existentes. O remetente `EMAIL_FROM`, por exemplo `noreply@teste.seu-dominio.com`, deve usar o domínio ou subdomínio ativado.
2. Em **Email Routing > Destination Addresses**, adicione o endereço de cada pessoa que poderá testar a recuperação. A pessoa precisa abrir o e-mail de verificação enviado pela Cloudflare e clicar em **Verify email address**. Não é preciso criar uma regra de roteamento para enviar a esses endereços verificados.
3. Cada endereço de teste também precisa ter uma conta de aluno cadastrada no D1. Configure no Worker `PUBLIC_SITE_URL` com a URL HTTPS pública do frontend, `EMAIL_FROM` com o remetente acima e `RECOVERY_TEST_EMAILS` com os endereços verificados separados por vírgula. Exemplo: `pessoa1@exemplo.com,pessoa2@exemplo.com`. Endereços fora da lista recebem a resposta genérica e nenhum link é enviado.
4. Confira o `database_id` do D1 em `wrangler.jsonc`, aplique a migração remota com `npm run db:migrate:remote` e publique o Worker com `npm run deploy`. Publique também o frontend com o formulário de recuperação. O binding `EMAIL` já está declarado em `wrangler.jsonc`.

Em desenvolvimento local, coloque as três variáveis no arquivo `.dev.vars`. O envio local é simulado no console e não manda uma mensagem real. No plano gratuito, a Cloudflare envia apenas para destinatários verificados na conta; para enviar a qualquer aluno no futuro será necessário Workers Paid com Email Sending ativo. Consulte a [lista de destinos verificados](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/), os [limites do plano gratuito](https://developers.cloudflare.com/email-service/platform/pricing/) e a [simulação local](https://developers.cloudflare.com/email-service/local-development/sending/).

Os tokens expiram em 30 minutos, são armazenados somente como hash e consumidos em um batch transacional D1. A troca de senha invalida sessões anteriores do aluno. Configure limitação de requisições na Cloudflare antes de disponibilizar os endpoints publicamente.

## Migrações

As migrações ativas ficam em migrations-d1 e são selecionadas pelo Wrangler. A pasta migrations preserva o esquema antigo apenas como histórico; não execute seus arquivos no D1. Não há conversão automática de dados existentes.

Documentação: https://developers.cloudflare.com/d1/get-started/
