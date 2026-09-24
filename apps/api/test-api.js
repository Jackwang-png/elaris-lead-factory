// 后端 API 全面测试脚本
const http = require('http');

function request(method, path, token) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 5000,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data.substring(0, 200) }));
    });
    req.on('error', (e) => resolve({ status: 'ERR', body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
    req.end();
  });
}

async function main() {
  // 1. 登录获取 token
  const loginResp = await new Promise((resolve) => {
    const body = JSON.stringify({ email: 'admin@smartcs.com', password: 'Admin@SmartCS2024!' });
    const req = http.request({
      hostname: 'localhost', port: 3000, path: '/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });

  if (!loginResp || !loginResp.accessToken) {
    console.log('LOGIN FAILED:', JSON.stringify(loginResp));
    return;
  }
  const token = loginResp.accessToken;
  console.log(`Login OK | role=${loginResp.user.role}\n`);

  // 2. 测试所有端点
  const endpoints = [
    ['GET', '/auth/profile',       'User Profile'],
    ['GET', '/admin/stats',        'Admin Stats'],
    ['GET', '/admin/tenants',      'Tenant List'],
    ['GET', '/admin/users',        'User List'],
    ['GET', '/admin/audit-logs',   'Audit Logs'],
    ['GET', '/bots',               'Bots List'],
    ['GET', '/customers',          'Customers List'],
    ['GET', '/conversations',      'Conversations List'],
    ['GET', '/knowledge',          'Knowledge List'],
    ['GET', '/leads',              'Leads List'],
    ['GET', '/subscription/current','Current Subscription'],
    ['GET', '/channel-stats',      'Channel Stats'],
    ['GET', '/sales-memories',     'Sales Memories'],
    ['GET', '/products',           'Products List'],
    ['GET', '/prompts',            'Prompts'],
    ['GET', '/ai-models',          'AI Models'],
    ['GET', '/notifications',      'Notifications'],
    ['GET', '/settings',           'System Settings'],
    ['GET', '/usage/today',        'Usage Today'],
    ['GET', '/chat/messages',      'Chat Messages'],
  ];

  let ok = 0, fail = 0;
  for (const [method, path, desc] of endpoints) {
    const res = await request(method, path, token);
    const status = res.status;
    const tag = status === 200 ? 'OK' : status === 201 ? 'OK'
      : status === 401 ? 'AUTH' : status === 403 ? 'FORBID'
      : status === 404 ? '404' : String(status).startsWith('5') ? '5xx'
      : '???';
    const mark = (status === 200 || status === 201) ? '✓' : '✗';
    console.log(`${mark} [${tag}] ${status} ${method} ${path}  — ${desc}`);
    if (status === 200 || status === 201) ok++; else fail++;
  }

  console.log(`\n=== RESULT: ${ok} OK / ${endpoints.length} total, ${fail} failed ===`);
}

main().catch(console.error);
