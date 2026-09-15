import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const backend = fileURLToPath(new URL('../backend/', import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()
let stopping = false

function start(args, cwd) {
  const child = spawn(npm, args, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: process.platform !== 'win32',
  })
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

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (open) => {
      socket.destroy()
      resolve(open)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(250, () => finish(false))
  })
}

async function waitForPort(port, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (!stopping && Date.now() < deadline) {
    if (await portIsOpen(port)) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

function stop() {
  if (stopping) return
  stopping = true
  for (const child of children) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
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
    const apiExit = waitForExit(api)
    const apiStart = await Promise.race([
      waitForPort(8787).then((ready) => ({ ready })),
      apiExit.then((code) => ({ ready: false, code })),
    ])
    if (!apiStart.ready || stopping) {
      console.error('A API local não conseguiu iniciar na porta 8787.')
      stop()
      await Promise.allSettled([apiExit])
      process.exitCode = apiStart.code || 1
    } else {
      console.log('API pronta. Iniciando o site…')
      const site = start(['run', 'dev:frontend'], root)
      const siteExit = waitForExit(site)
      const firstExit = await Promise.race([apiExit, siteExit])
      stop()
      await Promise.allSettled([apiExit, siteExit])
      process.exitCode = stopping && firstExit === 0 ? 0 : firstExit || 1
    }
  }
}
