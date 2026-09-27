// =========================================================
// MEU DIA — Autenticação (login, cadastro e aprovação)
// =========================================================

// Dados do projeto Supabase "Meu Dia". A "publishable key" é pública
// por design (protegida pelas regras RLS do banco) — não é segredo.
const SUPABASE_URL = 'https://qolckxsgpxnaiearxhii.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3TR-o-OVjoELzg_I_luVFg_ALML3dyB';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function mostrarSomenteEsteScreen(idAlvo) {
  ['screen-auth-login', 'screen-auth-signup', 'screen-auth-pending', 'screen-welcome', 'screen-auth-forgot', 'screen-auth-reset']
    .forEach((id) => document.getElementById(id).classList.toggle('hidden', id !== idAlvo));
  document.getElementById('app').classList.add('hidden');
}

function mostrarErro(idElemento, mensagem) {
  const el = document.getElementById(idElemento);
  el.textContent = mensagem;
  el.classList.remove('hidden');
}

function esconderErro(idElemento) {
  document.getElementById(idElemento).classList.add('hidden');
}

// -----------------------------------------------------------
// Depois do login: descobre se a pessoa já está aprovada
// -----------------------------------------------------------
async function verificarAprovacaoEProsseguir() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const usuario = sessionData?.session?.user;
  if (!usuario) {
    mostrarSomenteEsteScreen('screen-auth-login');
    return;
  }

  const { data: perfil, error } = await supabaseClient
    .from('profiles')
    .select('approved, role, name, company_id')
    .eq('id', usuario.id)
    .maybeSingle();

  if (error || !perfil) {
    // Pode ser um cadastro que ficou pela metade (ex: confirmação de e-mail no meio do caminho).
    const pendente = localStorage.getItem('meudia_pending_profile');
    if (pendente) {
      try {
        const dados = JSON.parse(pendente);
        const { error: erroCriar } = await supabaseClient.from('profiles').insert({
          id: usuario.id,
          company_id: dados.companyId,
          role: 'collaborator',
          name: dados.name,
          approved: false
        });
        if (!erroCriar) {
          localStorage.removeItem('meudia_pending_profile');
          mostrarSomenteEsteScreen('screen-auth-pending');
          return;
        }
      } catch (e) { /* segue para o erro normal abaixo */ }
    }

    mostrarErro('auth-login-error', 'Não encontramos seu cadastro. Tente novamente ou fale com seu gestor.');
    mostrarSomenteEsteScreen('screen-auth-login');
    return;
  }

  if (!perfil.approved) {
    mostrarSomenteEsteScreen('screen-auth-pending');
    return;
  }

  // Aprovado! Segue o fluxo normal do app (tela de boas-vindas / app principal).
  window.meuDiaPerfil = { ...perfil, id: usuario.id };
  const itemAprovacoes = document.getElementById('more-manager-approvals');
  if (itemAprovacoes) itemAprovacoes.classList.toggle('hidden', perfil.role !== 'manager');
  const itemTarefasEquipe = document.getElementById('more-team-tasks');
  if (itemTarefasEquipe) itemTarefasEquipe.classList.toggle('hidden', perfil.role !== 'manager');

  await sincronizarCategoriasDoServidor(perfil.company_id);
  await sincronizarAtividadesDoServidor();
  await sincronizarRotinasDoServidor();
  const rotinasLocais = JSON.parse(localStorage.getItem('meudia_routines') || '[]');
  await sincronizarCompletionsDoServidor(rotinasLocais);
  await carregarMembrosDaEmpresa();

  // Se a pessoa já passou pela tela de boas-vindas antes (em qualquer sessão
  // anterior), pula direto pro app — atualizar a página não deve "resetar"
  // a tela pra ela ter que apertar Começar/Pular de novo.
  let jaOnboarded = false;
  try {
    const settings = JSON.parse(localStorage.getItem('meudia_settings') || '{}');
    jaOnboarded = !!settings.onboarded;
  } catch (e) { /* ignora */ }

  if (jaOnboarded) {
    ['screen-auth-login', 'screen-auth-signup', 'screen-auth-pending', 'screen-welcome', 'screen-auth-forgot', 'screen-auth-reset']
      .forEach((id) => document.getElementById(id).classList.add('hidden'));
    document.getElementById('app').classList.remove('hidden');
  } else {
    mostrarSomenteEsteScreen('screen-welcome');
  }
  if (window.iniciarAppMeuDia) window.iniciarAppMeuDia();
}

