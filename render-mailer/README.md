# Envio de recuperação pelo Render

O site e a API de contas continuam no Cloudflare. Este serviço recebe somente pedidos autenticados do Worker e usa o Resend para entregar o e-mail. Ele não guarda senhas nem tokens no disco.

1. Verifique um domínio seu no Resend e adicione no DNS do Cloudflare os registros SPF e DKIM solicitados. Crie uma chave de API de envio no Resend.
2. Crie no Render um Blueprint a partir do `render.yaml` da raiz do repositório. Configure as variáveis solicitadas:
   - `MAILER_TOKEN`: chave aleatória com pelo menos 32 caracteres, compartilhada somente com o Worker.
   - `RESEND_API_KEY`: chave de API do Resend.
   - `MAIL_FROM`: remetente do domínio verificado, por exemplo `FRS Coach <contato@seu-dominio.com>`.
   - `SITE_ORIGIN`: origem exata do site, por exemplo `https://seu-dominio.com`.
3. No Cloudflare Worker, configure `PUBLIC_SITE_URL` com a URL do site, `PASSWORD_MAILER_URL` com `https://NOME-DO-SERVICO.onrender.com/password-reset` e `PASSWORD_MAILER_TOKEN` com o mesmo valor de `MAILER_TOKEN`. Use secrets do Wrangler em produção; para desenvolvimento local, use `backend/.dev.vars`.
4. Aplique as migrações D1 e publique o Worker. Solicite a recuperação com uma conta de teste cadastrada e confira o recebimento e o uso único do link.

Em produção, `SITE_ORIGIN` e `PUBLIC_SITE_URL` devem apontar para o mesmo site. Para testes locais, ambos podem apontar para `http://localhost:5173`; nesse caso o link recebido só funcionará no computador onde o site local estiver aberto.

O plano gratuito do Render hiberna após um período ocioso e pode levar cerca de um minuto para responder ao primeiro pedido. O envio por SMTP nas portas comuns também é bloqueado nesse plano, por isso este serviço usa a API HTTPS do Resend. Para recuperação de senha em produção com resposta rápida, escolha um plano do Render que não hiberne.
