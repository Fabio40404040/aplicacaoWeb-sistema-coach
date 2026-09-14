import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const backend = fileURLToPath(new URL('../backend/', import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()
let stopping = false

function start(args, cwd) {
  const child = spawn(npm, args, { cwd, stdio: 'inherit' })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)))
  })
}

function stop() {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

if (!existsSync(new URL('../backend/node_modules/.bin/wrangler', import.meta.url))) {
  console.error('Instale as dependências da API: npm install --prefix backend')
  process.exitCode = 1
} else {
  console.log('Preparando o banco de dados local…')
  const migration = start(['run', 'db:migrate:local'], backend)
  const migrationCode = await waitForExit(migration)

  if (migrationCode !== 0 || stopping) {
    process.exitCode = migrationCode || 1
  } else {
    console.log('Iniciando a API e o site…')
    const api = start(['run', 'dev'], backend)
    const site = start(['run', 'dev:frontend'], root)
    const apiExit = waitForExit(api)
    const siteExit = waitForExit(site)
    const firstExit = await Promise.race([apiExit, siteExit])
    stop()
    await Promise.allSettled([apiExit, siteExit])
    process.exitCode = stopping && firstExit === 0 ? 0 : firstExit || 1
  }
}