// -----------------------------------------------------------
// Categorias: sincronização com o Supabase (compartilhadas por empresa)
// -----------------------------------------------------------
async function sincronizarCategoriasDoServidor(companyId) {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name, color')
    .eq('company_id', companyId);
  if (!error && data) {
    localStorage.setItem('meudia_categories', JSON.stringify(data));
  }
}

window.sincronizarCategoriasNoServidor = async function sincronizarCategoriasNoServidor(categoriasLocais) {
  if (!window.meuDiaPerfil || !window.meuDiaPerfil.company_id) return;
  const companyId = window.meuDiaPerfil.company_id;

  const linhas = categoriasLocais.map((c) => ({ id: c.id, company_id: companyId, name: c.name, color: c.color }));
  if (linhas.length > 0) {
    await supabaseClient.from('categories').upsert(linhas);
  }

  const idsLocais = categoriasLocais.map((c) => c.id);
  let query = supabaseClient.from('categories').delete().eq('company_id', companyId);
  if (idsLocais.length > 0) query = query.not('id', 'in', `(${idsLocais.join(',')})`);
  await query;
};

// -----------------------------------------------------------
// Atividades: sincronização com o Supabase
// -----------------------------------------------------------
function atividadeParaLinha(a, companyId, meuId) {
  return {
    id: a.id,
    company_id: companyId,
    created_by: a.createdBy || meuId,
    assigned_to: a.assignedTo || meuId,
    title: a.title,
    type: a.type || 'tarefa',
    priority: a.priority || null,
    category_id: a.category || null,
    description: a.description || null,
    notes: a.notes || null,
    date: a.date,
    time: a.time || null,
    end_time: a.endTime || null,
    subtasks: a.subtasks || [],
    focus_enabled: !!a.focusModeAllowed,
    status: a.completed ? 'concluida' : 'pendente',
    completed_at: a.completed ? new Date().toISOString() : null,
    extra: { order: a.order || 0, reminderMinutes: a.reminderMinutes || null, reminderCustom: a.reminderCustom || null }
  };
}

// O Supabase devolve o horário como "23:20:00" (com segundos); o app usa
// sempre "23:20" — corta os segundos assim que os dados chegam do servidor,
// pra não aparecer feio em nenhuma tela.
function cortarSegundos(hhmmss) {
  return (hhmmss && hhmmss.length > 5) ? hhmmss.slice(0, 5) : (hhmmss || '');
}

function linhaParaAtividade(r) {
  return {
    id: r.id, title: r.title, description: r.description || '', date: r.date,
    time: cortarSegundos(r.time), endTime: cortarSegundos(r.end_time), category: r.category_id || '',
    priority: r.priority || 'media', type: r.type || 'tarefa',
    reminderMinutes: r.extra?.reminderMinutes ?? null, reminderCustom: r.extra?.reminderCustom ?? '',
    subtasks: r.subtasks || [], notes: r.notes || '', focusModeAllowed: !!r.focus_enabled,
    completed: r.status === 'concluida', order: r.extra?.order || 0,
    createdAt: new Date(r.created_at).getTime(),
    assignedTo: r.assigned_to, createdBy: r.created_by
  };
}

async function sincronizarAtividadesDoServidor() {
  // A agenda pessoal (Hoje/Amanhã/Calendário) mostra só as atividades da PRÓPRIA pessoa,
  // mesmo para o gestor — a visão de toda a equipe é uma tela separada (Aprovar colaboradores
  // hoje; um painel de acompanhamento da equipe pode vir depois).
  const meuId = window.meuDiaPerfil ? window.meuDiaPerfil.id : null;
  if (!meuId) return;
  const { data, error } = await supabaseClient
    .from('activities')
    .select('*')
    .eq('assigned_to', meuId)
    .order('date', { ascending: true });
  if (!error && data) {
    localStorage.setItem('meudia_activities', JSON.stringify(data.map(linhaParaAtividade)));
  }
}

