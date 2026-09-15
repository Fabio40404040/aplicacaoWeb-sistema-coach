# FRS Coach — Cloudflare Workers + D1

O backend usa Cloudflare D1 (SQLite), sem PostgreSQL ou Hyperdrive. HTML, CSS e JavaScript continuam separados no frontend.

## Testar localmente

1. Instale as dependências na raiz e em `backend` com `npm install` e `npm install --prefix backend`.
2. Copie `.dev.vars.example` para `.dev.vars` e preencha as configurações de e-mail. Nunca publique esse arquivo.
3. Na raiz do projeto, execute `npm run dev`. O comando aplica as migrações locais e inicia o Worker na porta 8787 e o Vite na porta 5173.
4. Se `SESSION_SECRET` estiver ausente ou vazia, o inicializador cria automaticamente uma chave aleatória sem substituir as outras variáveis.

Configuração local:

```env
SESSION_SECRET=chave-aleatoria-com-pelo-menos-32-caracteres
ADMIN_SETUP_TOKEN=outro-token-aleatorio-com-pelo-menos-32-caracteres
PUBLIC_SITE_URL=http://localhost:5173/
EMAIL_FROM=remetente-verificado@gmail.com
BREVO_API_KEY=xkeysib-chave-completa-da-brevo
```

Para iniciar somente a interface, use `npm run dev:frontend`. O Vite encaminha `/api` para o Worker local, que precisa estar em execução para cadastro e login.

O banco local é persistido pelo Wrangler em `.wrangler/state`. Ele é separado do D1 de produção. Um token criado localmente deve abrir `http://localhost:5173/` e ser consumido pela API local.

## Publicar na Cloudflare

1. Autentique o Wrangler com npx wrangler login.
2. Crie o banco com npx wrangler d1 create frs-coach.
3. Em wrangler.jsonc, substitua database_id pelo ID retornado. O binding deve continuar DB.
4. Execute npm run db:migrate:remote.
5. Cadastre as chaves de produção com `npx wrangler secret put SESSION_SECRET`, `npx wrangler secret put ADMIN_SETUP_TOKEN` e `npx wrangler secret put BREVO_API_KEY`.
6. Configure as variáveis de produção conforme a tabela abaixo.
7. Execute npm run deploy.
8. Defina VITE_API_URL com a URL do Worker antes de compilar/publicar o frontend.

Não publique com o ID composto por zeros. Nenhum banco remoto é criado pelos comandos locais.

### Variáveis do Worker em produção

Cadastre em **Workers & Pages > frs-coach-api > Settings > Variables and Secrets**:

| Nome                  | Tipo   | Valor                                                                      |
| --------------------- | ------ | -------------------------------------------------------------------------- |
| `SESSION_SECRET`      | Secret | Uma chave diferente da usada localmente, gerada com `openssl rand -hex 32` |
| `ADMIN_SETUP_TOKEN`   | Secret | Token exclusivo usado no link de ativação única do comprador               |
| `BREVO_API_KEY`       | Secret | A API key completa criada na Brevo, com apenas um prefixo `xkeysib-`       |
| `PUBLIC_SITE_URL`     | Text   | URL pública do frontend com `/` no fim                                     |
| `EMAIL_FROM`          | Text   | Mesmo endereço verificado como remetente na Brevo                          |
| `ALLOWED_ORIGIN`      | Text   | Origem exata do frontend, sem `/` no fim                                   |
| `SESSION_TTL_SECONDS` | Text   | `43200` por padrão                                                         |

Para esta demonstração, os valores públicos são:

```text
PUBLIC_SITE_URL=https://aplicacaoweb-sistema-coach.pages.dev/
ALLOWED_ORIGIN=https://aplicacaoweb-sistema-coach.pages.dev
```

Depois de alterar variáveis, salve e implante novamente o Worker. Secrets aparecem como `Value encrypted` após serem salvos.

### Variável do Pages

Se o frontend e a API estiverem em domínios diferentes, cadastre `VITE_API_URL` no ambiente **Production** do projeto Pages com a URL pública do Worker, sem `/` no fim. Depois repita a implantação do Pages para recompilar o JavaScript. Quando `/api` já estiver roteado para o Worker no mesmo domínio, `VITE_API_URL` pode permanecer vazio.

