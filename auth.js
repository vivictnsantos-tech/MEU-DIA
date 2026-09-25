// =========================================================
// MEU DIA — Autenticação (login, cadastro e aprovação)
// =========================================================

// Dados do projeto Supabase "Meu Dia". A "publishable key" é pública
// por design (protegida pelas regras RLS do banco) — não é segredo.
const SUPABASE_URL = 'https://qolckxsgpxnaiearxhii.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3TR-o-OVjoELzg_I_luVFg_ALML3dyB';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function mostrarSomenteEsteScreen(idAlvo) {
  ['screen-auth-login', 'screen-auth-signup', 'screen-auth-pending', 'screen-welcome']
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
  window.meuDiaPerfil = perfil;
  const itemAprovacoes = document.getElementById('more-manager-approvals');
  if (itemAprovacoes) itemAprovacoes.classList.toggle('hidden', perfil.role !== 'manager');

  await sincronizarCategoriasDoServidor(perfil.company_id);

  mostrarSomenteEsteScreen('screen-welcome');
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

  // 1. Verifica se o código da empresa existe
  const { data: companyId, error: erroCodigo } = await supabaseClient
    .rpc('company_id_from_code', { code: codigo });

  if (erroCodigo || !companyId) {
    mostrarErro('auth-signup-error', 'Código da empresa inválido. Confira com seu gestor.');
    return;
  }

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
