const STORAGE_KEY = 'frs-coach-data-v1'

const initialData = {
  students: [
    {
      id: 's1',
      name: 'Mariana Costa',
      email: 'mariana@email.com',
      goal: 'Emagrecimento',
      assessmentDate: '2026-09-18',
      status: 'Ativo',
      workout: 'Lower body + cardio',
      activity: 'Hoje, 08:00',
    },
    {
      id: 's2',
      name: 'Rafael Lima',
      email: 'rafael@email.com',
      goal: 'Hipertrofia',
      assessmentDate: '2026-09-22',
      status: 'Ativo',
      workout: 'Hipertrofia A/B/C',
      activity: 'Ontem, 18:30',
    },
    {
      id: 's3',
      name: 'Ana Souza',
      email: 'ana@email.com',
      goal: 'Condicionamento',
      assessmentDate: '2026-10-03',
      status: 'Ativo',
      workout: 'Funcional avançado',
      activity: 'Hoje, 14:00',
    },
    {
      id: 's4',
      name: 'Gabriel Prado',
      email: 'gabriel@email.com',
      goal: 'Força',
      assessmentDate: '2026-09-29',
      status: 'Pausado',
      workout: 'Força 5×5',
      activity: '08 set., 16:30',
    },
    {
      id: 's5',
      name: 'Juliana Alves',
      email: 'juliana@email.com',
      goal: 'Emagrecimento',
      assessmentDate: '2026-10-06',
      status: 'Ativo',
      workout: 'Full body',
      activity: '07 set., 09:00',
    },
  ],
  workouts: [
    {
      id: 'w1',
      name: 'Hipertrofia A/B/C',
      student: 'Rafael Lima',
      goal: 'Hipertrofia',
      duration: '8 semanas',
      progress: 68,
    },
    {
      id: 'w2',
      name: 'Lower body + cardio',
      student: 'Mariana Costa',
      goal: 'Emagrecimento',
      duration: '6 semanas',
      progress: 82,
    },
    {
      id: 'w3',
      name: 'Funcional avançado',
      student: 'Ana Souza',
      goal: 'Condicionamento',
      duration: '4 semanas',
      progress: 45,
    },
  ],
  exercises: [
    {
      id: 'e1',
      name: 'Agachamento livre',
      group: 'Pernas',
      equipment: 'Barra',
      instructions: 'Mantenha o tronco firme e os joelhos alinhados.',
    },
    {
      id: 'e2',
      name: 'Supino reto',
      group: 'Peitoral',
      equipment: 'Barra e banco',
      instructions: 'Controle a descida e mantenha as escápulas retraídas.',
    },
    {
      id: 'e3',
      name: 'Remada curvada',
      group: 'Costas',
      equipment: 'Barra',
      instructions: 'Preserve a coluna neutra durante o movimento.',
    },
    {
      id: 'e4',
      name: 'Desenvolvimento militar',
      group: 'Ombros',
      equipment: 'Halteres',
      instructions: 'Evite compensar com a lombar.',
    },
    {
      id: 'e5',
      name: 'Rosca direta',
      group: 'Braços',
      equipment: 'Barra W',
      instructions: 'Mantenha os cotovelos próximos ao corpo.',
    },
  ],
  assessments: [
    {
      id: 'a1',
      student: 'Mariana Costa',
      date: '11 set. 2026',
      weight: '70,4 kg',
      fat: '24,6%',
      waist: '77 cm',
    },
    {
      id: 'a2',
      student: 'Rafael Lima',
      date: '10 set. 2026',
      weight: '84,2 kg',
      fat: '15,1%',
      waist: '82 cm',
    },
    {
      id: 'a3',
      student: 'Ana Souza',
      date: '06 set. 2026',
      weight: '62,8 kg',
      fat: '22,4%',
      waist: '71 cm',
    },
  ],
}

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(initialData)
  } catch {
    return structuredClone(initialData)
  }
}

let data = loadData()

export function getData() {
  return data
}

export function updateData(callback) {
  callback(data)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('frs:data-changed'))
}

export function replaceData(nextData) {
  data = nextData
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('frs:data-changed'))
}

export function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`
}