window.sincronizarAtividadesNoServidor = async function sincronizarAtividadesNoServidor(atividadesLocais) {
  if (!window.meuDiaPerfil) return { ok: false, error: 'sem perfil' };
  const companyId = window.meuDiaPerfil.company_id;
  const meuId = window.meuDiaPerfil.id;

  const linhas = atividadesLocais.map((a) => atividadeParaLinha(a, companyId, meuId));
  if (linhas.length > 0) {
    const { error: erroUpsert } = await supabaseClient.from('activities').upsert(linhas);
    if (erroUpsert) {
      console.error('Falha ao salvar atividades no servidor:', erroUpsert);
      return { ok: false, error: erroUpsert.message };
    }
  }

  const idsLocais = atividadesLocais.map((a) => a.id);
  // Só apaga no servidor as atividades que EU criei E que são minhas mesmo (autoatribuídas)
  // e que sumiram localmente — nunca mexe em tarefas que atribuí a outras pessoas.
  let query = supabaseClient.from('activities').delete().eq('created_by', meuId).eq('assigned_to', meuId);
  if (idsLocais.length > 0) query = query.not('id', 'in', `(${idsLocais.join(',')})`);
  const { error: erroDelete } = await query;
  if (erroDelete) {
    console.error('Falha ao limpar atividades removidas no servidor:', erroDelete);
    return { ok: false, error: erroDelete.message };
  }
  return { ok: true };
};

