import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../.dev.vars', import.meta.url)
let content = ''
try {
  content = readFileSync(file, 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

// Completa a configuração local sem substituir as demais variáveis.
if (!/^SESSION_SECRET=.+$/mu.test(content)) {
  const secret = `SESSION_SECRET=${randomBytes(32).toString('hex')}`
  content = /^SESSION_SECRET=.*$/mu.test(content)
    ? content.replace(/^SESSION_SECRET=.*$/mu, secret)
    : `${content.trimEnd()}${content.trim() ? '\n' : ''}${secret}\n`
  writeFileSync(file, content, { mode: 0o600 })
  console.log('Chave de sessão local criada em .dev.vars (não publicar).')
}
