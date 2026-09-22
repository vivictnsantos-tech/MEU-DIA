/* ================================================================
   MEU DIA — script.js
   Organizado em seções:
   1. Utilitários de data e formatação
   2. Persistência (LocalStorage)
   3. Dados de demonstração (primeira abertura)
   4. Estado da aplicação e helpers de atividades/rotinas
   5. Navegação entre telas
   6. Renderização: Hoje, Amanhã, Calendário, Pendentes, Rotinas
   7. Modal de cadastro/edição de atividade
   8. Menu de ações do item (concluir, editar, excluir, etc.)
   9. Pendências (resolução)
   10. Categorias
   11. Progresso / estatísticas
   12. Configurações (backup, tema, etc.)
   13. Modo Foco
   14. Lembretes e notificações
   15. Inicialização
   ================================================================ */

'use strict';

/* ================================================================
   1. UTILITÁRIOS DE DATA E FORMATAÇÃO
   ================================================================ */

const DIAS_SEMANA = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const DIAS_SEMANA_ABREV = ['dom','seg','ter','qua','qui','sex','sáb'];
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

// Retorna a data local de hoje no formato YYYY-MM-DD (evita bug de fuso do toISOString)
function hojeStr() {
  return formatarDataISO(new Date());
}

function formatarDataISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function amanhaStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatarDataISO(d);
}

function somarDias(dataStr, dias) {
  const d = new Date(dataStr + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return formatarDataISO(d);
}

function dataExtensa(dataStr) {
  const d = new Date(dataStr + 'T00:00:00');
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function dataCurta(dataStr) {
  const d = new Date(dataStr + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function horaAtualStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function gerarId(prefixo) {
  return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ================================================================
   2. PERSISTÊNCIA (LOCALSTORAGE)
   ================================================================ */

const CHAVES = {
  activities: 'meudia_activities',
  routines: 'meudia_routines',
  categories: 'meudia_categories',
  settings: 'meudia_settings',
  completions: 'meudia_completions',
  fired: 'meudia_fired_reminders',
  history: 'meudia_history',
  installed: 'meudia_onboarded'
};

function salvar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (e) {
    console.error('Não foi possível salvar os dados localmente.', e);
    mostrarAvisoSalvamento();
  }
}

function carregar(chave, padrao) {
  try {
    const raw = localStorage.getItem(chave);
    if (raw === null) return padrao;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Não foi possível ler os dados salvos.', e);
    return padrao;
  }
}

let avisoSalvamentoMostrado = false;
function mostrarAvisoSalvamento() {
  if (avisoSalvamentoMostrado) return;
  avisoSalvamentoMostrado = true;
  alert('Não foi possível salvar suas alterações neste dispositivo. Verifique o espaço de armazenamento do navegador.');
}

/* ================================================================
   3. INICIALIZAÇÃO VAZIA (primeira abertura — sem dados de exemplo)
   ================================================================ */

// Categorias sugeridas na tela de boas-vindas (cores usadas se a pessoa escolher alguma)
const CATEGORIAS_SUGERIDAS = {
  'Trabalho': '#1F5C54',
  'Casa': '#E8836B',
  'Saúde': '#8E6BA8',
  'Estudos': '#1B3A4B',
  'Lazer': '#D9A441',
  'Pessoal': '#5B8FBF'
};

function inicializarDadosVazios() {
  salvar(CHAVES.categories, []);
  salvar(CHAVES.activities, []);
  salvar(CHAVES.routines, []);
  salvar(CHAVES.completions, {});
  salvar(CHAVES.fired, []);
  salvar(CHAVES.history, {});
}

/* ================================================================
   4. ESTADO DA APLICAÇÃO
   ================================================================ */

const state = {
  activities: [],
  routines: [],
  categories: [],
  settings: {},
  completions: {},   // chave: routineId + '|' + data -> { done, subtasksDone: {} }
  fired: [],          // lista de instanceId+data já notificados
  history: {},         // chave: data -> { done: n, total: n } (para o gráfico/streak)
  currentDate: hojeStr(),
  calendarViewDate: new Date(),
  calendarMode: 'month',
  selectedCalendarDay: hojeStr(),
  hideDoneToday: false,
  editingActivityId: null,
  editingIsRoutine: false,
  focusActivityRef: null, // {id, isRoutine, date}
  focusTimer: { seconds: 0, total: 0, running: false, intervalId: null },
  itemActionsContext: null,
  confirmCallback: null
};

const SETTINGS_PADRAO = {
  userName: '',
  theme: 'light',
  notifications: false,
  sounds: true,
  firstDayOfWeek: 0,
  onboarded: false
};

function carregarEstado() {
  state.activities = carregar(CHAVES.activities, []);
  state.routines = carregar(CHAVES.routines, []);
  state.categories = carregar(CHAVES.categories, []);
  state.settings = Object.assign({}, SETTINGS_PADRAO, carregar(CHAVES.settings, {}));
  state.completions = carregar(CHAVES.completions, {});
  state.fired = carregar(CHAVES.fired, []);
  state.history = carregar(CHAVES.history, {});
}

function salvarAtividades() { salvar(CHAVES.activities, state.activities); }
function salvarRotinas() { salvar(CHAVES.routines, state.routines); }
function salvarCategorias() { salvar(CHAVES.categories, state.categories); }
function salvarSettings() { salvar(CHAVES.settings, state.settings); }
function salvarCompletions() { salvar(CHAVES.completions, state.completions); }
function salvarFired() { salvar(CHAVES.fired, state.fired); }
function salvarHistory() { salvar(CHAVES.history, state.history); }

/* ================================================================
   HELPERS DE ATIVIDADES E ROTINAS
   ================================================================ */

function buscarCategoria(id) {
  return state.categories.find((c) => c.id === id);
}

function rotinaOcorreEm(rotina, dataStr) {
  if (!rotina.active || rotina.paused) return false;
  if (rotina.skipDates && rotina.skipDates.includes(dataStr)) return false;
  if (dataStr < rotina.startDate) return false;
  if (rotina.endDate && dataStr > rotina.endDate) return false;

  const d = new Date(dataStr + 'T00:00:00');
  const inicio = new Date(rotina.startDate + 'T00:00:00');
  const dow = d.getDay();

  switch (rotina.recurrence) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return dow === inicio.getDay();
    case 'monthly': return d.getDate() === inicio.getDate();
    case 'custom-days': return (rotina.days || []).includes(dow);
    case 'interval': {
      const diff = Math.round((d - inicio) / 86400000);
      return diff >= 0 && rotina.interval > 0 && diff % rotina.interval === 0;
    }
    default: return false;
  }
}

// Retorna todas as ocorrências (atividades + rotinas) de uma data, já "achatadas"
// em um formato comum usado pela interface.
function ocorrenciasDoDia(dataStr) {
  const itens = [];

  state.activities
    .filter((a) => a.date === dataStr)
    .forEach((a) => itens.push(normalizarAtividade(a)));

  state.routines.forEach((r) => {
    if (rotinaOcorreEm(r, dataStr)) {
      itens.push(normalizarOcorrenciaRotina(r, dataStr));
    }
  });

  itens.sort((a, b) => {
    if (!!a.time !== !!b.time) return a.time ? -1 : 1;
    if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
    return (a.order || 0) - (b.order || 0);
  });

  return itens;
}

function normalizarAtividade(a) {
  return {
    id: a.id,
    isRoutine: false,
    routineId: null,
    date: a.date,
    title: a.title,
    description: a.description || '',
    time: a.time || '',
    endTime: a.endTime || '',
    category: a.category || '',
    priority: a.priority || 'media',
    type: a.type || 'tarefa',
    reminderMinutes: a.reminderMinutes ?? null,
    reminderCustom: a.reminderCustom || '',
    subtasks: a.subtasks || [],
    notes: a.notes || '',
    focusModeAllowed: !!a.focusModeAllowed,
    completed: !!a.completed,
    order: a.order || 0
  };
}

function normalizarOcorrenciaRotina(r, dataStr) {
  const chave = r.id + '|' + dataStr;
  const comp = state.completions[chave] || { done: false, subtasksDone: {} };
  const subtasks = (r.subtasks || []).map((s) => ({
    id: s.id, text: s.text, done: !!comp.subtasksDone[s.id]
  }));
  return {
    id: chave,
    isRoutine: true,
    routineId: r.id,
    date: dataStr,
    title: r.title,
    description: r.description || '',
    time: r.time || '',
    endTime: r.endTime || '',
    category: r.category || '',
    priority: r.priority || 'media',
    type: 'rotina',
    reminderMinutes: r.reminderMinutes ?? null,
    reminderCustom: r.reminderCustom || '',
    subtasks,
    notes: r.notes || '',
    focusModeAllowed: !!r.focusModeAllowed,
    completed: !!comp.done,
    order: 0
  };
}

// Localiza o objeto "cru" (atividade ou rotina) por um item normalizado
function objetoOriginal(itemNormalizado) {
  if (itemNormalizado.isRoutine) {
    return state.routines.find((r) => r.id === itemNormalizado.routineId);
  }
  return state.activities.find((a) => a.id === itemNormalizado.id);
}

function marcarConcluido(itemNormalizado, concluido) {
  if (itemNormalizado.isRoutine) {
    const chave = itemNormalizado.routineId + '|' + itemNormalizado.date;
    const comp = state.completions[chave] || { done: false, subtasksDone: {} };
    comp.done = concluido;
    state.completions[chave] = comp;
    salvarCompletions();
  } else {
    const a = state.activities.find((x) => x.id === itemNormalizado.id);
    if (a) { a.completed = concluido; salvarAtividades(); }
  }
  registrarHistoricoDoDia(itemNormalizado.date);
}

function marcarSubtarefa(itemNormalizado, subtaskId, concluido) {
  if (itemNormalizado.isRoutine) {
    const chave = itemNormalizado.routineId + '|' + itemNormalizado.date;
    const comp = state.completions[chave] || { done: false, subtasksDone: {} };
    comp.subtasksDone[subtaskId] = concluido;
    state.completions[chave] = comp;
    salvarCompletions();
  } else {
    const a = state.activities.find((x) => x.id === itemNormalizado.id);
    if (a) {
      const s = (a.subtasks || []).find((x) => x.id === subtaskId);
      if (s) { s.done = concluido; salvarAtividades(); }
    }
  }
}

function excluirItem(itemNormalizado) {
  if (itemNormalizado.isRoutine) {
    // Exclusão de uma ocorrência específica: apenas marca a data como "pulada"
    const r = state.routines.find((x) => x.id === itemNormalizado.routineId);
    if (r) {
      r.skipDates = r.skipDates || [];
      if (!r.skipDates.includes(itemNormalizado.date)) r.skipDates.push(itemNormalizado.date);
      salvarRotinas();
    }
  } else {
    state.activities = state.activities.filter((a) => a.id !== itemNormalizado.id);
    salvarAtividades();
  }
}

function duplicarItem(itemNormalizado) {
  const original = objetoOriginal(itemNormalizado);
  const fonte = itemNormalizado.isRoutine ? {
    title: original.title, description: original.description, time: original.time,
    endTime: original.endTime, category: original.category, priority: original.priority,
    type: 'tarefa', reminderMinutes: original.reminderMinutes, reminderCustom: original.reminderCustom,
    subtasks: (original.subtasks || []).map((s) => ({ id: gerarId('sub'), text: s.text, done: false })),
    notes: original.notes, focusModeAllowed: original.focusModeAllowed
  } : original;

  const nova = {
    id: gerarId('act'),
    title: fonte.title + ' (cópia)',
    description: fonte.description || '',
    date: itemNormalizado.date,
    time: fonte.time || '',
    endTime: fonte.endTime || '',
    category: fonte.category || '',
    priority: fonte.priority || 'media',
    type: itemNormalizado.isRoutine ? 'tarefa' : (fonte.type || 'tarefa'),
    reminderMinutes: fonte.reminderMinutes ?? null,
    reminderCustom: fonte.reminderCustom || '',
    subtasks: (fonte.subtasks || []).map((s) => ({ id: gerarId('sub'), text: s.text, done: false })),
    notes: fonte.notes || '',
    focusModeAllowed: !!fonte.focusModeAllowed,
    completed: false,
    order: (maiorOrdemDoDia(itemNormalizado.date) + 1),
    createdAt: Date.now()
  };
  state.activities.push(nova);
  salvarAtividades();
  return nova;
}

function maiorOrdemDoDia(dataStr) {
  const itens = state.activities.filter((a) => a.date === dataStr);
  return itens.reduce((max, a) => Math.max(max, a.order || 0), -1);
}

function moverParaData(itemNormalizado, novaData) {
  if (itemNormalizado.isRoutine) {
    // Para uma rotina, "mover" uma ocorrência = pular na data antiga e
    // duplicar como tarefa avulsa na nova data.
    excluirItem(itemNormalizado);
    duplicarItem(Object.assign({}, itemNormalizado, { date: novaData }));
  } else {
    const a = state.activities.find((x) => x.id === itemNormalizado.id);
    if (a) { a.date = novaData; a.order = maiorOrdemDoDia(novaData) + 1; salvarAtividades(); }
  }
}

function transformarEmRotina(itemNormalizado, recorrencia) {
  const original = objetoOriginal(itemNormalizado);
  if (!original || itemNormalizado.isRoutine) return;
  const nova = {
    id: gerarId('rot'),
    title: original.title, description: original.description || '',
    time: original.time || '', endTime: original.endTime || '',
    category: original.category || '', priority: original.priority || 'media',
    type: 'rotina',
    reminderMinutes: original.reminderMinutes ?? null, reminderCustom: original.reminderCustom || '',
    subtasks: (original.subtasks || []).map((s) => ({ id: gerarId('sub'), text: s.text, done: false })),
    notes: original.notes || '', focusModeAllowed: !!original.focusModeAllowed,
    recurrence: recorrencia || 'daily', days: [], interval: null,
    startDate: itemNormalizado.date, endDate: '', active: true, paused: false, skipDates: [],
    createdAt: Date.now()
  };
  state.routines.push(nova);
  state.activities = state.activities.filter((a) => a.id !== itemNormalizado.id);
  salvarRotinas();
  salvarAtividades();
}

function registrarHistoricoDoDia(dataStr) {
  const itens = ocorrenciasDoDia(dataStr);
  const total = itens.length;
  const done = itens.filter((i) => i.completed).length;
  state.history[dataStr] = { done, total };
  salvarHistory();
}

/* ================================================================
   5. NAVEGAÇÃO ENTRE TELAS
   ================================================================ */

function irParaTela(idTela) {
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
  const alvo = document.getElementById(idTela);
  if (alvo) alvo.classList.add('active');

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === idTela);
  });

  const principais = ['screen-today', 'screen-tomorrow', 'screen-calendar', 'screen-routines', 'screen-more'];
  const fab = document.getElementById('fab-add');
  fab.style.display = principais.includes(idTela) && idTela !== 'screen-more' ? 'flex' : 'none';

  renderizarTelaAtual(idTela);
  window.scrollTo(0, 0);
}