// -----------------------------------------------------------
// Edição pelo gestor de uma atividade/rotina de um colaborador, feita a
// partir da tela "Agenda de [colaborador]" — grava só esse item direto no
// servidor (mesma linha/tabela de sempre), sem mexer no state.activities/
// state.routines de quem está logado, que é só a agenda PESSOAL dele.
// -----------------------------------------------------------
window.salvarEdicaoItemMembro = async function salvarEdicaoItemMembro(item, isRoutine) {
  if (!window.meuDiaPerfil) return { ok: false, error: 'sem perfil' };
  const companyId = window.meuDiaPerfil.company_id;
  const meuId = window.meuDiaPerfil.id;
  const linha = isRoutine ? rotinaParaLinha(item, companyId, meuId) : atividadeParaLinha(item, companyId, meuId);
  const { error } = await supabaseClient.from('activities').upsert(linha);
  if (error) {
    console.error('Falha ao salvar edição de item do colaborador:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
};

// -----------------------------------------------------------
// Rotinas: sincronização com o Supabase.
// Rotinas usam a MESMA tabela "activities" (type = 'rotina'), guardando
// a regra de repetição inteira dentro da coluna jsonb "recurrence".
// As conclusões dia a dia ficam em "activity_occurrences" (ver mais abaixo).
// -----------------------------------------------------------
function rotinaParaLinha(r, companyId, meuId) {
  return {
    id: r.id,
    company_id: companyId,
    created_by: r.createdBy || meuId,
    assigned_to: r.assignedTo || meuId,
    title: r.title,
    type: 'rotina',
    priority: r.priority || null,
    category_id: r.category || null,
    description: r.description || null,
    notes: r.notes || null,
    date: r.startDate,
    time: r.time || null,
    end_time: r.endTime || null,
    subtasks: r.subtasks || [],
    focus_enabled: !!r.focusModeAllowed,
    status: 'pendente',
    recurrence: {
      recurrence: r.recurrence, days: r.days || [], interval: r.interval || null,
      startDate: r.startDate, endDate: r.endDate || '', active: r.active !== false,
      paused: !!r.paused, skipDates: r.skipDates || []
    },
    extra: { reminderMinutes: r.reminderMinutes || null, reminderCustom: r.reminderCustom || null }
  };
}

function linhaParaRotina(r) {
  const rec = r.recurrence || {};
  return {
    id: r.id, title: r.title, description: r.description || '',
    time: cortarSegundos(r.time), endTime: cortarSegundos(r.end_time), category: r.category_id || '',
    priority: r.priority || 'media', type: 'rotina',
    reminderMinutes: r.extra?.reminderMinutes ?? null, reminderCustom: r.extra?.reminderCustom ?? '',
    subtasks: r.subtasks || [], notes: r.notes || '', focusModeAllowed: !!r.focus_enabled,
    recurrence: rec.recurrence || 'daily', days: rec.days || [], interval: rec.interval || null,
    startDate: rec.startDate || r.date, endDate: rec.endDate || '',
    active: rec.active !== false, paused: !!rec.paused, skipDates: rec.skipDates || [],
    createdAt: new Date(r.created_at).getTime(),
    assignedTo: r.assigned_to, createdBy: r.created_by
  };
}

async function sincronizarRotinasDoServidor() {
  const meuId = window.meuDiaPerfil ? window.meuDiaPerfil.id : null;
  if (!meuId) return;
  const { data, error } = await supabaseClient
    .from('activities')
    .select('*')
    .eq('type', 'rotina')
    .eq('assigned_to', meuId);
  if (!error && data) {
    localStorage.setItem('meudia_routines', JSON.stringify(data.map(linhaParaRotina)));
  }
}

window.sincronizarRotinasNoServidor = async function sincronizarRotinasNoServidor(rotinasLocais) {
  if (!window.meuDiaPerfil) return { ok: false, error: 'sem perfil' };
  const companyId = window.meuDiaPerfil.company_id;
  const meuId = window.meuDiaPerfil.id;

  const linhas = rotinasLocais.map((r) => rotinaParaLinha(r, companyId, meuId));
  if (linhas.length > 0) {
    const { error: erroUpsert } = await supabaseClient.from('activities').upsert(linhas);
    if (erroUpsert) {
      console.error('Falha ao salvar rotinas no servidor:', erroUpsert);
      return { ok: false, error: erroUpsert.message };
    }
  }

  const idsLocais = rotinasLocais.map((r) => r.id);
  let query = supabaseClient.from('activities').delete()
    .eq('type', 'rotina').eq('created_by', meuId).eq('assigned_to', meuId);
  if (idsLocais.length > 0) query = query.not('id', 'in', `(${idsLocais.join(',')})`);
  const { error: erroDelete } = await query;
  if (erroDelete) {
    console.error('Falha ao limpar rotinas removidas no servidor:', erroDelete);
    return { ok: false, error: erroDelete.message };
  }
  return { ok: true };
};

// -----------------------------------------------------------
// Conclusões de ocorrências de rotina (uma linha por rotina + data)
// -----------------------------------------------------------
async function sincronizarCompletionsDoServidor(rotinasLocais) {
  const idsRotinas = rotinasLocais.map((r) => r.id);
  if (idsRotinas.length === 0) {
    localStorage.setItem('meudia_completions', JSON.stringify({}));
    return;
  }
  const { data, error } = await supabaseClient
    .from('activity_occurrences')
    .select('activity_id, occurrence_date, completed, subtasks_state')
    .in('activity_id', idsRotinas);
  if (!error && data) {
    const completions = {};
    data.forEach((o) => {
      const chave = o.activity_id + '|' + o.occurrence_date;
      completions[chave] = { done: !!o.completed, subtasksDone: o.subtasks_state || {} };
    });
    localStorage.setItem('meudia_completions', JSON.stringify(completions));
  }
}

window.sincronizarCompletionsNoServidor = async function sincronizarCompletionsNoServidor(completionsLocais) {
  if (!window.meuDiaPerfil) return;
  const meuId = window.meuDiaPerfil.id;
  const chaves = Object.keys(completionsLocais);
  if (chaves.length === 0) return;

  const linhas = chaves.map((chave) => {
    const [activityId, occurrenceDate] = chave.split('|');
    const comp = completionsLocais[chave];
    return {
      activity_id: activityId,
      occurrence_date: occurrenceDate,
      completed: !!comp.done,
      completed_by: meuId,
      completed_at: comp.done ? new Date().toISOString() : null,
      subtasks_state: comp.subtasksDone || {}
    };
  });
  await supabaseClient.from('activity_occurrences').upsert(linhas, { onConflict: 'activity_id,occurrence_date' });
};

// -----------------------------------------------------------
// Lista de colaboradores da empresa (para o gestor atribuir atividades)
// -----------------------------------------------------------
async function carregarMembrosDaEmpresa() {
  const perfil = window.meuDiaPerfil;
  if (!perfil) return;

  if (perfil.role !== 'manager') {
    window.meuDiaMembros = [{ id: perfil.id, name: perfil.name }];
    return;
  }

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, name')
    .eq('company_id', perfil.company_id)
    .eq('approved', true)
    .order('name', { ascending: true });

  window.meuDiaMembros = (!error && data) ? data : [{ id: perfil.id, name: perfil.name }];
}

// -----------------------------------------------------------
// Painel do gestor: tarefas atribuídas aos colaboradores
// (separado da agenda pessoal dela — vem direto do servidor,
// nunca do localStorage, que só guarda as tarefas da própria pessoa)
// -----------------------------------------------------------
window.renderizarTarefasEquipe = async function renderizarTarefasEquipe() {
  const lista = document.getElementById('lista-tarefas-equipe');
  const vazio = document.getElementById('tarefas-equipe-empty');
  if (!lista || !window.meuDiaPerfil) return;
  lista.innerHTML = '<p class="hint-text">Carregando...</p>';

  const meuId = window.meuDiaPerfil.id;
  const { data, error } = await supabaseClient
    .from('activities')
    .select('id, title, date, status, assigned_to, created_by')
    .neq('assigned_to', meuId)
    .order('date', { ascending: true });

  if (error) {
    lista.innerHTML = '<p class="hint-text">Não foi possível carregar agora. Tente de novo em instantes.</p>';
    return;
  }

  if (!data || data.length === 0) {
    lista.innerHTML = '';
    vazio.classList.remove('hidden');
    return;
  }
  vazio.classList.add('hidden');

  const membros = window.meuDiaMembros || [];
  const nomePorId = {};
  membros.forEach((m) => { nomePorId[m.id] = m.name; });

  // Agrupa por colaborador
  const porPessoa = {};
  data.forEach((t) => {
    const nome = nomePorId[t.assigned_to] || 'Colaborador';
    if (!porPessoa[nome]) porPessoa[nome] = [];
    porPessoa[nome].push(t);
  });

  lista.innerHTML = Object.keys(porPessoa).sort().map((nome) => `
    <div class="settings-section">
      <p class="settings-section-title">👤 ${nome}</p>
      ${porPessoa[nome].map((t) => `
        <div class="settings-row" style="align-items:center;">
          <span style="${t.status === 'concluida' ? 'text-decoration:line-through;color:#8A8A8A;' : ''}">
            ${t.created_by === t.assigned_to ? '' : '📋 '}${t.title}
          </span>
          <span style="font-size:13px;color:#8A8A8A;">${t.status === 'concluida' ? '✓ Concluída' : dataCurtaSimples(t.date)}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  // Preenche o seletor "Ver agenda completa de um colaborador"
  const select = document.getElementById('select-membro-agenda');
  if (select) {
    const meuIdSelect = window.meuDiaPerfil.id;
    const membros = (window.meuDiaMembros || []).filter((m) => m.id !== meuIdSelect);
    select.innerHTML = membros.length
      ? membros.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')
      : '<option value="">Nenhum colaborador aprovado ainda</option>';
  }
};

// -----------------------------------------------------------
// Agenda completa de UM colaborador (visão do gestor): busca tudo o que
// essa pessoa tem — o que o gestor atribuiu E o que ela mesma criou —
// direto do servidor, sem mexer no localStorage da gestora.
// -----------------------------------------------------------
window.carregarAgendaDoMembro = async function carregarAgendaDoMembro(membroId) {
  const [tarefasResp, rotinasResp] = await Promise.all([
    supabaseClient.from('activities').select('*').eq('assigned_to', membroId).neq('type', 'rotina'),
    supabaseClient.from('activities').select('*').eq('assigned_to', membroId).eq('type', 'rotina')
  ]);

  const activities = (!tarefasResp.error && tarefasResp.data) ? tarefasResp.data.map(linhaParaAtividade) : [];
  const routines = (!rotinasResp.error && rotinasResp.data) ? rotinasResp.data.map(linhaParaRotina) : [];

  let completions = {};
  const idsRotinas = routines.map((r) => r.id);
  if (idsRotinas.length > 0) {
    const { data: ocorrencias, error: erroOcorrencias } = await supabaseClient
      .from('activity_occurrences')
      .select('activity_id, occurrence_date, completed, subtasks_state')
      .in('activity_id', idsRotinas);
    if (!erroOcorrencias && ocorrencias) {
      ocorrencias.forEach((o) => {
        completions[o.activity_id + '|' + o.occurrence_date] = { done: !!o.completed, subtasksDone: o.subtasks_state || {} };
      });
    }
  }

  return { activities, routines, completions };
};

function dataCurtaSimples(dataStr) {
  const d = new Date(dataStr + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// -----------------------------------------------------------
// Painel do gestor: aprovar colaboradores pendentes
// -----------------------------------------------------------
window.renderizarAprovacoesPendentes = async function renderizarAprovacoesPendentes() {
  const lista = document.getElementById('lista-aprovacoes');
  const vazio = document.getElementById('aprovacoes-empty');
  if (!lista) return;
  lista.innerHTML = '<p class="hint-text">Carregando...</p>';

  const { data: pendentes, error } = await supabaseClient
    .from('profiles')
    .select('id, name')
    .eq('approved', false)
    .eq('role', 'collaborator')
    .order('created_at', { ascending: true });

  if (error) {
    lista.innerHTML = '<p class="hint-text">Não foi possível carregar agora. Tente de novo em instantes.</p>';
    return;
  }

  if (!pendentes || pendentes.length === 0) {
    lista.innerHTML = '';
    vazio.classList.remove('hidden');
    return;
  }
  vazio.classList.add('hidden');

  lista.innerHTML = pendentes.map((p) => `
    <div class="settings-row" data-id="${p.id}" style="align-items:center;">
      <span>${p.name}</span>
      <button class="btn btn-primary btn-aprovar" style="padding:8px 16px;font-size:14px;">Aprovar</button>
    </div>
  `).join('');

  lista.querySelectorAll('.btn-aprovar').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      const linha = ev.target.closest('[data-id]');
      const id = linha.dataset.id;
      btn.disabled = true;
      btn.textContent = 'Aprovando...';
      const { error: erroAprovar } = await supabaseClient
        .from('profiles')
        .update({ approved: true })
        .eq('id', id);
      if (erroAprovar) {
        btn.disabled = false;
        btn.textContent = 'Aprovar';
        alert('Não foi possível aprovar agora. Tente novamente.');
        return;
      }
      linha.remove();
      if (!lista.querySelector('[data-id]')) {
        vazio.classList.remove('hidden');
      }
    });
  });
};

// -----------------------------------------------------------
// Formulário de login
// -----------------------------------------------------------
document.getElementById('btn-login-submit').addEventListener('click', async () => {
  esconderErro('auth-login-error');
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-password').value;

  if (!email || !senha) {
    mostrarErro('auth-login-error', 'Preencha e-mail e senha.');
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
  if (error) {
    mostrarErro('auth-login-error', 'E-mail ou senha incorretos.');
    return;
  }

  await verificarAprovacaoEProsseguir();
});

// -----------------------------------------------------------
// Alternar entre login e cadastro
// -----------------------------------------------------------
document.getElementById('btn-goto-signup').addEventListener('click', () => {
  mostrarSomenteEsteScreen('screen-auth-signup');
});
document.getElementById('btn-back-login').addEventListener('click', () => {
  mostrarSomenteEsteScreen('screen-auth-login');
});

// -----------------------------------------------------------
// Esqueci minha senha
// -----------------------------------------------------------
document.getElementById('btn-goto-forgot').addEventListener('click', () => {
  esconderErro('auth-forgot-error');
  document.getElementById('auth-forgot-success').classList.add('hidden');
  mostrarSomenteEsteScreen('screen-auth-forgot');
});
document.getElementById('btn-back-forgot').addEventListener('click', () => {
  mostrarSomenteEsteScreen('screen-auth-login');
});

document.getElementById('btn-forgot-submit').addEventListener('click', async () => {
  esconderErro('auth-forgot-error');
  document.getElementById('auth-forgot-success').classList.add('hidden');
  const email = document.getElementById('forgot-email').value.trim();

  if (!email) {
    mostrarErro('auth-forgot-error', 'Digite o e-mail da sua conta.');
    return;
  }

  const urlAtual = window.location.origin + window.location.pathname;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: urlAtual
  });

  if (error) {
    mostrarErro('auth-forgot-error', 'Não foi possível enviar o link agora. Tente novamente em instantes.');
    return;
  }

  const sucesso = document.getElementById('auth-forgot-success');
  sucesso.textContent = 'Pronto! Se esse e-mail tiver uma conta, o link pra criar uma senha nova já foi enviado. Confira sua caixa de entrada (e o spam).';
  sucesso.classList.remove('hidden');
});

