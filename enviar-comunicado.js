const SB_URL = 'https://qfeebxwjjzdcxeycleik.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const ASSUNTO = process.env.ASSUNTO;
const MENSAGEM = process.env.MENSAGEM;
const FROM_EMAIL = 'alertas@imovelpro.tec.br';

async function fetch(...args) {
  const { default: f } = await import('node-fetch');
  return f(...args);
}

async function buscarUsuarios() {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`
    }
  });
  if (!res.ok) { console.error('Erro ao buscar usuários:', await res.text()); return []; }
  const data = await res.json();
  return data.users || [];
}

async function enviarEmail(para, nome) {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
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
          <h2 style="margin:0 0 8px;font-size:22px;color:#1a1a18;font-family:Georgia,serif">${ASSUNTO}</h2>
          <p style="margin:0 0 20px;font-size:14px;color:#6b6b66">Olá, ${nome}!</p>
          <div style="font-size:14px;color:#1a1a18;line-height:1.7;white-space:pre-line">${MENSAGEM}</div>
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
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `ImóvelPro <${FROM_EMAIL}>`,
      to: [para],
      subject: ASSUNTO,
      html
    })
  });
  if (!res.ok) {
    console.log(`❌ Erro ao enviar para ${para}: ${await res.text()}`);
  }
  return res.ok;
}

async function main() {
  console.log('📢 ImóvelPro — Enviando comunicado...');
  console.log(`📋 Assunto: ${ASSUNTO}`);

  if (!SB_KEY || !RESEND_KEY || !ASSUNTO || !MENSAGEM) {
    console.error('❌ Variáveis não configuradas!');
    process.exit(1);
  }

  const usuarios = await buscarUsuarios();
  console.log(`👥 Total de locadores: ${usuarios.length}`);

  let enviados = 0;
  for (const u of usuarios) {
    if (!u.email) continue;
    const nome = u.user_metadata?.full_name || u.email.split('@')[0];
    console.log(`📧 Enviando para ${u.email}...`);
    const ok = await enviarEmail(u.email, nome);
    if (ok) { enviados++; console.log(`✅ Enviado para ${u.email}!`); }
  }

  console.log(`\n✅ Concluído! ${enviados} e-mail(s) enviado(s).`);
}

main().catch(console.error);