function renderizarTelaAtual(idTela) {
  switch (idTela) {
    case 'screen-today': renderizarHoje(); break;
    case 'screen-tomorrow': renderizarAmanha(); break;
    case 'screen-calendar': renderizarCalendario(); break;
    case 'screen-pending': renderizarPendentes(); break;
    case 'screen-routines': renderizarRotinas(); break;
    case 'screen-progress': renderizarProgresso(); break;
    case 'screen-categories': renderizarCategorias(); break;
    case 'screen-settings': renderizarConfiguracoes(); break;
  }
}

function configurarNavegacao() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => irParaTela(btn.dataset.screen));
  });
  document.querySelectorAll('.more-item[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => irParaTela(btn.dataset.target));
  });
  document.querySelectorAll('.btn-back').forEach((btn) => {
    btn.addEventListener('click', () => irParaTela(btn.dataset.back));
  });
  document.getElementById('more-settings').addEventListener('click', () => irParaTela('screen-settings'));
  document.getElementById('more-capacitor').addEventListener('click', mostrarInfoCapacitor);
}

function mostrarInfoCapacitor() {
  alert(
    'Para levar o Meu Dia ao celular com lembretes nativos confiáveis:\n\n' +
    '1. Instale o Node.js e rode "npm init -y" na pasta do projeto.\n' +
    '2. Instale o Capacitor: npm install @capacitor/core @capacitor/cli\n' +
    '3. Rode "npx cap init" e aponte o webDir para a pasta com estes arquivos.\n' +
    '4. Adicione as plataformas: npx cap add android / npx cap add ios\n' +
    '5. Instale o plugin @capacitor/local-notifications para lembretes nativos.\n' +
    '6. Rode "npx cap open android" ou "npx cap open ios" para gerar o app.\n\n' +
    'O guia completo está no final das instruções de entrega.'
  );
}

/* ================================================================
   6. RENDERIZAÇÃO — TELA HOJE
   ================================================================ */

function saudacaoPorHorario() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function atualizarCabecalho() {
  const nome = state.settings.userName ? `, ${state.settings.userName}` : '';
  document.getElementById('greeting-text').textContent = `${saudacaoPorHorario()}${nome}`;
  document.getElementById('header-date').textContent = dataExtensa(hojeStr());
}

function renderizarHoje() {
  atualizarCabecalho();
  const hoje = hojeStr();
  const busca = (document.getElementById('today-search').value || '').toLowerCase();
  let itens = ocorrenciasDoDia(hoje);
  registrarHistoricoDoDia(hoje);

  if (busca) itens = itens.filter((i) => i.title.toLowerCase().includes(busca));

  // Próximo compromisso com horário
  const agora = horaAtualStr();
  const proximo = itens
    .filter((i) => i.time && !i.completed && i.time >= agora)
    .sort((a, b) => a.time.localeCompare(b.time))[0];
  const naEl = document.getElementById('next-appointment');
  if (proximo) {
    naEl.classList.remove('hidden');
    naEl.innerHTML = `
      <p class="na-label">🔥 Agora</p>
      <p class="na-title">${escapeHtml(proximo.title)}</p>
      <p class="na-time">${proximo.time}${proximo.endTime ? ' – ' + proximo.endTime : ''}</p>`;
  } else {
    naEl.classList.add('hidden');
  }

  // Barra de progresso
  const total = itens.length;
  const concluidas = itens.filter((i) => i.completed).length;
  const pct = total ? Math.round((concluidas / total) * 100) : 0;
  document.getElementById('today-progress-bar').style.width = pct + '%';
  document.getElementById('today-progress-label').textContent =
    total ? `${concluidas} de ${total} concluídas` : 'Nenhuma atividade para hoje ainda';
  document.getElementById('today-progress-count').textContent = `${concluidas} de ${total}`;

  const frasesHoje = [
    'Disciplina de hoje, conquistas de amanhã.',
    'Um passo de cada vez já é progresso.',
    'Você está fazendo um ótimo trabalho.',
    'Pequenas ações também contam.'
  ];
  document.getElementById('today-quote').textContent = frasesHoje[new Date().getDate() % frasesHoje.length];

  // Prioridades em destaque (até 3, alta prioridade e não concluídas)
  const prioridades = itens.filter((i) => i.priority === 'alta' && !i.completed).slice(0, 3);
  const blocoPrio = document.getElementById('today-priorities');
  const listaPrio = document.getElementById('today-priorities-list');
  if (prioridades.length) {
    blocoPrio.classList.remove('hidden');
    listaPrio.innerHTML = '';
    prioridades.forEach((i) => listaPrio.appendChild(criarCartaoAtividade(i)));
  } else {
    blocoPrio.classList.add('hidden');
  }

  // Listas pendentes / concluídas
  const pendentes = itens.filter((i) => !i.completed);
  const concluidasLista = itens.filter((i) => i.completed);

  const ulPend = document.getElementById('today-pending-list');
  ulPend.innerHTML = '';
  pendentes.forEach((i) => ulPend.appendChild(criarCartaoAtividade(i)));
  document.getElementById('today-empty').classList.toggle('hidden', itens.length > 0);

  const ulDone = document.getElementById('today-done-list');
  const btnToggle = document.getElementById('btn-toggle-done-today');
  if (state.hideDoneToday) {
    ulDone.innerHTML = '';
    ulDone.classList.add('hidden');
    btnToggle.textContent = 'Mostrar concluídas';
  } else {
    ulDone.classList.remove('hidden');
    ulDone.innerHTML = '';
    concluidasLista.forEach((i) => ulDone.appendChild(criarCartaoAtividade(i)));
    btnToggle.textContent = 'Ocultar concluídas';
  }
}