Enquanto o site estiver no portfólio, mantenha `VITE_COACH_ACTIVATION=false`. O botão **Ativar Painel do Coach** abrirá o formulário para visualização, com os campos bloqueados e um aviso de que a ativação será liberada na entrega. Na entrega, configure `VITE_COACH_ACTIVATION=true` no Pages e implante novamente para o comprador informar o código privado e criar a conta administrativa única.

## Primeiro personal

Para o comprador criar a própria conta administrativa, gere outro valor com `openssl rand -hex 32`, salve-o no secret `ADMIN_SETUP_TOKEN` do Worker e entregue este link de forma privada:

```text
https://SEU-SITE.pages.dev/#ativar-painel?token=COLE_O_ADMIN_SETUP_TOKEN
```

O link aceita o primeiro cadastro somente enquanto a tabela `trainers` estiver vazia. Depois da criação, a API desativa a ativação, o mesmo link não permite cadastrar outra pessoa e o botão **Ativar Painel do Coach** desaparece automaticamente. Em seguida, apague a mensagem que continha o link; você também pode remover o secret `ADMIN_SETUP_TOKEN` do Worker.

Como alternativa administrativa, gere o hash com `node scripts/hash-password.mjs SUA_SENHA` e insira diretamente no D1:

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

No desenvolvimento local, a Brevo também envia uma mensagem real. Use `PUBLIC_SITE_URL=http://localhost:5173/` e abra o link no mesmo computador. Para compradores testarem, use o Pages, o Worker e o D1 publicados; não misture tokens do banco local com o banco remoto.

Sem domínio próprio, a Brevo pode substituir o endereço remetente por um endereço técnico para atender às regras dos provedores de e-mail. Isso serve para demonstrações, mas pode ter menor reconhecimento e entrega em spam. O plano gratuito permite até 300 envios por dia. Veja como [criar e verificar um remetente](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email) e os [limites do plano gratuito](https://help.brevo.com/hc/pt/articles/208580669-FAQ-Quais-s%C3%A3o-os-limites-do-plano-Gr%C3%A1tis).

Os tokens expiram em 30 minutos, são armazenados somente como hash e consumidos em um batch transacional D1. A troca de senha invalida sessões anteriores do aluno. Configure limitação de requisições na Cloudflare antes de disponibilizar os endpoints publicamente.

O endpoint responde com a mesma mensagem para contas existentes e inexistentes, evitando revelar quais endereços estão cadastrados. Para a mesma conta, um novo link só pode ser solicitado depois de dois minutos.

### Diagnóstico da recuperação

- `A recuperação por e-mail ainda não está disponível`: falta `BREVO_API_KEY`, `EMAIL_FROM` ou `PUBLIC_SITE_URL` no ambiente que está executando o Worker.
- `Não foi possível enviar a recuperação agora`: a chamada chegou à Brevo, mas o envio foi recusado. Consulte o erro detalhado no console do Worker.
- `401 Key not found`: a API key está incorreta, foi excluída ou recebeu o prefixo `xkeysib-` duas vezes. Revogue a chave exposta, gere outra e cole seu valor completo apenas uma vez.
- Remetente recusado: confirme em **Senders** na Brevo que o endereço de `EMAIL_FROM` aparece como verificado.
- Link expirado ou já utilizado: solicite outro link. O token vale por 30 minutos e funciona uma única vez.
- Login falha com `SESSION_SECRET`: configure pelo menos 32 caracteres e reinicie o Worker para ele recarregar o ambiente.

Nunca coloque `BREVO_API_KEY`, `SESSION_SECRET` ou o arquivo `.dev.vars` em commits, mensagens ou capturas de tela. Se uma chave for exposta, revogue-a e substitua-a no ambiente local e no Worker publicado.

## Migrações

As migrações ativas ficam em migrations-d1 e são selecionadas pelo Wrangler. A pasta migrations preserva o esquema antigo apenas como histórico; não execute seus arquivos no D1. Não há conversão automática de dados existentes.

Documentação: https://developers.cloudflare.com/d1/get-started/
