import {
  activateCoach,
  clearApiSession,
  coachActivationStatus,
  coachSetupStatus,
  login,
  syncRemoteData,
} from './api-client.js'

const SESSION_KEY = 'frs-coach-session-v2'
const ACTIVATION_ENABLED = import.meta.env.VITE_COACH_ACTIVATION === 'true'

function showApp() {
  document.querySelectorAll('[data-student-screen]').forEach((screen) => {
    screen.hidden = true
  })
  document.querySelector('[data-public-screen]').hidden = true
  document.querySelector('[data-login-screen]').hidden = true
  document.querySelector('[data-app-shell]').hidden = false
  if (!location.hash || location.hash === '#login') location.hash = '#painel'
}

function showLogin() {
  document.querySelector('[data-public-screen]').hidden = true
  document.querySelector('[data-login-screen]').hidden = false
  document.querySelector('[data-app-shell]').hidden = true
  document.title = 'Acesso do Personal · FRS Coach'
  location.hash = '#login'
}

function showPublic() {
  document.querySelector('[data-public-screen]').hidden = false
  document.querySelector('[data-login-screen]').hidden = true
  document.querySelector('[data-app-shell]').hidden = true
  document.title = 'FRS Coach · Consultoria Online Personalizada'
}

function handleLocation() {
  const route = location.hash.slice(1)
  document.querySelectorAll('[data-student-screen]').forEach((screen) => {
    screen.hidden = true
  })
  const studentRoute = route.split('?')[0]
  if (studentRoute === 'ativar-painel') {
    document.querySelector('[data-public-screen]').hidden = true
    document.querySelector('[data-login-screen]').hidden = true
    document.querySelector('[data-app-shell]').hidden = true
    document.querySelector('[data-student-screen="ativar-painel"]').hidden = false
    document.title = 'Ativação do Painel · FRS Coach'
    return
  }
  if (
    ['entrar-aluno', 'cadastro-aluno', 'painel-aluno', 'recuperar-senha', 'nova-senha'].includes(
      studentRoute,
    )
  ) {
    document.querySelector('[data-public-screen]').hidden = true
    document.querySelector('[data-login-screen]').hidden = true
    document.querySelector('[data-app-shell]').hidden = true
    document.querySelector(`[data-student-screen="${studentRoute}"]`).hidden = false
    document.title = 'Área do Aluno · FRS Coach'
    return
  }
  if (!route || ['inicio', 'consultoria', 'planos', 'aluno', 'faq', 'contato'].includes(route)) {
    showPublic()
    return
  }
  if (route === 'login') {
    showLogin()
    return
  }
  if (sessionStorage.getItem(SESSION_KEY)) showApp()
  else showLogin()
}

export function initAuth() {
  const form = document.querySelector('[data-login-form]')
  const activationButton = document.querySelector('[data-coach-activation]')
  let pendingLogin = null
  const status = form.querySelector('[data-coach-login-status]')
  const button = form.querySelector('[type="submit"]')
  const setupForm = document.querySelector('[data-coach-setup-form]')
  const setupStatus = setupForm.querySelector('[role="status"]')
  const setupButton = setupForm.querySelector('[type="submit"]')
  const setupCodeInput = setupForm.elements.activationCode

  const linkSetupToken = () =>
    new URLSearchParams(location.hash.split('?')[1] || '').get('token') || ''
  const setupToken = () => linkSetupToken() || setupCodeInput.value.trim()

  async function refreshActivationButton() {
    activationButton.hidden = false
    if (!ACTIVATION_ENABLED) return
    try {
      const result = await coachActivationStatus()
      activationButton.hidden = !result.available
    } catch {
      activationButton.hidden = false
    }
  }

  async function refreshSetup() {
    if (!location.hash.startsWith('#ativar-painel')) return
    const setupInputs = setupForm.querySelectorAll('input')
    if (!ACTIVATION_ENABLED) {
      setupInputs.forEach((input) => {
        input.disabled = true
      })
      setupButton.disabled = true
      delete setupStatus.dataset.state
      setupStatus.textContent =
        'A ativação do Painel do Coach será liberada quando esta página for configurada e repassada ao novo proprietário.'
      return
    }
    setupInputs.forEach((input) => {
      input.disabled = false
    })
    const tokenCameFromLink = Boolean(linkSetupToken())
    setupCodeInput.closest('[data-activation-code-field]').hidden = tokenCameFromLink
    setupCodeInput.required = !tokenCameFromLink
    setupButton.disabled = true
    delete setupStatus.dataset.state
    if (!setupToken()) {
      setupStatus.textContent = 'Informe o código privado recebido com a entrega do sistema.'
      setupButton.disabled = false
      return
    }
    setupStatus.textContent = 'Verificando o link de ativação…'
    try {
      const result = await coachSetupStatus(setupToken())
      if (result.available) {
        setupStatus.textContent = 'Link válido. Crie a única conta administrativa deste painel.'
        setupButton.disabled = false
      } else {
        setupStatus.textContent = result.message
      }
    } catch (error) {
      setupStatus.dataset.state = 'error'
      setupStatus.textContent = error.message
    }
  }

  if (!import.meta.env.DEV && sessionStorage.getItem(SESSION_KEY) === 'local-demo')
    sessionStorage.removeItem(SESSION_KEY)
  handleLocation()
  void refreshSetup()
  void refreshActivationButton()
  activationButton.title = ACTIVATION_ENABLED
    ? 'Cadastrar o proprietário deste painel'
    : 'Saiba como funciona a ativação após a compra'
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#login' && pendingLogin) {
      pendingLogin.abort()
      pendingLogin = null
      clearApiSession()
      button.disabled = false
      status.textContent = ''
    }
    handleLocation()
    void refreshSetup()
    void refreshActivationButton()
  })

  setupForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!setupForm.reportValidity() || setupButton.disabled) return
    setupButton.disabled = true
    delete setupStatus.dataset.state
    setupStatus.textContent = 'Criando sua conta administrativa…'
    try {
      await activateCoach(Object.fromEntries(new FormData(setupForm)), setupToken())
      sessionStorage.setItem(SESSION_KEY, 'active')
      activationButton.hidden = true
      setupForm.reset()
      history.replaceState(null, '', '#painel')
      await syncRemoteData()
      showApp()
    } catch (error) {
      setupStatus.dataset.state = 'error'
      setupStatus.textContent = error.message
      setupButton.disabled = false
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    if (pendingLogin) return
    if (import.meta.env.DEV) {
      clearApiSession()
      sessionStorage.setItem(SESSION_KEY, 'local-demo')
      form.reset()
      status.textContent = ''
      showApp()
      return
    }
    const controller = new AbortController()
    pendingLogin = controller
    const credentials = Object.fromEntries(new FormData(form))
    button.disabled = true
    status.textContent = 'Verificando seus dados…'
    try {
      await login(credentials, controller.signal)
      await syncRemoteData()
      if (controller.signal.aborted || location.hash !== '#login') return
      pendingLogin = null
      sessionStorage.setItem(SESSION_KEY, 'active')
      status.textContent = ''
      showApp()
    } catch (error) {
      if (controller.signal.aborted) return
      sessionStorage.removeItem(SESSION_KEY)
      clearApiSession()
      status.textContent = error.message
    } finally {
      if (pendingLogin === controller) pendingLogin = null
      if (!pendingLogin) button.disabled = false
    }
  })

  activationButton.addEventListener('click', () => {
    location.hash = '#ativar-painel'
  })

  document.querySelector('[data-logout]').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY)
    clearApiSession()
    location.hash = '#inicio'
    showPublic()
  })
}