/* ================================================================
   CARTÃO DE ATIVIDADE (reutilizado em várias telas)
   ================================================================ */

const ICONE_TIPO = {
  tarefa: '✓', compromisso: '📌', reuniao: '👥', lembrete: '🔔', rotina: '🔁'
};

function criarCartaoAtividade(item, onClickOverride) {
  const li = document.createElement('li');
  li.className = `activity-card prio-${item.priority}${item.completed ? ' completed' : ''}`;
  li.dataset.id = item.id;

  const check = document.createElement('button');
  check.className = 'ac-check' + (item.completed ? ' checked' : '');
  check.setAttribute('aria-label', item.completed ? 'Desmarcar como concluída' : 'Marcar como concluída');
  check.textContent = item.completed ? '✓' : '';
  check.addEventListener('click', (ev) => {
    ev.stopPropagation();
    marcarConcluido(item, !item.completed);
    renderizarTelaAtual(telaAtivaId());
  });

  const body = document.createElement('div');
  body.className = 'ac-body';

  const titulo = document.createElement('p');
  titulo.className = 'ac-title';
  titulo.textContent = item.title;
  body.appendChild(titulo);

  const meta = document.createElement('div');
  meta.className = 'ac-meta';

  if (item.time) {
    const t = document.createElement('span');
    t.className = 'ac-time';
    t.textContent = item.endTime ? `${item.time} – ${item.endTime}` : item.time;
    meta.appendChild(t);
  }

  const tipo = document.createElement('span');
  tipo.className = 'ac-tag';
  tipo.textContent = `${ICONE_TIPO[item.type] || ''} ${rotuloTipo(item.type)}`;
  meta.appendChild(tipo);

  const cat = buscarCategoria(item.category);
  if (cat) {
    const catEl = document.createElement('span');
    catEl.className = 'ac-tag';
    catEl.style.background = hexParaClaro(cat.color);
    catEl.style.color = cat.color;
    catEl.textContent = cat.name;
    meta.appendChild(catEl);
  }

  body.appendChild(meta);

  if (item.subtasks && item.subtasks.length) {
    const done = item.subtasks.filter((s) => s.done).length;
    const sub = document.createElement('p');
    sub.className = 'ac-subprogress';
    sub.textContent = `${done}/${item.subtasks.length} etapas concluídas`;
    body.appendChild(sub);
  }

  const more = document.createElement('button');
  more.className = 'ac-more';
  more.setAttribute('aria-label', 'Mais opções');
  more.textContent = '⋮';
  more.addEventListener('click', (ev) => {
    ev.stopPropagation();
    abrirMenuAcoesItem(item);
  });

  li.appendChild(check);
  li.appendChild(body);

  // Atividades com horário de início e término definidos ganham um botão
  // "Iniciar" que leva direto para a tela do cronômetro, sem precisar escolher tempo.
  if (!item.completed && item.time && item.endTime) {
    const startBtn = document.createElement('button');
    startBtn.className = 'ac-start-btn';
    startBtn.innerHTML = '▶ Iniciar';
    startBtn.setAttribute('aria-label', 'Iniciar cronômetro desta atividade');
    startBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      abrirModoFoco(item, { iniciarDireto: true });
    });
    li.appendChild(startBtn);
  }

  li.appendChild(more);

  li.addEventListener('click', () => {
    if (onClickOverride) onClickOverride(item);
    else abrirModalAtividade(item);
  });

  return li;
}

function rotuloTipo(tipo) {
  return { tarefa: 'Tarefa', compromisso: 'Compromisso', reuniao: 'Reunião', lembrete: 'Lembrete', rotina: 'Rotina' }[tipo] || 'Tarefa';
}

