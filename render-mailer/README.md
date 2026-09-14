# Recuperação de senha por e-mail

O site e as contas continuam na Cloudflare. O Worker cria um link de uso único, guarda somente o hash do token no D1 e chama o serviço do Render por HTTPS. O Render usa a API do Resend para enviar a mensagem. Nenhuma senha ou chave deve ser publicada no GitHub.

## 1. Disponibilize o código

O Render só consegue implantar arquivos que estejam no GitHub. Publique a branch `codex/email-recovery` do repositório `Fabio40404040/aplicacaoWeb-sistema-coach` (ou incorpore as alterações à branch que usa para produção). O commit local `deb23ae` contém o código da recuperação. Caso edite este guia, inclua também essa alteração na publicação.

## 2. Prepare o remetente no Resend

1. Entre em **Domains** e adicione um domínio que você controla. Pode usar um subdomínio, por exemplo `mail.seu-dominio.com`.
2. No DNS da Cloudflare, crie **exatamente** os registros que o Resend mostrar para esse domínio (SPF e DKIM; se aparecer um MX de envio, inclua-o também). Não use valores de exemplo de outros domínios. Para registros CNAME, use **DNS only**.
3. Volte ao Resend, clique em **Verify DNS Records** e aguarde o estado **Verified** para envio.
4. Em **API Keys**, crie uma chave com permissão **Sending access**, de preferência limitada a esse domínio. Copie a chave no momento da criação: o Resend não volta a mostrá-la.

Essa chave é `RESEND_API_KEY`; ela pertence **somente ao Render**. O endereço do remetente em `MAIL_FROM` precisa usar o domínio verificado, por exemplo `FRS Coach <contato@mail.seu-dominio.com>`.

## 3. Crie o serviço no Render

No painel do Render, use **New > Web Service**, selecione o repositório acima e preencha:

| Campo | Valor |
| --- | --- |
| Name | `frs-password-mailer` |
| Language | `Node` |
| Branch | `codex/email-recovery` (ou a branch publicada) |
| Root Directory | `render-mailer` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | `Free` para testes, se disponível |

Em **Environment Variables**, adicione estas quatro entradas antes de criar o serviço:

| Nome | Valor |
| --- | --- |
| `MAILER_TOKEN` | Uma chave aleatória de pelo menos 32 caracteres, gerada por você. Exemplo de comando: `openssl rand -hex 32` |
| `RESEND_API_KEY` | A chave de **Sending access** criada no Resend |
| `MAIL_FROM` | O remetente no domínio verificado, como `FRS Coach <contato@mail.seu-dominio.com>` |
| `SITE_ORIGIN` | A origem HTTPS exata do site, como `https://seu-dominio.com`, sem caminho |

Crie o serviço e aguarde o deploy terminar. O endereço será semelhante a `https://frs-password-mailer.onrender.com`; confirme que `/health` responde. **Não crie um webhook do Render** para essa função. O arquivo [`render.yaml`](../render.yaml) oferece a opção de criar o mesmo serviço como Blueprint, mas o formulário Web Service acima é suficiente.

## 4. Conecte o Worker da Cloudflare

No Worker que atende `/api/student/auth/forgot`, abra **Settings > Variables and Secrets** e configure:

| Nome | Tipo | Valor |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | Text | URL HTTPS do site, por exemplo `https://seu-dominio.com/` |
| `PASSWORD_MAILER_URL` | Text | URL HTTPS do Render terminada em `/password-reset` |
| `PASSWORD_MAILER_TOKEN` | Secret | **Exatamente a mesma** chave de `MAILER_TOKEN` no Render |

Salve e implante as variáveis. O Worker precisa estar publicado com o código desta branch e ligado ao banco D1 correto. Antes de publicar a mudança do Worker, aplique a migração `backend/migrations-d1/003_password_recovery.sql` ao D1 de produção. Pelo Wrangler, dentro de `backend`, depois de conferir o `database_id` em `wrangler.jsonc`, use `npm run db:migrate:remote` e `npm run deploy`. **Não use** o `database_id` de zeros do arquivo de exemplo para produção.

O endereço `ALLOWED_ORIGIN` do Worker também precisa ser a origem do site em produção. Se o site e o Worker usam domínios diferentes, compile o frontend com `VITE_API_URL` apontando para a URL do Worker. Publique o frontend com o formulário de recuperação.

## 5. Teste

Solicite a recuperação para uma conta de aluno já cadastrada. A mensagem deve chegar ao e-mail dessa conta. Abra o link, escolha uma nova senha e entre com ela. O link expira em 30 minutos e deixa de funcionar após o uso. Para um e-mail não cadastrado, a tela mostra a mesma resposta genérica, sem revelar quais contas existem.

Para desenvolvimento local, `PUBLIC_SITE_URL` e `SITE_ORIGIN` podem usar `http://localhost:5173`; adicione as variáveis do Worker em `backend/.dev.vars`, com os nomes de [`backend/.dev.vars.example`](../backend/.dev.vars.example). Um link local só abre no computador que está rodando o site. No Render Free, o primeiro pedido após um período ocioso pode demorar enquanto o serviço inicia; a chamada do Worker espera até 90 segundos.
