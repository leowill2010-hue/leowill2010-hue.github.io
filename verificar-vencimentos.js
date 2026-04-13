const SB_URL = 'https://qfeebxwjjzdcxeycleik.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'alertas@imovelpro.tec.br';

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
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Accept': 'application/json' }
  });
  if (!res.ok) { console.log(`❌ Erro ao buscar imóveis: ${await res.text()}`); return []; }
  return await res.json();
}

async function buscarDespesas() {
  const res = await fetch(`${SB_URL}/rest/v1/despesas?select=*`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Accept': 'application/json' }
  });
  if (!res.ok) { console.log(`❌ Erro ao buscar despesas: ${await res.text()}`); return []; }
  return await res.json();
}

async function buscarEmailUsuario(userId) {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

async function enviarEmail(para, assunto, alertas) {
  const linhas = alertas.map(a => `<tr><td style="padding:12px 0;border-bottom:1px solid #f0ede8;font-size:14px;color:#1a1a18">${a}</td></tr>`).join('');

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F6F2;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F2;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr><td style="background:#1D9E75;padding:28px 36px">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:#fff;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;padding:8px"><span style="font-size:18px">🏠</span></td>
            <td style="padding-left:12px">
              <div style="font-size:20px;font-weight:700;color:#ffffff;font-family:Georgia,serif">ImóvelPro</div>
              <div style="font-size:12px;color:#9FE1CB;margin-top:2px">Gestão de aluguéis</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:36px">
          <h2 style="margin:0 0 8px;font-size:22px;color:#1a1a18;font-family:Georgia,serif">${assunto}</h2>
          <p style="margin:0 0 24px;font-size:14px;color:#6b6b66">Veja os alertas de hoje:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0ede8">
            ${linhas}
          </table>
          <div style="margin-top:28px;padding:16px;background:#E1F5EE;border-radius:10px;text-align:center">
            <a href="https://imovelpro.tec.br" style="color:#0F6E56;font-weight:600;font-size:14px;text-decoration:none">Acessar ImóvelPro →</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #f0ede8;text-align:center">
          <p style="margin:0;font-size:12px;color:#9e9e99">ImóvelPro · <a href="https://imovelpro.tec.br" style="color:#1D9E75;text-decoration:none">imovelpro.tec.br</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `ImóvelPro <${FROM_EMAIL}>`, to: [para], subject: assunto, html })
  });
  if (!res.ok) { console.log(`❌ Resend erro ${res.status}: ${await res.text()}`); }
  return res.ok;
}