function hexParaClaro(hex) {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},0.15)`;
  } catch (e) { return '#eee'; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function telaAtivaId() {
  const ativa = document.querySelector('.view.active');
  return ativa ? ativa.id : 'screen-today';
}

/* ================================================================
   TELA AMANHÃ
   ================================================================ */

function renderizarAmanha() {
  const amanha = amanhaStr();
  document.getElementById('tomorrow-date').textContent = dataExtensa(amanha);
  const busca = (document.getElementById('tomorrow-search').value || '').toLowerCase();
  let itens = ocorrenciasDoDia(amanha);
  if (busca) itens = itens.filter((i) => i.title.toLowerCase().includes(busca));

  const ul = document.getElementById('tomorrow-list');
  ul.innerHTML = '';
  itens.forEach((i) => ul.appendChild(criarCartaoAtividade(i)));
  document.getElementById('tomorrow-empty').classList.toggle('hidden', itens.length > 0);
}

/* ================================================================
   TELA PENDENTES
   ================================================================ */

function listarPendentes() {
  const hoje = hojeStr();
  return state.activities
    .filter((a) => a.date < hoje && !a.completed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(normalizarAtividade);
}

function renderizarPendentes() {
  let itens = listarPendentes();
  const filtro = state.pendingFilter || 'todos';
  const hoje = hojeStr();
  if (filtro === 'atrasadas') itens = itens.filter((i) => i.date < somarDias(hoje, -1) || i.date < hoje);
  if (filtro === 'sem-data') itens = []; // todas as pendências aqui têm data; categoria reservada para uso futuro

  document.querySelectorAll('#pending-filter-pills .filter-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === filtro);
  });

  const banner = document.getElementById('pending-overdue-banner');
  banner.classList.toggle('hidden', listarPendentes().length === 0);

  const ul = document.getElementById('pending-list');
  ul.innerHTML = '';
  itens.forEach((i) => {
    ul.appendChild(criarCartaoAtividade(i, abrirResolucaoPendencia));
  });
  document.getElementById('pending-empty').classList.toggle('hidden', itens.length > 0);
}

function configurarFiltrosPendentes() {
  document.querySelectorAll('#pending-filter-pills .filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.pendingFilter = btn.dataset.filter;
      renderizarPendentes();
    });
  });
}

/* ================================================================
   TELA CALENDÁRIO
   ================================================================ */

function renderizarCalendario() {
  const filtroCategoria = document.getElementById('filter-category').value;
  const filtroPrioridade = document.getElementById('filter-priority').value;
  const filtroStatus = document.getElementById('filter-status').value;

  document.querySelectorAll('#calendar-mode .segmented-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === state.calendarMode);
  });

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  DIAS_SEMANA_ABREV.forEach((d) => {
    const el = document.createElement('div');
    el.className = 'cal-weekday';
    el.textContent = d;
    grid.appendChild(el);
  });

  const base = state.calendarViewDate;
  let diasParaMostrar = [];

  if (state.calendarMode === 'month') {
    const ano = base.getFullYear(), mes = base.getMonth();
    document.getElementById('cal-label').textContent = `${MESES[mes]} de ${ano}`;
    const primeiroDia = new Date(ano, mes, 1);
    const inicioGrid = new Date(primeiroDia);
    inicioGrid.setDate(inicioGrid.getDate() - primeiroDia.getDay());
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicioGrid);
      d.setDate(inicioGrid.getDate() + i);
      diasParaMostrar.push({ date: d, outroMes: d.getMonth() !== mes });
    }
  } else {
    const inicioSemana = new Date(base);
    inicioSemana.setDate(base.getDate() - base.getDay());
    document.getElementById('cal-label').textContent =
      `${inicioSemana.getDate()}/${inicioSemana.getMonth()+1} – ${dataCurta(formatarDataISO(new Date(inicioSemana.getTime()+6*86400000)))}`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicioSemana);
      d.setDate(inicioSemana.getDate() + i);
      diasParaMostrar.push({ date: d, outroMes: false });
    }
  }

  const hoje = hojeStr();
  diasParaMostrar.forEach(({ date, outroMes }) => {
    const dataStr = formatarDataISO(date);
    let itens = ocorrenciasDoDia(dataStr);
    if (filtroCategoria) itens = itens.filter((i) => i.category === filtroCategoria);
    if (filtroPrioridade) itens = itens.filter((i) => i.priority === filtroPrioridade);
    if (filtroStatus === 'pendente') itens = itens.filter((i) => !i.completed);
    if (filtroStatus === 'concluida') itens = itens.filter((i) => i.completed);

    const btn = document.createElement('button');
    btn.className = 'cal-day';
    if (outroMes) btn.classList.add('other-month');
    if (dataStr === hoje) btn.classList.add('today');
    if (dataStr === state.selectedCalendarDay) btn.classList.add('selected');
    btn.setAttribute('aria-label', dataExtensa(dataStr));
    btn.innerHTML = `<span>${date.getDate()}</span>`;
    if (itens.length) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      btn.appendChild(dot);
    }
    btn.addEventListener('click', () => {
      state.selectedCalendarDay = dataStr;
      renderizarCalendario();
    });
    grid.appendChild(btn);
  });

  // Lista do dia selecionado
  const tituloDia = document.getElementById('calendar-day-title');
  tituloDia.textContent = state.selectedCalendarDay === hoje
    ? 'Hoje'
    : dataExtensa(state.selectedCalendarDay);

  let itensDia = ocorrenciasDoDia(state.selectedCalendarDay);
  if (filtroCategoria) itensDia = itensDia.filter((i) => i.category === filtroCategoria);
  if (filtroPrioridade) itensDia = itensDia.filter((i) => i.priority === filtroPrioridade);
  if (filtroStatus === 'pendente') itensDia = itensDia.filter((i) => !i.completed);
  if (filtroStatus === 'concluida') itensDia = itensDia.filter((i) => i.completed);

  const ulDia = document.getElementById('calendar-day-list');
  ulDia.innerHTML = '';
  itensDia.forEach((i) => ulDia.appendChild(criarCartaoAtividade(i)));
}

function preencherFiltroCategoriasCalendario() {
  const select = document.getElementById('filter-category');
  const valorAtual = select.value;
  select.innerHTML = '<option value="">Categoria: todas</option>';
  state.categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    select.appendChild(opt);
  });
  select.value = valorAtual;
}

function configurarCalendario() {
  document.querySelectorAll('#calendar-mode .segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.calendarMode = btn.dataset.mode;
      renderizarCalendario();
    });
  });
  document.getElementById('cal-prev').addEventListener('click', () => {
    const d = state.calendarViewDate;
    if (state.calendarMode === 'month') d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    renderizarCalendario();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    const d = state.calendarViewDate;
    if (state.calendarMode === 'month') d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    renderizarCalendario();
  });
  ['filter-category', 'filter-priority', 'filter-status'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderizarCalendario);
  });
}

/* ================================================================
   TELA ROTINAS
   ================================================================ */

function descricaoRecorrencia(r) {
  switch (r.recurrence) {
    case 'daily': return 'Todos os dias';
    case 'weekdays': return 'Dias úteis';
    case 'weekly': return 'Semanalmente';
    case 'monthly': return 'Mensalmente';
    case 'custom-days': return (r.days || []).map((d) => DIAS_SEMANA_ABREV[d]).join(', ') || 'Dias específicos';
    case 'interval': return `A cada ${r.interval} dias`;
    default: return '';
  }
}

const ICONE_ROTINA_PADRAO = '🔁';
function iconeParaRotina(r) {
  const t = r.title.toLowerCase();
  if (t.includes('exerc') || t.includes('treino') || t.includes('academia')) return '🏋️';
  if (t.includes('ler') || t.includes('livro')) return '📖';
  if (t.includes('estud') || t.includes('trabalh')) return '💻';
  if (t.includes('medit')) return '🧘';
  if (t.includes('água') || t.includes('agua')) return '💧';
  if (t.includes('meta') || t.includes('revisar')) return '🎯';
  return ICONE_ROTINA_PADRAO;
}

function renderizarRotinas() {
  const ul = document.getElementById('routines-list');
  ul.innerHTML = '';
  state.routines.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'routine-row';
    if (r.paused) li.style.opacity = '0.55';

    const icone = document.createElement('div');
    icone.className = 'routine-icon';
    icone.textContent = iconeParaRotina(r);

    const body = document.createElement('div');
    body.className = 'routine-body';
    body.innerHTML = `
      <p class="routine-title">${escapeHtml(r.title)}</p>
      <p class="routine-meta">${descricaoRecorrencia(r)}${r.time ? ' · ' + r.time : ''}</p>`;
    body.addEventListener('click', () => abrirModalAtividade(normalizarOcorrenciaRotina(r, hojeStr()), r));

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'switch';
    toggleLabel.innerHTML = `<input type="checkbox" ${!r.paused ? 'checked' : ''} aria-label="Ativar ou pausar rotina"><span class="slider"></span>`;
    toggleLabel.querySelector('input').addEventListener('change', (ev) => {
      r.paused = !ev.target.checked;
      salvarRotinas();
      renderizarRotinas();
    });

    const more = document.createElement('button');
    more.className = 'ac-more';
    more.textContent = '⋮';
    more.setAttribute('aria-label', 'Mais opções da rotina');
    more.addEventListener('click', (ev) => { ev.stopPropagation(); abrirMenuAcoesRotina(r); });

    li.appendChild(icone);
    li.appendChild(body);
    li.appendChild(toggleLabel);
    li.appendChild(more);
    ul.appendChild(li);
  });
  document.getElementById('routines-empty').classList.toggle('hidden', state.routines.length > 0);
}

function abrirMenuAcoesRotina(r) {
  const acoes = [
    { label: r.paused ? 'Retomar rotina' : 'Pausar temporariamente', fn: () => { r.paused = !r.paused; salvarRotinas(); renderizarRotinas(); } },
    { label: 'Editar', fn: () => abrirModalAtividade(normalizarOcorrenciaRotina(r, hojeStr()), r) },
    { label: 'Duplicar', fn: () => {
        const copia = Object.assign({}, r, { id: gerarId('rot'), title: r.title + ' (cópia)', skipDates: [] });
        state.routines.push(copia); salvarRotinas(); renderizarRotinas();
      } },
    { label: 'Definir data de término', fn: () => abrirDatePicker((data) => { r.endDate = data; salvarRotinas(); renderizarRotinas(); }) },
    { label: 'Excluir rotina', danger: true, fn: () => abrirConfirmacao('Excluir esta rotina e todo o seu histórico de ocorrências futuras?', () => {
        state.routines = state.routines.filter((x) => x.id !== r.id); salvarRotinas(); renderizarRotinas();
      }) }
  ];
  abrirMenuGenerico(r.title, acoes);
}

/* ================================================================
   10. CATEGORIAS
   ================================================================ */

function renderizarCategorias() {
  const ul = document.getElementById('categories-list');
  ul.innerHTML = '';
  state.categories.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'category-row';
    li.innerHTML = `<span class="category-dot" style="background:${c.color}"></span><span>${escapeHtml(c.name)}</span>`;
    const editBtn = document.createElement('button');
    editBtn.className = 'ac-more'; editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', 'Editar categoria');
    editBtn.addEventListener('click', () => abrirModalCategoria(c));
    const delBtn = document.createElement('button');
    delBtn.className = 'ac-more'; delBtn.textContent = '🗑️';
    delBtn.setAttribute('aria-label', 'Excluir categoria');
    delBtn.addEventListener('click', () => abrirConfirmacao(`Excluir a categoria "${c.name}"? As atividades ficarão sem categoria.`, () => {
      state.categories = state.categories.filter((x) => x.id !== c.id);
      state.activities.forEach((a) => { if (a.category === c.id) a.category = ''; });
      state.routines.forEach((r) => { if (r.category === c.id) r.category = ''; });
      salvarCategorias(); salvarAtividades(); salvarRotinas();
      renderizarCategorias();
    }));
    li.appendChild(editBtn);
    li.appendChild(delBtn);
    ul.appendChild(li);
  });
}

function abrirModalCategoria(categoria) {
  document.getElementById('category-modal-title').textContent = categoria ? 'Editar categoria' : 'Nova categoria';
  document.getElementById('cat-id').value = categoria ? categoria.id : '';
  document.getElementById('cat-name').value = categoria ? categoria.name : '';
  document.getElementById('cat-color').value = categoria ? categoria.color : '#2F5D58';
  abrirModal('modal-category');
}

function configurarFormCategoria() {
  document.getElementById('form-category').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = document.getElementById('cat-id').value;
    const nome = document.getElementById('cat-name').value.trim();
    const cor = document.getElementById('cat-color').value;
    if (!nome) return;
    if (id) {
      const c = state.categories.find((x) => x.id === id);
      if (c) { c.name = nome; c.color = cor; }
    } else {
      state.categories.push({ id: gerarId('cat'), name: nome, color: cor });
    }
    salvarCategorias();
    fecharModal('modal-category');
    renderizarCategorias();
    preencherSelectCategorias();
    preencherFiltroCategoriasCalendario();
  });
  document.getElementById('btn-new-category').addEventListener('click', () => abrirModalCategoria(null));
  document.getElementById('btn-close-category').addEventListener('click', () => fecharModal('modal-category'));
}

function preencherSelectCategorias() {
  const select = document.getElementById('act-category');
  const atual = select.value;
  select.innerHTML = '<option value="">Sem categoria</option>';
  state.categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    select.appendChild(opt);
  });
  select.value = atual;
}

/* ================================================================
   11. PROGRESSO / ESTATÍSTICAS
   ================================================================ */

function renderizarProgresso() {
  const hoje = hojeStr();
  const itensHoje = ocorrenciasDoDia(hoje);
  const done = itensHoje.filter((i) => i.completed).length;
  const pendentes = itensHoje.length - done;
  const pct = itensHoje.length ? Math.round((done / itensHoje.length) * 100) : 0;

  document.getElementById('stat-done-today').textContent = done;
  document.getElementById('stat-pending-today').textContent = pendentes;
  document.getElementById('stat-percent-today').textContent = pct + '%';
  document.getElementById('stat-streak').textContent = calcularSequenciaDias();

  // Anel de progresso (donut)
  const circ = 2 * Math.PI * 42; // raio 42
  const circulo = document.getElementById('donut-circle');
  circulo.setAttribute('stroke-dasharray', String(circ));
  circulo.setAttribute('stroke-dashoffset', String(circ - (pct / 100) * circ));
  document.getElementById('donut-percent').textContent = pct + '%';
  document.getElementById('donut-caption-text').textContent = `${done} de ${itensHoje.length}`;

  // Gráfico dos últimos 7 dias
  const chart = document.getElementById('week-chart');
  chart.innerHTML = '';
  const dias = [];
  for (let i = 6; i >= 0; i--) dias.push(somarDias(hoje, -i));
  const maxDone = Math.max(1, ...dias.map((d) => (state.history[d] ? state.history[d].done : 0)));
  dias.forEach((d) => {
    const registro = state.history[d] || { done: 0, total: 0 };
    const alturaPct = Math.round((registro.done / maxDone) * 100);
    const percConcluido = registro.total ? Math.round((registro.done / registro.total) * 100) : 0;
    const wrap = document.createElement('div');
    wrap.className = 'week-bar-wrap';
    const pctLabel = document.createElement('span');
    pctLabel.className = 'week-bar-pct';
    pctLabel.textContent = registro.total ? percConcluido + '%' : '';
    const bar = document.createElement('div');
    bar.className = 'week-bar';
    bar.style.height = Math.max(4, alturaPct) + '%';
    bar.title = `${registro.done} concluída(s)`;
    const label = document.createElement('span');
    label.className = 'week-bar-label';
    const dow = new Date(d + 'T00:00:00').getDay();
    label.textContent = DIAS_SEMANA_ABREV[dow];
    wrap.appendChild(pctLabel);
    wrap.appendChild(bar);
    wrap.appendChild(label);
    chart.appendChild(wrap);
  });

  // Ranking de categorias (últimos 30 dias, atividades + ocorrências de rotina concluídas)
  const contagem = {};
  const inicio30 = somarDias(hoje, -30);
  state.activities.filter((a) => a.completed && a.date >= inicio30).forEach((a) => {
    contagem[a.category || 'sem'] = (contagem[a.category || 'sem'] || 0) + 1;
  });
  Object.keys(state.completions).forEach((chave) => {
    const [routineId, data] = chave.split('|');
    if (data >= inicio30 && state.completions[chave].done) {
      const r = state.routines.find((x) => x.id === routineId);
      if (r) contagem[r.category || 'sem'] = (contagem[r.category || 'sem'] || 0) + 1;
    }
  });
  const ranking = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCount = Math.max(1, ...ranking.map((r) => r[1]));
  const rankingEl = document.getElementById('category-ranking');
  rankingEl.innerHTML = '';
  if (!ranking.length) {
    rankingEl.innerHTML = '<p class="empty-state">Ainda não há atividades concluídas suficientes.</p>';
  }
  ranking.forEach(([catId, count]) => {
    const cat = buscarCategoria(catId);
    const nome = cat ? cat.name : 'Sem categoria';
    const cor = cat ? cat.color : '#999';
    const row = document.createElement('div');
    row.className = 'category-rank-row';
    row.innerHTML = `
      <span style="min-width:110px">${escapeHtml(nome)}</span>
      <span class="category-rank-bar-track"><span class="category-rank-bar" style="width:${(count/maxCount)*100}%;background:${cor}"></span></span>
      <span>${count}</span>`;
    rankingEl.appendChild(row);
  });

  const mensagens = [
    'Você avançou bastante hoje.',
    'Pequenas ações também contam.',
    'O que não deu para fazer hoje pode ser reorganizado, sem problema.',
    'Que tal escolher somente três prioridades para amanhã?',
    'Cada dia é uma nova chance — sem cobrança.'
  ];
  document.getElementById('encouragement-msg').textContent = mensagens[new Date().getDate() % mensagens.length];
}

function calcularSequenciaDias() {
  let seq = 0;
  let d = hojeStr();
  while (state.history[d] && state.history[d].total > 0 && state.history[d].done > 0) {
    seq++;
    d = somarDias(d, -1);
  }
  return seq;
}

/* ================================================================
   7. MODAL DE CADASTRO / EDIÇÃO DE ATIVIDADE
   ================================================================ */

let subtarefasEmEdicao = [];

function abrirModalAtividade(itemParaEditar, rotinaOriginal, dataPredefinida) {
  const form = document.getElementById('form-activity');
  form.reset();
  document.getElementById('act-title-error').classList.add('hidden');
  preencherSelectCategorias();
  subtarefasEmEdicao = [];

  const ehEdicao = !!itemParaEditar && !!objetoOriginalOuRotina(itemParaEditar, rotinaOriginal);
  state.editingActivityId = null;
  state.editingIsRoutine = false;

  document.getElementById('activity-modal-title').textContent = ehEdicao ? 'Editar atividade' : 'Nova atividade';

  if (rotinaOriginal) {
    // Editando uma rotina inteira
    state.editingActivityId = rotinaOriginal.id;
    state.editingIsRoutine = true;
    document.getElementById('act-title').value = rotinaOriginal.title;
    document.getElementById('act-description').value = rotinaOriginal.description || '';
    document.getElementById('act-type').value = 'rotina';
    document.getElementById('act-priority').value = rotinaOriginal.priority || 'media';
    document.getElementById('act-date').value = rotinaOriginal.startDate;
    document.getElementById('act-category').value = rotinaOriginal.category || '';
    document.getElementById('act-time').value = rotinaOriginal.time || '';
    document.getElementById('act-end-time').value = rotinaOriginal.endTime || '';
    document.getElementById('act-has-time').checked = !!rotinaOriginal.time;
    document.getElementById('act-notes').value = rotinaOriginal.notes || '';
    document.getElementById('act-focus-mode').checked = !!rotinaOriginal.focusModeAllowed;
    document.getElementById('act-recurrence').value = rotinaOriginal.recurrence || 'daily';
    document.getElementById('recurrence-interval').value = rotinaOriginal.interval || '';
    document.getElementById('recurrence-end').value = rotinaOriginal.endDate || '';
    marcarDiasSemanaSelecionados(rotinaOriginal.days || []);
    subtarefasEmEdicao = (rotinaOriginal.subtasks || []).map((s) => ({ id: s.id, text: s.text }));
    configurarReminderUI(rotinaOriginal.reminderMinutes, rotinaOriginal.reminderCustom);
  } else if (itemParaEditar && !itemParaEditar.isRoutine) {
    const original = state.activities.find((a) => a.id === itemParaEditar.id);
    if (original) {
      state.editingActivityId = original.id;
      document.getElementById('act-title').value = original.title;
      document.getElementById('act-description').value = original.description || '';
      document.getElementById('act-type').value = original.type || 'tarefa';
      document.getElementById('act-priority').value = original.priority || 'media';
      document.getElementById('act-date').value = original.date;
      document.getElementById('act-category').value = original.category || '';
      document.getElementById('act-time').value = original.time || '';
      document.getElementById('act-end-time').value = original.endTime || '';
      document.getElementById('act-has-time').checked = !!original.time;
      document.getElementById('act-notes').value = original.notes || '';
      document.getElementById('act-focus-mode').checked = !!original.focusModeAllowed;
      subtarefasEmEdicao = (original.subtasks || []).map((s) => ({ id: s.id, text: s.text }));
      configurarReminderUI(original.reminderMinutes, original.reminderCustom);
    }
  } else {
    // Nova atividade
    document.getElementById('act-date').value = dataPredefinida || hojeStr();
    document.getElementById('act-has-time').checked = false;
    configurarReminderUI(null, '');
  }

  renderizarSubtarefasEdicao();
  atualizarVisibilidadeCamposConforme();
  abrirModal('modal-activity');
  document.getElementById('act-title').focus();
}

function objetoOriginalOuRotina(item, rotina) {
  if (rotina) return rotina;
  if (item && !item.isRoutine) return state.activities.find((a) => a.id === item.id);
  return null;
}

function marcarDiasSemanaSelecionados(dias) {
  document.querySelectorAll('#recurrence-days .chip').forEach((chip) => {
    chip.classList.toggle('selected', dias.includes(Number(chip.dataset.day)));
  });
}

function configurarReminderUI(minutos, custom) {
  const select = document.getElementById('act-reminder');
  const customInput = document.getElementById('act-reminder-custom');
  if (custom) {
    select.value = 'custom';
    customInput.value = custom;
    customInput.classList.remove('hidden');
  } else if (minutos !== null && minutos !== undefined) {
    select.value = String(minutos);
    customInput.classList.add('hidden');
  } else {
    select.value = '';
    customInput.classList.add('hidden');
  }
}

function atualizarVisibilidadeCamposConforme() {
  const temHorario = document.getElementById('act-has-time').checked;
  document.getElementById('act-time-row').classList.toggle('hidden', !temHorario);
  document.getElementById('act-reminder-block').classList.toggle('hidden', !temHorario);
  if (!temHorario) {
    document.getElementById('act-time').value = '';
    document.getElementById('act-end-time').value = '';
  }

  const recorrencia = document.getElementById('act-recurrence').value;
  document.getElementById('recurrence-days').classList.toggle('hidden', recorrencia !== 'custom-days');
  document.getElementById('recurrence-interval').classList.toggle('hidden', recorrencia !== 'interval');
  document.getElementById('recurrence-end-block').classList.toggle('hidden', !recorrencia);
}

function renderizarSubtarefasEdicao() {
  const ul = document.getElementById('act-subtasks-list');
  ul.innerHTML = '';
  subtarefasEmEdicao.forEach((s, idx) => {
    const li = document.createElement('li');
    li.className = 'subtask-edit-row';
    const input = document.createElement('input');
    input.type = 'text'; input.value = s.text; input.maxLength = 80;
    input.setAttribute('aria-label', `Etapa ${idx + 1}`);
    input.addEventListener('input', () => { s.text = input.value; });
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '✕';
    del.setAttribute('aria-label', 'Remover etapa');
    del.addEventListener('click', () => { subtarefasEmEdicao.splice(idx, 1); renderizarSubtarefasEdicao(); });
    li.appendChild(input);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function configurarFormAtividade() {
  document.getElementById('act-has-time').addEventListener('change', atualizarVisibilidadeCamposConforme);
  document.getElementById('act-recurrence').addEventListener('change', atualizarVisibilidadeCamposConforme);

  document.querySelectorAll('#recurrence-days .chip').forEach((chip) => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  document.getElementById('act-reminder').addEventListener('change', (ev) => {
    document.getElementById('act-reminder-custom').classList.toggle('hidden', ev.target.value !== 'custom');
  });

  document.getElementById('btn-add-subtask').addEventListener('click', () => {
    subtarefasEmEdicao.push({ id: gerarId('sub'), text: '' });
    renderizarSubtarefasEdicao();
    const inputs = document.querySelectorAll('#act-subtasks-list input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  document.getElementById('btn-close-activity').addEventListener('click', () => fecharModal('modal-activity'));

  document.getElementById('form-activity').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const titulo = document.getElementById('act-title').value.trim();
    if (!titulo) {
      document.getElementById('act-title-error').classList.remove('hidden');
      document.getElementById('act-title').focus();
      return;
    }
    document.getElementById('act-title-error').classList.add('hidden');
    salvarAtividadeDoFormulario(titulo);
  });
}

function lerReminderDoFormulario() {
  const val = document.getElementById('act-reminder').value;
  if (val === '') return { reminderMinutes: null, reminderCustom: '' };
  if (val === 'custom') return { reminderMinutes: null, reminderCustom: document.getElementById('act-reminder-custom').value };
  return { reminderMinutes: Number(val), reminderCustom: '' };
}

function salvarAtividadeDoFormulario(titulo) {
  const descricao = document.getElementById('act-description').value.trim();
  const tipo = document.getElementById('act-type').value;
  const prioridade = document.getElementById('act-priority').value;
  const data = document.getElementById('act-date').value || hojeStr();
  const categoria = document.getElementById('act-category').value;
  const horario = document.getElementById('act-time').value;
  const horarioFim = document.getElementById('act-end-time').value;
  const notas = document.getElementById('act-notes').value.trim();
  const focoPermitido = document.getElementById('act-focus-mode').checked;
  const recorrencia = document.getElementById('act-recurrence').value;
  const { reminderMinutes, reminderCustom } = lerReminderDoFormulario();
  const subtasksFinal = subtarefasEmEdicao.filter((s) => s.text.trim()).map((s) => ({ id: s.id, text: s.text.trim(), done: false }));

  if (recorrencia) {
    // Salva como ROTINA
    const diasSelecionados = Array.from(document.querySelectorAll('#recurrence-days .chip.selected')).map((c) => Number(c.dataset.day));
    const intervalo = Number(document.getElementById('recurrence-interval').value) || 2;
    const dataFim = document.getElementById('recurrence-end').value || '';

    if (state.editingIsRoutine && state.editingActivityId) {
      const r = state.routines.find((x) => x.id === state.editingActivityId);
      if (r) {
        Object.assign(r, {
          title: titulo, description: descricao, priority: prioridade, category: categoria,
          time: horario, endTime: horarioFim, notes: notas, focusModeAllowed: focoPermitido,
          reminderMinutes, reminderCustom, recurrence: recorrencia, days: diasSelecionados,
          interval: intervalo, startDate: data, endDate: dataFim,
          subtasks: mesclarSubtarefas(r.subtasks, subtasksFinal)
        });
      }
    } else {
      state.routines.push({
        id: gerarId('rot'), title: titulo, description: descricao, priority: prioridade,
        category: categoria, time: horario, endTime: horarioFim, notes: notas,
        focusModeAllowed: focoPermitido, type: 'rotina',
        reminderMinutes, reminderCustom, recurrence: recorrencia, days: diasSelecionados,
        interval: intervalo, startDate: data, endDate: dataFim, active: true, paused: false,
        skipDates: [], subtasks: subtasksFinal, createdAt: Date.now()
      });
    }
    salvarRotinas();
  } else if (state.editingActivityId && !state.editingIsRoutine) {
    const a = state.activities.find((x) => x.id === state.editingActivityId);
    if (a) {
      Object.assign(a, {
        title: titulo, description: descricao, type: tipo, priority: prioridade, date: data,
        category: categoria, time: horario, endTime: horarioFim, notes: notas,
        focusModeAllowed: focoPermitido, reminderMinutes, reminderCustom,
        subtasks: mesclarSubtarefas(a.subtasks, subtasksFinal)
      });
      salvarAtividades();
    }
  } else {
    state.activities.push({
      id: gerarId('act'), title: titulo, description: descricao, date: data, time: horario,
      endTime: horarioFim, category: categoria, priority: prioridade, type: tipo,
      reminderMinutes, reminderCustom, subtasks: subtasksFinal, notes: notas,
      focusModeAllowed: focoPermitido, completed: false, order: maiorOrdemDoDia(data) + 1,
      createdAt: Date.now()
    });
    salvarAtividades();
  }

  fecharModal('modal-activity');
  renderizarTelaAtual(telaAtivaId());
  anunciarParaLeitorDeTela('Atividade salva.');
}

// Mantém o estado "done" das subtarefas já existentes ao editar
function mesclarSubtarefas(antigas, novas) {
  const mapaAntigo = {};
  (antigas || []).forEach((s) => { mapaAntigo[s.id] = s.done; });
  return novas.map((s) => ({ id: s.id, text: s.text, done: !!mapaAntigo[s.id] }));
}

/* ================================================================
   8. MENU DE AÇÕES DO ITEM
   ================================================================ */

function abrirMenuAcoesItem(item) {
  const acoes = [];

  acoes.push({
    label: item.completed ? 'Desmarcar conclusão' : 'Marcar como concluída',
    fn: () => { marcarConcluido(item, !item.completed); renderizarTelaAtual(telaAtivaId()); }
  });
  acoes.push({ label: 'Editar', fn: () => abrirModalAtividade(item, item.isRoutine ? objetoOriginal(item) : null) });
  acoes.push({ label: 'Duplicar', fn: () => { duplicarItem(item); renderizarTelaAtual(telaAtivaId()); } });

  if (item.date !== hojeStr()) {
    acoes.push({ label: 'Mover para hoje', fn: () => { moverParaData(item, hojeStr()); renderizarTelaAtual(telaAtivaId()); } });
  }
  if (item.date !== amanhaStr()) {
    acoes.push({ label: 'Mover para amanhã', fn: () => { moverParaData(item, amanhaStr()); renderizarTelaAtual(telaAtivaId()); } });
  }
  acoes.push({ label: 'Escolher outra data', fn: () => abrirDatePicker((data) => { moverParaData(item, data); renderizarTelaAtual(telaAtivaId()); }) });

  if (item.time) {
    acoes.push({ label: 'Adiar lembrete 10 minutos', fn: () => adiarLembrete(item, 10) });
  }
  if (item.focusModeAllowed) {
    acoes.push({ label: 'Ativar Modo Foco', fn: () => abrirModoFoco(item) });
  }
  if (!item.isRoutine) {
    acoes.push({ label: 'Transformar em rotina', fn: () => abrirEscolhaRecorrenciaRapida(item) });
  }

  acoes.push({
    label: item.isRoutine ? 'Excluir esta ocorrência' : 'Excluir', danger: true,
    fn: () => abrirConfirmacao('Tem certeza que deseja excluir esta atividade?', () => {
      excluirItem(item); renderizarTelaAtual(telaAtivaId());
    })
  });

  abrirMenuGenerico(item.title, acoes);
}

function abrirEscolhaRecorrenciaRapida(item) {
  const acoes = [
    { label: 'Todos os dias', fn: () => { transformarEmRotina(item, 'daily'); renderizarTelaAtual(telaAtivaId()); } },
    { label: 'Dias úteis', fn: () => { transformarEmRotina(item, 'weekdays'); renderizarTelaAtual(telaAtivaId()); } },
    { label: 'Semanalmente', fn: () => { transformarEmRotina(item, 'weekly'); renderizarTelaAtual(telaAtivaId()); } }
  ];
  abrirMenuGenerico('Repetir esta atividade:', acoes);
}

function adiarLembrete(item, minutos) {
  const [h, m] = item.time.split(':').map(Number);
  const d = new Date(); d.setHours(h, m + minutos, 0, 0);
  const novoHorario = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  if (item.isRoutine) {
    const r = state.routines.find((x) => x.id === item.routineId);
    if (r) r.time = novoHorario;
    salvarRotinas();
  } else {
    const a = state.activities.find((x) => x.id === item.id);
    if (a) a.time = novoHorario;
    salvarAtividades();
  }
  removerDoDisparado(item.id + '|' + item.date);
  renderizarTelaAtual(telaAtivaId());
}

/* ================================================================
   MENU GENÉRICO / CONFIRMAÇÃO / SELETOR DE DATA (utilitários de modal)
   ================================================================ */

function abrirMenuGenerico(titulo, acoes) {
  document.getElementById('item-actions-title').textContent = titulo;
  const body = document.getElementById('item-actions-body');
  body.innerHTML = '';
  acoes.forEach((a) => {
    const btn = document.createElement('button');
    if (a.danger) btn.classList.add('danger');
    btn.textContent = a.label;
    btn.addEventListener('click', () => { fecharModal('modal-item-actions'); a.fn(); });
    body.appendChild(btn);
  });
  abrirModal('modal-item-actions');
}

function abrirConfirmacao(texto, onConfirm) {
  document.getElementById('confirm-text').textContent = texto;
  state.confirmCallback = onConfirm;
  abrirModal('modal-confirm');
}

let datePickerCallback = null;
function abrirDatePicker(onConfirm) {
  document.getElementById('date-picker-input').value = hojeStr();
  datePickerCallback = onConfirm;
  abrirModal('modal-date-picker');
}

function configurarModaisUtilitarios() {
  document.getElementById('btn-close-item-actions').addEventListener('click', () => fecharModal('modal-item-actions'));
  document.getElementById('btn-close-date-picker').addEventListener('click', () => fecharModal('modal-date-picker'));
  document.getElementById('btn-confirm-date').addEventListener('click', () => {
    const data = document.getElementById('date-picker-input').value;
    if (data && datePickerCallback) datePickerCallback(data);
    fecharModal('modal-date-picker');
  });
  document.getElementById('btn-confirm-cancel').addEventListener('click', () => fecharModal('modal-confirm'));
  document.getElementById('btn-confirm-ok').addEventListener('click', () => {
    const cb = state.confirmCallback;
    fecharModal('modal-confirm');
    if (cb) cb();
  });
  document.getElementById('btn-close-pending-resolve').addEventListener('click', () => fecharModal('modal-pending-resolve'));

  // Fecha modal ao clicar fora do conteúdo
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) overlay.classList.add('hidden');
    });
  });
}

function abrirModal(id) { document.getElementById(id).classList.remove('hidden'); }
function fecharModal(id) { document.getElementById(id).classList.add('hidden'); }

function anunciarParaLeitorDeTela(msg) {
  const el = document.getElementById('aria-live');
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 50);
}

/* ================================================================
   9. RESOLUÇÃO DE PENDÊNCIAS
   ================================================================ */

function abrirResolucaoPendencia(item) {
  document.getElementById('pending-resolve-text').textContent =
    `Você não concluiu "${item.title}" (${dataCurta(item.date)}). O que deseja fazer?`;

  const acoes = [
    { label: 'Manter pendente', fn: () => fecharModal('modal-pending-resolve') },
    { label: 'Transferir para hoje', fn: () => { moverParaData(item, hojeStr()); renderizarPendentes(); } },
    { label: 'Transferir para amanhã', fn: () => { moverParaData(item, amanhaStr()); renderizarPendentes(); } },
    { label: 'Escolher outra data', fn: () => abrirDatePicker((data) => { moverParaData(item, data); renderizarPendentes(); }) },
    { label: 'Marcar como concluída', fn: () => { marcarConcluido(item, true); renderizarPendentes(); } },
    { label: 'Excluir', danger: true, fn: () => abrirConfirmacao('Excluir esta atividade pendente?', () => { excluirItem(item); renderizarPendentes(); }) }
  ];

  const body = document.getElementById('pending-resolve-actions');
  body.innerHTML = '';
  acoes.forEach((a) => {
    const btn = document.createElement('button');
    if (a.danger) btn.classList.add('danger');
    btn.textContent = a.label;
    btn.addEventListener('click', () => { fecharModal('modal-pending-resolve'); a.fn(); });
    body.appendChild(btn);
  });

  abrirModal('modal-pending-resolve');
}

/* ================================================================
   13. MODO FOCO
   ================================================================ */

// Calcula a duração em minutos entre horário de início e término, se ambos existirem
function duracaoEmMinutos(horaInicio, horaFim) {
  if (!horaInicio || !horaFim) return null;
  const [h1, m1] = horaInicio.split(':').map(Number);
  const [h2, m2] = horaFim.split(':').map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff <= 0) diff += 24 * 60; // atividade que passa da meia-noite
  return diff;
}

function abrirModoFoco(item, opcoes) {
  const iniciarDireto = !!(opcoes && opcoes.iniciarDireto);

  state.focusActivityRef = { id: item.id, isRoutine: item.isRoutine, routineId: item.routineId, date: item.date };
  document.getElementById('focus-title').textContent = item.title;
  document.getElementById('focus-ring-label').textContent = 'Foco em';

  const ul = document.getElementById('focus-subtasks');
  ul.innerHTML = '';
  (item.subtasks || []).forEach((s) => {
    const li = document.createElement('li');
    li.textContent = (s.done ? '✓ ' : '○ ') + s.text;
    ul.appendChild(li);
  });

  document.getElementById('focus-time-choices').classList.remove('hidden');
  document.getElementById('focus-custom-minutes').classList.add('hidden');
  document.getElementById('focus-ring-wrap').classList.add('hidden');
  document.getElementById('focus-start').classList.remove('hidden');
  document.getElementById('focus-pause').classList.add('hidden');
  document.getElementById('focus-stop').classList.add('hidden');
  document.querySelectorAll('#focus-time-choices .chip').forEach((c) => c.classList.remove('selected'));
  pararTimerFoco();

  // Remove o chip de duração de uma abertura anterior, se existir
  const chipAntigo = document.getElementById('focus-chip-duracao');
  if (chipAntigo) chipAntigo.remove();

  // Se a atividade já tem horário de início e término, pré-seleciona esse tempo
  const duracao = duracaoEmMinutos(item.time, item.endTime);
  if (duracao) {
    const chip = document.createElement('button');
    chip.id = 'focus-chip-duracao';
    chip.className = 'chip selected';
    chip.type = 'button';
    chip.dataset.minutes = String(duracao);
    const h = Math.floor(duracao / 60), m = duracao % 60;
    chip.textContent = `Duração da atividade (${h > 0 ? h + 'h ' : ''}${m}min)`;
    chip.addEventListener('click', () => {
      document.querySelectorAll('#focus-time-choices .chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      document.getElementById('focus-custom-minutes').classList.add('hidden');
      state.focusTimer.total = duracao * 60;
    });
    document.getElementById('focus-time-choices').prepend(chip);
    state.focusTimer.total = duracao * 60;
  }

  document.getElementById('focus-mode').classList.remove('hidden');

  // Veio do botão "Iniciar" do card: pula a tela de escolha e já começa a contagem
  if (iniciarDireto && duracao) {
    iniciarContagemFoco();
  }
}

function pararTimerFoco() {
  if (state.focusTimer.intervalId) clearInterval(state.focusTimer.intervalId);
  state.focusTimer = { seconds: 0, total: 0, running: false, intervalId: null };
}

// Inicia a contagem regressiva do Modo Foco com o tempo já definido em state.focusTimer.total
function iniciarContagemFoco() {
  if (!state.focusTimer.total) { alert('Escolha por quanto tempo você quer focar.'); return; }
  state.focusTimer.seconds = state.focusTimer.total;
  state.focusTimer.running = true;
  document.getElementById('focus-ring-wrap').classList.remove('hidden');
  document.getElementById('focus-time-choices').classList.add('hidden');
  document.getElementById('focus-custom-minutes').classList.add('hidden');
  document.getElementById('focus-start').classList.add('hidden');
  document.getElementById('focus-pause').classList.remove('hidden');
  document.getElementById('focus-stop').classList.remove('hidden');
  atualizarDisplayTimerFoco();
  state.focusTimer.intervalId = setInterval(tickTimerFoco, 1000);
}

function configurarModoFoco() {
  document.querySelectorAll('#focus-time-choices .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#focus-time-choices .chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      const custom = document.getElementById('focus-custom-minutes');
      if (chip.dataset.minutes === 'custom') {
        custom.classList.remove('hidden');
        custom.focus();
        state.focusTimer.total = 0;
      } else {
        custom.classList.add('hidden');
        state.focusTimer.total = Number(chip.dataset.minutes) * 60;
      }
    });
  });

  document.getElementById('focus-custom-minutes').addEventListener('input', (ev) => {
    state.focusTimer.total = (Number(ev.target.value) || 0) * 60;
  });

  document.getElementById('focus-start').addEventListener('click', iniciarContagemFoco);

  document.getElementById('focus-pause').addEventListener('click', () => {
    if (state.focusTimer.running) {
      clearInterval(state.focusTimer.intervalId);
      state.focusTimer.running = false;
      document.getElementById('focus-pause').textContent = 'Retomar';
    } else {
      state.focusTimer.running = true;
      state.focusTimer.intervalId = setInterval(tickTimerFoco, 1000);
      document.getElementById('focus-pause').textContent = 'Pausar';
    }
  });

  document.getElementById('focus-stop').addEventListener('click', () => {
    pararTimerFoco();
    document.getElementById('focus-ring-wrap').classList.add('hidden');
    document.getElementById('focus-time-choices').classList.remove('hidden');
    document.getElementById('focus-start').classList.remove('hidden');
    document.getElementById('focus-pause').classList.add('hidden');
    document.getElementById('focus-stop').classList.add('hidden');
  });

  document.getElementById('focus-complete').addEventListener('click', () => {
    const ref = state.focusActivityRef;
    if (ref) {
      const item = ref.isRoutine ? normalizarOcorrenciaRotina(objetoOriginal({ isRoutine: true, routineId: ref.routineId }), ref.date)
                                  : normalizarAtividade(state.activities.find((a) => a.id === ref.id));
      if (item) marcarConcluido(item, true);
    }
    sairDoModoFoco();
    renderizarTelaAtual(telaAtivaId());
  });

  document.getElementById('btn-exit-focus').addEventListener('click', sairDoModoFoco);
}

function sairDoModoFoco() {
  pararTimerFoco();
  document.getElementById('focus-mode').classList.add('hidden');
}

function tickTimerFoco() {
  state.focusTimer.seconds--;
  atualizarDisplayTimerFoco();
  if (state.focusTimer.seconds <= 0) {
    clearInterval(state.focusTimer.intervalId);
    state.focusTimer.running = false;
    if (state.settings.sounds) tocarSomFimDoFoco();
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) { /* sem suporte */ } }
    document.getElementById('focus-ring-label').textContent = 'Tempo esgotado! 🎉';
    anunciarParaLeitorDeTela('Tempo de foco encerrado.');
  }
}

const FOCUS_RING_CIRC = 2 * Math.PI * 98; // raio 98 (ver SVG do Modo Foco)

function atualizarDisplayTimerFoco() {
  const s = Math.max(0, state.focusTimer.seconds);
  const min = String(Math.floor(s / 60)).padStart(2, '0');
  const seg = String(s % 60).padStart(2, '0');
  document.getElementById('focus-timer').textContent = `${min}:${seg}`;

  const total = state.focusTimer.total || 1;
  const fracaoRestante = Math.max(0, Math.min(1, s / total));
  const anel = document.getElementById('focus-ring-progress');
  if (anel) {
    anel.setAttribute('stroke-dasharray', String(FOCUS_RING_CIRC));
    anel.setAttribute('stroke-dashoffset', String(FOCUS_RING_CIRC * (1 - fracaoRestante)));
  }
}

/* ================================================================
   14. LEMBRETES E NOTIFICAÇÕES
   ================================================================ */

function estaDisparado(chave) { return state.fired.includes(chave); }
function marcarDisparado(chave) {
  state.fired.push(chave);
  if (state.fired.length > 500) state.fired = state.fired.slice(-300);
  salvarFired();
}
function removerDoDisparado(chave) {
  state.fired = state.fired.filter((f) => f !== chave);
  salvarFired();
}

function minutosParaHoraAlvo(horario, minutosAntes) {
  const [h, m] = horario.split(':').map(Number);
  const total = h * 60 + m - minutosAntes;
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const mm = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function verificarLembretes() {
  if (!state.settings.notifications) return;
  const agora = new Date();
  const horaAgora = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;
  const hoje = hojeStr();

  const itens = ocorrenciasDoDia(hoje);
  itens.forEach((item) => {
    if (item.completed || !item.time) return;

    let horaAlvo = null;
    if (item.reminderCustom) horaAlvo = item.reminderCustom;
    else if (item.reminderMinutes !== null && item.reminderMinutes !== undefined) {
      horaAlvo = minutosParaHoraAlvo(item.time, item.reminderMinutes);
    }
    if (!horaAlvo) return;

    const chave = item.id + '|' + horaAlvo;
    if (horaAlvo === horaAgora && !estaDisparado(chave)) {
      marcarDisparado(chave);
      dispararLembrete(item);
    }
  });
}

function dispararLembrete(item) {
  mostrarToastLembrete(item);
  if (state.settings.sounds) tocarSom();

  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = { body: item.time + (item.endTime ? ' – ' + item.endTime : ''), icon: 'icons/icon-192.png', tag: item.id };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.active.postMessage({ type: 'SHOW_NOTIFICATION', title: item.title, options: opts });
      });
    } else {
      try { new Notification(item.title, opts); } catch (e) { /* silencioso */ }
    }
  }
}

let toastItemAtual = null;
function mostrarToastLembrete(item) {
  toastItemAtual = item;
  document.getElementById('reminder-toast-title').textContent = `⏰ ${item.title}`;
  document.getElementById('reminder-toast').classList.remove('hidden');
}

function configurarToastLembrete() {
  document.getElementById('reminder-toast').addEventListener('click', (ev) => {
    const acao = ev.target.dataset.action;
    if (!acao || !toastItemAtual) return;
    const item = toastItemAtual;
    if (acao === 'complete') { marcarConcluido(item, true); renderizarTelaAtual(telaAtivaId()); }
    else if (acao === 'open') { abrirModalAtividade(item); }
    else if (acao === 'snooze5') adiarLembrete(item, 5);
    else if (acao === 'snooze10') adiarLembrete(item, 10);
    else if (acao === 'snooze15') adiarLembrete(item, 15);
    else if (acao === 'snooze30') adiarLembrete(item, 30);
    document.getElementById('reminder-toast').classList.add('hidden');
  });
}

function tocarSom() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) { /* som não suportado, seguir sem erro */ }
}

// Som de "tempo esgotado" do Modo Foco: 3 bipes curtos e mais audíveis
function tocarSomFimDoFoco() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.28, 0.56].forEach((atraso, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = i === 2 ? 880 : 660;
      const inicio = ctx.currentTime + atraso;
      gain.gain.setValueAtTime(0.22, inicio);
      osc.start(inicio);
      osc.stop(inicio + 0.22);
    });
  } catch (e) { /* som não suportado, seguir sem erro */ }
}

/* ================================================================
   12. CONFIGURAÇÕES
   ================================================================ */

function renderizarConfiguracoes() {
  document.getElementById('settings-name').value = state.settings.userName || '';
  document.getElementById('settings-dark').checked = state.settings.theme === 'dark';
  document.getElementById('settings-notifications').checked = !!state.settings.notifications;
  document.getElementById('settings-sounds').checked = state.settings.sounds !== false;
  document.getElementById('settings-first-day').value = String(state.settings.firstDayOfWeek || 0);
}

function aplicarTema() {
  document.documentElement.setAttribute('data-theme', state.settings.theme === 'dark' ? 'dark' : 'light');
}

function configurarConfiguracoes() {
  document.getElementById('settings-name').addEventListener('input', (ev) => {
    state.settings.userName = ev.target.value;
    salvarSettings();
    atualizarCabecalho();
  });

  document.getElementById('settings-dark').addEventListener('change', (ev) => {
    state.settings.theme = ev.target.checked ? 'dark' : 'light';
    salvarSettings();
    aplicarTema();
  });

  document.getElementById('settings-notifications').addEventListener('change', async (ev) => {
    if (ev.target.checked && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      state.settings.notifications = perm === 'granted';
      ev.target.checked = state.settings.notifications;
      if (perm !== 'granted') alert('As notificações não foram permitidas pelo navegador. Você ainda verá avisos dentro do aplicativo enquanto ele estiver aberto.');
    } else {
      state.settings.notifications = ev.target.checked;
    }
    salvarSettings();
  });

  document.getElementById('settings-sounds').addEventListener('change', (ev) => {
    state.settings.sounds = ev.target.checked; salvarSettings();
  });

  document.getElementById('settings-first-day').addEventListener('change', (ev) => {
    state.settings.firstDayOfWeek = Number(ev.target.value); salvarSettings();
  });

  document.getElementById('btn-export').addEventListener('click', exportarBackup);
  document.getElementById('btn-import').addEventListener('change', importarBackup);

  document.getElementById('btn-clear-data').addEventListener('click', () => {
    abrirConfirmacao('Isso vai apagar TODOS os seus dados deste dispositivo, sem volta. Deseja continuar?', () => {
      localStorage.clear();
      location.reload();
    });
  });
}

function exportarBackup() {
  const backup = {
    activities: state.activities, routines: state.routines, categories: state.categories,
    settings: state.settings, completions: state.completions, history: state.history,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `meu-dia-backup-${hojeStr()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importarBackup(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const dados = JSON.parse(reader.result);
      if (!dados || typeof dados !== 'object') throw new Error('Formato inválido');
      abrirConfirmacao('Importar este backup vai substituir os dados atuais deste dispositivo. Continuar?', () => {
        state.activities = dados.activities || [];
        state.routines = dados.routines || [];
        state.categories = dados.categories || [];
        state.settings = Object.assign({}, SETTINGS_PADRAO, dados.settings || {});
        state.completions = dados.completions || {};
        state.history = dados.history || {};
        salvarAtividades(); salvarRotinas(); salvarCategorias(); salvarSettings();
        salvarCompletions(); salvarHistory();
        aplicarTema();
        preencherSelectCategorias(); preencherFiltroCategoriasCalendario();
        irParaTela('screen-today');
        alert('Backup importado com sucesso.');
      });
    } catch (e) {
      alert('Não foi possível importar este arquivo. Verifique se é um backup válido do Meu Dia.');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

/* ================================================================
   ONBOARDING
   ================================================================ */

function configurarOnboarding() {
  document.querySelectorAll('#onboard-categories .chip').forEach((chip) => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  document.getElementById('btn-goto-profile').addEventListener('click', () => {
    // Se a pessoa já preencheu nome/categorias antes, "Começar" pula direto pro app
    if (state.settings.onboarded) {
      document.getElementById('screen-welcome').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      irParaTela('screen-today');
      return;
    }
    document.getElementById('screen-welcome').classList.add('hidden');
    document.getElementById('screen-welcome-profile').classList.remove('hidden');
    document.getElementById('onboard-name').focus();
  });

  document.getElementById('btn-back-intro').addEventListener('click', () => {
    document.getElementById('screen-welcome-profile').classList.add('hidden');
    document.getElementById('screen-welcome').classList.remove('hidden');
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    const nome = document.getElementById('onboard-name').value.trim();
    const notificacoes = document.getElementById('onboard-notifications').checked;
    state.settings.userName = nome;
    state.settings.onboarded = true;
    salvarSettings();

    // Cria só as categorias que a pessoa selecionou (app começa zerado)
    const chipsSelecionados = Array.from(document.querySelectorAll('#onboard-categories .chip.selected'));
    chipsSelecionados.forEach((chip) => {
      const nomeCategoria = chip.dataset.cat;
      const jaExiste = state.categories.some((c) => c.name === nomeCategoria);
      if (!jaExiste) {
        state.categories.push({
          id: gerarId('cat'), name: nomeCategoria,
          color: CATEGORIAS_SUGERIDAS[nomeCategoria] || '#1F5C54'
        });
      }
    });
    salvarCategorias();

    document.getElementById('screen-welcome-profile').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    irParaTela('screen-today');

    if (notificacoes && 'Notification' in window) {
      Notification.requestPermission().then((perm) => {
        state.settings.notifications = perm === 'granted';
        salvarSettings();
      });
    }
  });

  document.getElementById('btn-skip-onboarding').addEventListener('click', () => {
    state.settings.onboarded = true;
    salvarSettings();
    document.getElementById('screen-welcome').classList.add('hidden');
    document.getElementById('screen-welcome-profile').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    irParaTela('screen-today');
  });
}

/* ================================================================
   15. INICIALIZAÇÃO
   ================================================================ */

function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('Service worker não pôde ser registrado:', err);
      });
    });
  }
}

