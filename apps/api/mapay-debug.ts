/**
 * Correct-KEY test: which URL should we hand the user?
 * A) submit.php full GET URL  B) the /pay/<trade_no> 302 target
 */
import { signParams } from './src/payment/providers/aggregate/mapay.signature';

const PID = '12733';
const KEY = 'ZVowUMfuMead8r8m779y'; // FULL key (21 chars)
const BASE = 'https://mzf.mapay.cc/xpay/epay';

async function main() {
  console.log('KEY length:', KEY.length);
  const params: Record<string, string> = {
    pid: PID,
    type: 'alipay',
    out_trade_no: `fix_${Date.now()}`,
    notify_url: 'https://api.wan-wan.xyz/payment/notify',
    return_url: 'https://api.wan-wan.xyz',
    name: 'TEST',
    money: '0.01',
  };
  params.sign = signParams(params, KEY);
  params.sign_type = 'MD5';

  // A) full submit.php GET URL (user opens in browser)
  const urlA = `${BASE}/submit.php?${new URLSearchParams(params).toString()}`;
  console.log('A) submit.php URL:', urlA);
  const rA = await fetch(urlA, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    redirect: 'follow',
  });
  console.log('   status:', rA.status, '| final:', rA.url);
  const tA = await rA.text();
  console.log('   len:', tA.length, '| orderInfo:', tA.includes('orderInfo'), '| 404:', tA.includes('404') || tA.includes('未找到'));

  // B) POST then follow 302 (what our provider currently does)
  const rB = await fetch(`${BASE}/submit.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    redirect: 'manual',
  });
  const loc = rB.headers.get('location');
  console.log('B) POST status:', rB.status, '| location:', loc);
  if (loc) {
    const host = new URL(BASE).origin;
    const cashier = loc.startsWith('http') ? loc : `${host}${loc}`;
    const rC = await fetch(cashier, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
      redirect: 'follow',
    });
    const tC = await rC.text();
    console.log('   cashier status:', rC.status, '| len:', tC.length, '| orderInfo:', tC.includes('orderInfo'), '| 404:', tC.includes('404') || tC.includes('未找到'));
  }
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
