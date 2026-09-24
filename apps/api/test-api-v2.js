// 后端 API 全面测试脚本 v2（包含新增端点）
const http = require('http');

function request(method, path, token, body) {
  return new Promise((resolve) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) { headers['Content-Type'] = 'application/json'; }
    const options = {
      hostname: 'localhost', port: 3000, path, method, headers, timeout: 8000,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 'ERR', body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login(email, password) {
  return request('POST', '/auth/login', null, { email, password });
}

async function main() {
  // 用商家账号登录
  const loginResp = await login('merchant_test_001@example.com', 'TestMerchant2024!');
  const loginObj = JSON.parse(loginResp.body);
  if (!loginObj.accessToken) {
    console.log('LOGIN FAILED:', loginResp.body);
    return;
  }
  const token = loginObj.accessToken;
  console.log(`Merchant login OK | role=${loginObj.user.role}\n`);

  const endpoints = [
    ['GET', '/bots',                 'Bots List'],
    ['GET', '/customers',            'Customers List'],
    ['GET', '/conversations',        'Conversations List'],
    ['GET', '/knowledge',            'Knowledge List'],
    ['GET', '/leads',                'Leads List'],
    ['GET', '/subscription/current', 'Current Subscription'],
    ['GET', '/subscription/plans',   'Subscription Plans'],
    ['GET', '/usage/daily',          'Daily Usage'],
    ['GET', '/audit',                'Audit Logs'],
    // 新增端点
    ['GET', '/dashboard/stats',              'Dashboard Stats'],
    ['GET', '/dashboard/conversion-data',    'Conversion Data'],
    ['GET', '/dashboard/conversation-data',  'Conversation Trend'],
    ['GET', '/dashboard/lead-sources',       'Lead Sources'],
    ['GET', '/dashboard/agents/status',      'Agent Status'],
    ['GET', '/settings',                     'System Settings'],
    ['GET', '/notifications',                'Notifications List'],
    ['GET', '/notifications/unread-count',   'Unread Count'],
    ['GET', '/products',                     'Products List'],
    ['POST', '/ai/chat',                     'AI Chat'],
  ];

  let ok = 0, fail = 0;
  for (const [method, path, desc] of endpoints) {
    const body = method === 'POST' && path === '/ai/chat'
      ? { message: 'hello', conversationId: 'test' } : null;
    const res = await request(method, path, token, body);
    const status = res.status;
    const mark = (status === 200 || status === 201) ? '✓' : '✗';
    const tag = status === 200 ? 'OK' : status === 201 ? 'OK'
      : String(status).startsWith('4') ? `${status}` : String(status).startsWith('5') ? `${status}` : 'ERR';
    console.log(`${mark} [${tag}] ${status} ${method.padEnd(5)} ${path.padEnd(40)} ${desc}`);
    if (status === 200 || status === 201) ok++; else fail++;
  }

  console.log(`\n=== RESULT: ${ok} OK / ${endpoints.length} total, ${fail} failed ===`);

  // 显示新端点的响应内容
  console.log('\n=== 新增端点响应内容 ===');
  const newEndpoints = [
    ['/dashboard/stats', 'Dashboard Stats'],
    ['/dashboard/conversion-data', 'Conversion Data'],
    ['/dashboard/conversation-data', 'Conversation Trend'],
    ['/dashboard/lead-sources', 'Lead Sources'],
    ['/dashboard/agents/status', 'Agent Status'],
    ['/settings', 'System Settings'],
    ['/notifications', 'Notifications'],
  ];
  for (const [path, desc] of newEndpoints) {
    const res = await request('GET', path, token);
    console.log(`\n${desc} (${res.status}):`);
    console.log(res.body.substring(0, 300));
  }
}

main().catch(console.error);