function inicializar() {
  const primeiraVez = localStorage.getItem(CHAVES.activities) === null;
  if (primeiraVez) inicializarDadosVazios();

  carregarEstado();
  aplicarTema();

  configurarNavegacao();
  configurarCalendario();
  configurarFormAtividade();
  configurarFormCategoria();
  configurarModaisUtilitarios();
  configurarModoFoco();
  configurarToastLembrete();
  configurarConfiguracoes();
  configurarOnboarding();
  configurarFiltrosPendentes();

  document.getElementById('settings-manage-categories').addEventListener('click', () => irParaTela('screen-categories'));

  preencherSelectCategorias();
  preencherFiltroCategoriasCalendario();

  document.getElementById('today-search').addEventListener('input', renderizarHoje);
  document.getElementById('tomorrow-search').addEventListener('input', renderizarAmanha);
  document.getElementById('btn-toggle-done-today').addEventListener('click', () => {
    state.hideDoneToday = !state.hideDoneToday;
    renderizarHoje();
  });
  document.getElementById('fab-add').addEventListener('click', () => {
    const tela = telaAtivaId();
    const dataPredefinida = tela === 'screen-tomorrow' ? amanhaStr()
      : tela === 'screen-calendar' ? state.selectedCalendarDay
      : hojeStr();
    abrirModalAtividade(null, null, dataPredefinida);
  });
  document.getElementById('btn-settings').addEventListener('click', () => irParaTela('screen-settings'));
  document.getElementById('btn-new-routine').addEventListener('click', () => {
    document.getElementById('form-activity').reset();
    abrirModalAtividade(null, null, hojeStr());
    document.getElementById('act-recurrence').value = 'daily';
    atualizarVisibilidadeCamposConforme();
  });

  // A tela de boas-vindas sempre aparece ao abrir o app (mesmo depois da primeira vez).
  // "Pular" ou "Começar" levam para dentro do app normalmente.

  setInterval(verificarLembretes, 20000);
  verificarLembretes();

  registrarServiceWorker();
}

document.addEventListener('DOMContentLoaded', inicializar);