async function main() {
  console.log('🏠 ImóvelPro — Verificando vencimentos...');
  console.log(`📅 Data: ${new Date().toLocaleDateString('pt-BR')}`);

  if (!SB_KEY) { console.error('❌ SUPABASE_SERVICE_KEY não configurada!'); process.exit(1); }
  if (!RESEND_KEY) { console.error('❌ RESEND_API_KEY não configurada!'); process.exit(1); }

  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const mesHoje = hoje.getMonth() + 1;
  const fmt = (v) => `R$${Number(v).toLocaleString('pt-BR')}`;

  const imoveis = await buscarTodosImoveis();
  const despesas = await buscarDespesas();
  console.log(`📋 Total de imóveis: ${imoveis.length}`);

  // Agrupa por usuário
  const porUsuario = {};
  for (const im of imoveis) {
    if (!im.user_id) continue;
    if (!porUsuario[im.user_id]) porUsuario[im.user_id] = { imoveis: [], despesas: [] };
    porUsuario[im.user_id].imoveis.push(im);
  }
  for (const d of despesas) {
    const im = imoveis.find(i => i.id === d.imovel_id);
    if (!im || !im.user_id) continue;
    if (!porUsuario[im.user_id]) porUsuario[im.user_id] = { imoveis: [], despesas: [] };
    porUsuario[im.user_id].despesas.push({ ...d, imovel: im });
  }

  let emailsEnviados = 0;

  for (const [userId, dados] of Object.entries(porUsuario)) {
    const emailLocador = await buscarEmailUsuario(userId);
    if (!emailLocador) { console.log(`⚠️ E-mail não encontrado para usuário ${userId}`); continue; }

    const alertas = [];

    // Alertas de aluguel (imóveis ocupados)
    for (const im of dados.imoveis) {
      if (!im.inquilino || !im.dia || im.status === 'vago') continue;
      const dias = getDiasParaVencimento(im.dia);
      const nome = im.nome || im.endereco || 'Imóvel';
      const valor = fmt(im.valor || 0);
      console.log(`  → ${nome} | dia ${im.dia} | faltam ${dias} dias | status: ${im.status}`);
      if (dias === 3) alertas.push(`⚠️ VENCE EM 3 DIAS: ${nome} — ${im.inquilino} — ${valor} (dia ${im.dia})`);
      if (dias === 1) alertas.push(`🔔 VENCE AMANHÃ: ${nome} — ${im.inquilino} — ${valor} (dia ${im.dia})`);
      if (dias === 0) alertas.push(`📅 VENCE HOJE: ${nome} — ${im.inquilino} — ${valor} (dia ${im.dia})`);
      if (im.status === 'atrasado') alertas.push(`🚨 EM ATRASO: ${nome} — ${im.inquilino} — ${valor}`);
    }

    // Alertas de despesas (imóveis vagos)
    for (const d of dados.despesas) {
      if (d.imovel.status !== 'vago') continue;
      const nome = d.imovel.nome || d.imovel.endereco || 'Imóvel';

      if ((d.tipo === 'agua' || d.tipo === 'energia') && d.dia_vencimento) {
        const dias = getDiasParaVencimento(d.dia_vencimento);
        const label = d.tipo === 'agua' ? '💧 Água' : '⚡ Energia';
        const valor = fmt(d.valor || 0);
        console.log(`  → ${label} ${nome} | dia ${d.dia_vencimento} | faltam ${dias} dias`);
        if (dias === 3) alertas.push(`⚠️ ${label} VENCE EM 3 DIAS: ${nome} — ${valor} (dia ${d.dia_vencimento})`);
        if (dias === 1) alertas.push(`🔔 ${label} VENCE AMANHÃ: ${nome} — ${valor} (dia ${d.dia_vencimento})`);
        if (dias === 0) alertas.push(`📅 ${label} VENCE HOJE: ${nome} — ${valor} (dia ${d.dia_vencimento})`);
        if (dias < 0) alertas.push(`🚨 ${label} VENCIDA: ${nome} — ${valor} (venceu dia ${d.dia_vencimento})`);
      }

      if (d.tipo === 'iptu' && d.iptu_datas) {
        const datas = JSON.parse(d.iptu_datas);
        datas.forEach((data, i) => {
          if (!data) return;
          const [y, m, dia] = data.split('-');
          const dVenc = parseInt(dia);
          const mVenc = parseInt(m);
          if (mVenc === mesHoje) {
            const dias = dVenc - diaHoje;
            const valorParcela = fmt((d.iptu_valor_total || 0) / (d.iptu_parcelas || 1));
            console.log(`  → 🏛 IPTU ${nome} parcela ${i+1} | dia ${dVenc}/${mVenc} | faltam ${dias} dias`);
            if (dias === 3) alertas.push(`⚠️ 🏛 IPTU VENCE EM 3 DIAS: ${nome} — Parcela ${i+1} — ${valorParcela} (dia ${dVenc}/${m})`);
            if (dias === 1) alertas.push(`🔔 🏛 IPTU VENCE AMANHÃ: ${nome} — Parcela ${i+1} — ${valorParcela} (dia ${dVenc}/${m})`);
            if (dias === 0) alertas.push(`📅 🏛 IPTU VENCE HOJE: ${nome} — Parcela ${i+1} — ${valorParcela} (dia ${dVenc}/${m})`);
            if (dias < 0) alertas.push(`🚨 🏛 IPTU VENCIDO: ${nome} — Parcela ${i+1} — ${valorParcela} (venceu dia ${dVenc}/${m})`);
          }
        });
      }
    }

    if (alertas.length > 0) {
      const assunto = alertas.length === 1 ? 'Alerta ImóvelPro' : `${alertas.length} alertas — ImóvelPro`;
      console.log(`📧 Enviando e-mail para ${emailLocador} com ${alertas.length} alerta(s)...`);
      const ok = await enviarEmail(emailLocador, assunto, alertas);
      if (ok) { emailsEnviados++; console.log(`✅ E-mail enviado para ${emailLocador}!`); }
      else { console.log(`❌ Falha ao enviar e-mail para ${emailLocador}`); }
    } else {
      console.log(`ℹ️ Nenhum alerta para ${emailLocador}`);
    }
  }

  console.log(`\n✅ Concluído! ${emailsEnviados} e-mail(s) enviado(s).`);
}

main().catch(console.error);