// -----------------------------------------------------------
// Criar nova senha (depois de clicar no link recebido por e-mail)
// -----------------------------------------------------------
document.getElementById('btn-reset-submit').addEventListener('click', async () => {
  esconderErro('auth-reset-error');
  const novaSenha = document.getElementById('reset-password').value;

  if (!novaSenha || novaSenha.length < 6) {
    mostrarErro('auth-reset-error', 'A senha precisa ter pelo menos 6 caracteres.');
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });

  if (error) {
    mostrarErro('auth-reset-error', 'Não foi possível salvar a nova senha. Tente clicar no link do e-mail novamente.');
    return;
  }

  document.getElementById('reset-password').value = '';
  await verificarAprovacaoEProsseguir();
});

// Quando a pessoa clica no link de "esqueci minha senha" recebido por e-mail,
// o Supabase abre o app com uma sessão especial de recuperação. Detectamos
// isso aqui e mandamos ela direto pra tela de "criar nova senha".
supabaseClient.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    mostrarSomenteEsteScreen('screen-auth-reset');
  }
});

// -----------------------------------------------------------
// Formulário de cadastro
// -----------------------------------------------------------
document.getElementById('btn-signup-submit').addEventListener('click', async () => {
  esconderErro('auth-signup-error');
  const nome = document.getElementById('signup-name').value.trim();
  const codigo = document.getElementById('signup-company-code').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const senha = document.getElementById('signup-password').value;

  if (!nome || !codigo || !email || !senha) {
    mostrarErro('auth-signup-error', 'Preencha todos os campos.');
    return;
  }
  if (senha.length < 6) {
    mostrarErro('auth-signup-error', 'A senha precisa ter pelo menos 6 caracteres.');
    return;
  }

  // 1. Verifica se o código da empresa existe e se ainda tem vaga disponível
  const { data: vagaData, error: erroCodigo } = await supabaseClient
    .rpc('verificar_vaga_empresa', { code: codigo });
  const vaga = vagaData && vagaData[0];

  if (erroCodigo || !vaga || !vaga.company_id) {
    mostrarErro('auth-signup-error', 'Código da empresa inválido. Confira com seu gestor.');
    return;
  }
  if (!vaga.tem_vaga) {
    mostrarErro('auth-signup-error', 'Essa empresa já atingiu o limite de colaboradores no plano dela. Fale com seu gestor.');
    return;
  }
  const companyId = vaga.company_id;

  // Guarda os dados do cadastro antes de criar o login — usado caso a confirmação
  // de e-mail interrompa o processo no meio (ver verificarAprovacaoEProsseguir).
  localStorage.setItem('meudia_pending_profile', JSON.stringify({ name: nome, companyId }));

  // 2. Cria o login
  const { data: signUpData, error: erroCadastro } = await supabaseClient.auth.signUp({
    email, password: senha
  });

  if (erroCadastro) {
    mostrarErro('auth-signup-error', erroCadastro.message.includes('already registered')
      ? 'Esse e-mail já tem uma conta. Tente entrar.'
      : 'Não foi possível criar sua conta. Tente novamente.');
    return;
  }

  // 3. Se o Supabase exigir confirmação de e-mail, ainda não existe sessão ativa.
  //    Os dados já ficaram salvos em localStorage (acima) e serão usados assim
  //    que a pessoa confirmar o e-mail e voltar a abrir o app.
  if (!signUpData.session) {
    mostrarErro('auth-signup-error', 'Verifique seu e-mail para confirmar o cadastro. Depois, é só voltar e abrir o app normalmente.');
    mostrarSomenteEsteScreen('screen-auth-login');
    return;
  }

  // 4. Cria o perfil (pendente de aprovação) ligado à empresa
  const { error: erroPerfil } = await supabaseClient.from('profiles').insert({
    id: signUpData.user.id,
    company_id: companyId,
    role: 'collaborator',
    name: nome,
    approved: false
  });

  if (erroPerfil) {
    mostrarErro('auth-signup-error', 'Sua conta foi criada, mas houve um erro ao vincular à empresa. Fale com seu gestor.');
    return;
  }

  localStorage.removeItem('meudia_pending_profile');
  mostrarSomenteEsteScreen('screen-auth-pending');
});

// -----------------------------------------------------------
// Tela de "aguardando aprovação"
// -----------------------------------------------------------
document.getElementById('btn-check-approval').addEventListener('click', verificarAprovacaoEProsseguir);
document.getElementById('btn-logout-pending').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  mostrarSomenteEsteScreen('screen-auth-login');
});

// -----------------------------------------------------------
// Ao abrir o app: já tem sessão salva?
// -----------------------------------------------------------
document.addEventListener('DOMContentLoaded', verificarAprovacaoEProsseguir);

// -----------------------------------------------------------
// Botão "Sair" (dentro de Configurações)
// -----------------------------------------------------------
const botaoSair = document.getElementById('btn-logout');
if (botaoSair) {
  botaoSair.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja sair da sua conta?')) return;
    await supabaseClient.auth.signOut();
    location.reload();
  });
}
