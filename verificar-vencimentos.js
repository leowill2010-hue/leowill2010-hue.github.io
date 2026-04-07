// Script que roda via GitHub Actions todo dia às 8h
// Verifica vencimentos no Supabase e envia e-mails via EmailJS

const SB_URL = 'https://qfeebxwjjzdcxeycleik.supabase.co';
const SB_KEY = 'sb_publishable_t6gMCBwAzdLpgJ6LCFFzBQ_sjnjgBDd';
const EJS_SERVICE = 'service_k1fjrru';
const EJS_TEMPLATE = 'template_745dfn3';
const EJS_KEY = '5UAAGnPisPa866ebZ';

async function fetch(...args) {
  const { default: f } = await import('node-fetch');
  return f(...args);
}

function getDiaAtual() {
  return new Date().getDate();
}

function getDiasParaVencimento(diaVencimento) {
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  
  let diasRestantes = diaVencimento - diaHoje;
  if (diasRestantes < 0) diasRestantes += ultimoDiaMes;
  return diasRestantes;
}

async function buscarTodosUsuarios() {
  // Busca todos os imóveis com inquilinos ativos
  const res = await fetch(`${SB_URL}/rest/v1/imoveis?status=neq.vago&select=*`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    console.error('Erro ao buscar imóveis:', await res.text());
    return [];
  }
  return await res.json();
}

async function buscarEmailLocador(userId) {
  // Busca o e-mail do usuário no Supabase Auth
  const res = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

async function enviarEmail(para, assunto, nomeLocador, mensagem) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EJS_SERVICE,
      template_id: EJS_TEMPLATE,
      user_id: EJS_KEY,
      template_params: {
        assunto,
        nome_locador: nomeLocador,
        mensagem,
        to_email: para
      }
    })
  });
  return res.ok;
}

async function main() {
  console.log('🏠 ImóvelPro — Verificando vencimentos...');
  console.log(`📅 Data: ${new Date().toLocaleDateString('pt-BR')}`);

  const imoveis = await buscarTodosUsuarios();
  console.log(`📋 Total de imóveis ativos: ${imoveis.length}`);

  // Agrupa imóveis por usuário
  const porUsuario = {};
  for (const im of imoveis) {
    if (!im.user_id || !im.inquilino || !im.dia) continue;
    if (!porUsuario[im.user_id]) porUsuario[im.user_id] = [];
    porUsuario[im.user_id].push(im);
  }

  let emailsEnviados = 0;

  for (const [userId, imoveisDoUsuario] of Object.entries(porUsuario)) {
    const emailLocador = await buscarEmailLocador(userId);
    if (!emailLocador) continue;

    const alertas = [];
    const fmt = (v) => `R$${Number(v).toLocaleString('pt-BR')}`;

    for (const im of imoveisDoUsuario) {
      const dias = getDiasParaVencimento(im.dia);
      const nome = im.nome || im.endereco || 'Imóvel';
      const inquilino = im.inquilino;
      const valor = fmt(im.valor || 0);

      // Vence em 3 dias
      if (dias === 3) {
        alertas.push(`⚠️ VENCE EM 3 DIAS: ${nome} — ${inquilino} — ${valor} (dia ${im.dia})`);
      }
      // Vence amanhã
      if (dias === 1) {
        alertas.push(`🔔 VENCE AMANHÃ: ${nome} — ${inquilino} — ${valor} (dia ${im.dia})`);
      }
      // Vence hoje
      if (dias === 0) {
        alertas.push(`📅 VENCE HOJE: ${nome} — ${inquilino} — ${valor} (dia ${im.dia})`);
      }
      // Em atraso
      if (im.status === 'atrasado') {
        alertas.push(`🚨 EM ATRASO: ${nome} — ${inquilino} — ${valor}`);
      }
    }

    if (alertas.length > 0) {
      const mensagem = alertas.join('\n\n');
      const assunto = alertas.length === 1
        ? 'Alerta de vencimento de aluguel'
        : `${alertas.length} alertas de aluguel`;

      console.log(`📧 Enviando e-mail para ${emailLocador} com ${alertas.length} alerta(s)...`);
      const ok = await enviarEmail(emailLocador, assunto, emailLocador.split('@')[0], mensagem);
      if (ok) {
        emailsEnviados++;
        console.log(`✅ E-mail enviado com sucesso!`);
      } else {
        console.log(`❌ Falha ao enviar e-mail para ${emailLocador}`);
      }
    }
  }

  console.log(`\n✅ Concluído! ${emailsEnviados} e-mail(s) enviado(s).`);
}

main().catch(console.error);
