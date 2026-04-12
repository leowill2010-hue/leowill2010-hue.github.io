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
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    const erro = await res.text();
    console.log(`❌ Supabase erro ${res.status}: ${erro}`);
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

async function enviarEmail(para, assunto, nomeLocador, alertas) {
  const linhas = alertas.map(a => `<tr><td style="padding:12px 0;border-bottom:1px solid #f0ede8;font-size:14px;color:#1a1a18">${a}</td></tr>`).join('');

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F6F2;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F2;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        
        <!-- Header -->
        <tr><td style="background:#1D9E75;padding:28px 36px">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#fff;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;padding:8px">
                <span style="font-size:18px">🏠</span>
              </td>
              <td style="padding-left:12px">
                <div style="font-size:20px;font-weight:700;color:#ffffff;font-family:Georgia,serif">ImóvelPro</div>
                <div style="font-size:12px;color:#9FE1CB;margin-top:2px">Gestão de aluguéis</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px">
          <h2 style="margin:0 0 8px;font-size:22px;color:#1a1a18;font-family:Georgia,serif">${assunto}</h2>
          <p style="margin:0 0 24px;font-size:14px;color:#6b6b66">Olá, ${nomeLocador}! Veja os alertas de hoje:</p>
          
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0ede8">
            ${linhas}
          </table>

          <div style="margin-top:28px;padding:16px;background:#E1F5EE;border-radius:10px;text-align:center">
            <a href="https://imovelpro.tec.br" style="color:#0F6E56;font-weight:600;font-size:14px;text-decoration:none">
              Acessar ImóvelPro →
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 36px;border-top:1px solid #f0ede8;text-align:center">
          <p style="margin:0;font-size:12px;color:#9e9e99">
            Este e-mail foi enviado automaticamente pelo ImóvelPro.<br>
            <a href="https://imovelpro.tec.br" style="color:#1D9E75;text-decoration:none">imovelpro.tec.br</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `ImóvelPro <${FROM_EMAIL}>`,
      to: [para],
      subject: assunto,
      html
    })
  });

  if (!res.ok) {
    const erro = await res.text();
    console.log(`❌ Resend erro ${res.status}: ${erro}`);
  }
  return res.ok;
}

async function main() {
  console.log('🏠 ImóvelPro — Verificando vencimentos...');
  console.log(`📅 Data: ${new Date().toLocaleDateString('pt-BR')}`);

  if (!SB_KEY) { console.error('❌ SUPABASE_SERVICE_KEY não configurada!'); process.exit(1); }
  if (!RESEND_KEY) { console.error('❌ RESEND_API_KEY não configurada!'); process.exit(1); }

  const imoveis = await buscarTodosImoveis();
  console.log(`📋 Total de imóveis ativos: ${imoveis.length}`);

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
      const assunto = alertas.length === 1 ? 'Alerta de vencimento de aluguel' : `${alertas.length} alertas de aluguel — ImóvelPro`;
      console.log(`📧 Enviando e-mail para ${emailLocador} com ${alertas.length} alerta(s)...`);
      const ok = await enviarEmail(emailLocador, assunto, emailLocador.split('@')[0], alertas);
      if (ok) { emailsEnviados++; console.log(`✅ E-mail enviado para ${emailLocador}!`); }
      else { console.log(`❌ Falha ao enviar e-mail para ${emailLocador}`); }
    } else {
      console.log(`ℹ️ Nenhum alerta para ${emailLocador}`);
    }
  }

  console.log(`\n✅ Concluído! ${emailsEnviados} e-mail(s) enviado(s).`);
}

main().catch(console.error);
