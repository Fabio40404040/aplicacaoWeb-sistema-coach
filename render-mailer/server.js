import { createServer } from 'node:http'
import { authorized, sendViaResend, validMessage } from './mailer.js'

const config = process.env
const required = ['MAILER_TOKEN', 'RESEND_API_KEY', 'MAIL_FROM', 'SITE_ORIGIN']
const missing = required.filter((key) => !config[key])
if (missing.length || config.MAILER_TOKEN?.length < 32) {
  console.error(`Configuração de e-mail incompleta: ${missing.join(', ') || 'MAILER_TOKEN'}`)
  process.exit(1)
}

function reply(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify({ message }))
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    reply(response, 200, 'ok')
    return
  }
  if (request.method !== 'POST' || request.url !== '/password-reset') {
    reply(response, 404, 'Rota não encontrada.')
    return
  }
  if (!authorized(request.headers.authorization, config.MAILER_TOKEN)) {
    reply(response, 401, 'Não autorizado.')
    return
  }
  if (!request.headers['content-type']?.startsWith('application/json')) {
    reply(response, 415, 'Envie JSON.')
    return
  }

  try {
    let body = ''
    for await (const chunk of request) {
      body += chunk
      if (Buffer.byteLength(body) > 8192) {
        reply(response, 413, 'Corpo muito grande.')
        return
      }
    }
    const message = JSON.parse(body)
    if (!validMessage(message, config.SITE_ORIGIN)) {
      reply(response, 400, 'Dados inválidos.')
      return
    }
    await sendViaResend(message, config)
    reply(response, 202, 'Envio aceito.')
  } catch (error) {
    if (error instanceof SyntaxError) {
      reply(response, 400, 'JSON inválido.')
      return
    }
    console.error('Falha ao enviar recuperação:', error.message)
    reply(response, 502, 'Não foi possível enviar o e-mail.')
  }
})

server.listen(Number(config.PORT || 10000), '0.0.0.0')
