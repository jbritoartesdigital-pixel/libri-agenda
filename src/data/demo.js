export const professionals = [
  {
    id: 'bianca',
    name: 'Dra. Bianca',
    specialty: 'Psiquiatria',
    initials: 'DB',
    theme: {
      primary: '#6f8278',
      secondary: '#d8e0dc',
      accent: '#b88968',
      surface: '#fbfaf7',
    },
    settings: {
      onlinePlatform: 'Google Meet',
      address: 'Edifício Brasil 21 · SHS Quadra 6, Bloco A, sala 606 · Brasília/DF',
      firstOnline: 400,
      firstInPerson: 500,
      followUpOnline: 350,
      followUpInPerson: 450,
      durationMinutes: 50,
    },
  },
]

export const appointments = [
  {
    id: 1,
    professionalId: 'bianca',
    patient: 'Mariana Souza',
    time: '09:00',
    type: 'Retorno',
    modality: 'Online',
    status: 'confirmed',
    payment: 'paid',
    invoice: 'none',
  },
  {
    id: 2,
    professionalId: 'bianca',
    patient: 'Carlos Lima',
    time: '11:00',
    type: 'Primeira consulta',
    modality: 'Presencial',
    status: 'waiting',
    payment: 'pending',
    invoice: 'waiting_data',
  },
  {
    id: 3,
    professionalId: 'bianca',
    patient: 'Amanda Ribeiro',
    time: '15:00',
    type: 'Retorno',
    modality: 'Online',
    status: 'confirmed',
    payment: 'pending',
    invoice: 'ready',
  },
]

export const freeSlots = ['16:00 hoje', '10:00 amanhã', '14:00 amanhã', '09:00 segunda']
