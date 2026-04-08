const SB_URL = 'https://qfeebxwjjzdcxeycleik.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const EJS_SERVICE = 'service_k1fjrru';
const EJS_TEMPLATE = 'template_745dfn3';
const EJS_KEY = '5UAAGnPisPa866ebZ';
const EJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

async function fetch(...args) {
  const { default: f } = await import('node-fetch');
  return f(...args);
}

function getDiasParaVencimento(diaVencimento) {
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  let diasRestantes = diaVencimento - diaHoje;
  if (diasRestantes < 0) diasRestantes += ultimoDiaMes;
  return diasRestantes;
}

async function buscarTodosImoveis() {
  const res = await fetch(`${SB_URL}/rest/v1/imoveis?select=*,user_id`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    const erro = await res.text();
    console.log(`❌ EmailJS erro ${res.status}: ${erro}`);
  }
  return await res.json();
}

async function buscarEmailUsuario(userId) {
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
      accessToken: EJS_PRIVATE_KEY,
      template_params: {
        assunto,
        nome_locador: nomeLocador,
        mensagem,
        to_email: para
      }
    })
  });
   if (!res.ok) {
    const erro = await res.text();
    console.log(`❌ EmailJS erro ${res.status}: ${erro}`);
  }
  return res.ok;
}

async function main() {
  console.log('🏠 ImóvelPro — Verificando vencimentos...');
  console.log(`📅 Data: ${new Date().toLocaleDateString('pt-BR')}`);

  if (!SB_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY não configurada!');
    process.exit(1);
  }

  const imoveis = await buscarTodosImoveis();
  console.log(`📋 Total de imóveis ativos: ${imoveis.length}`);

  // Agrupa por usuário
  const porUsuario = {};
  for (const im of imoveis) {
    if (!im.user_id || !im.inquilino || !im.dia) continue;
    if (!porUsuario[im.user_id]) porUsuario[im.user_id] = [];
    porUsuario[im.user_id].push(im);
  }

  let emailsEnviados = 0;
  const fmt = (v) => `R$${Number(v).toLocaleString('pt-BR')}`;

  for (const [userId, imoveisDoUsuario] of Object.entries(porUsuario)) {
    const emailLocador = await buscarEmailUsuario(userId);
    if (!emailLocador) { console.log(`⚠️ E-mail não encontrado para usuário ${userId}`); continue; }

    const alertas = [];
    for (const im of imoveisDoUsuario) {
      const dias = getDiasParaVencimento(im.dia);
      const nome = im.nome || im.endereco || 'Imóvel';
      const valor = fmt(im.valor || 0);

      console.log(`  → ${nome} | dia ${im.dia} | faltam ${dias} dias | status: ${im.status}`);

      if (dias === 3) alertas.push(`⚠️ VENCE EM 3 DIAS: ${nome} — ${im.inquilino} — ${valor} (dia ${im.dia})`);
      if (dias === 1) alertas.push(`🔔 VENCE AMANHÃ: ${nome} — ${im.inquilino} — ${valor} (dia ${im.dia})`);
      if (dias === 0) alertas.push(`📅 VENCE HOJE: ${nome} — ${im.inquilino} — ${valor} (dia ${im.dia})`);
      if (im.status === 'atrasado') alertas.push(`🚨 EM ATRASO: ${nome} — ${im.inquilino} — ${valor}`);
    }

    if (alertas.length > 0) {
      const mensagem = alertas.join('\n\n');
      const assunto = alertas.length === 1 ? 'Alerta de vencimento de aluguel' : `${alertas.length} alertas de aluguel`;
      console.log(`📧 Enviando e-mail para ${emailLocador} com ${alertas.length} alerta(s)...`);
      const ok = await enviarEmail(emailLocador, assunto, emailLocador.split('@')[0], mensagem);
      if (ok) { emailsEnviados++; console.log(`✅ E-mail enviado!`); }
      else { console.log(`❌ Falha ao enviar e-mail`); }
    } else {
      console.log(`ℹ️ Nenhum alerta para ${emailLocador}`);
    }
  }

  console.log(`\n✅ Concluído! ${emailsEnviados} e-mail(s) enviado(s).`);
}

main().catch(console.error);
