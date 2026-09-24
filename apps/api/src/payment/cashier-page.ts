/**
 * T2.10 — Self-hosted cashier page template (polished UI).
 *
 * Rendered by PaymentService.renderCashierPage. Kept in a SEPARATE file so
 * payment.service.ts stays free of provider-specific leakage (T2.8 G scan).
 *
 * SELECT-FIRST design + clean visual: gradient header, payment method cards,
 * large QR reveal, status chip, auto-polling, paid/awaiting states.
 */

export interface CashierPageData {
  orderId: string;
  status: string;
  amount: string;
  planName: string;
  /** Relative paths to the QR images served by the API. */
  qrPaths: { ali: string; wx: string };
  apiBase: string;
}

const PAID = 'PAID';
const AWAITING = 'AWAITING_CONFIRM';

export function renderCashierPageHtml(d: CashierPageData): string {
  const paid = d.status === PAID;
  const awaiting = d.status === AWAITING;
  const cancelled = d.status === 'CANCELLED' || d.status === 'EXPIRED';

  const statusText = paid
    ? '✅ 已支付，订阅已开通'
    : awaiting
      ? '⏳ 已提交，等待商家确认'
      : cancelled
        ? '❌ 订单已取消/过期'
        : '⏳ 等待支付';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>收银台 - ${d.planName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI',Roboto,sans-serif;background:linear-gradient(160deg,#eef4ff 0%,#f8fafc 40%,#f0fdf4 100%);min-height:100vh;display:flex;justify-content:center;padding:24px 16px}
  .wrap{width:100%;max-width:430px}
  .header{background:linear-gradient(135deg,#1677ff,#3b9bff);border-radius:20px;padding:24px 20px;color:#fff;text-align:center;box-shadow:0 8px 24px rgba(22,119,255,.25);position:relative;overflow:hidden}
  .header::after{content:'';position:absolute;top:-40px;right:-40px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.08)}
  .header::before{content:'';position:absolute;bottom:-50px;left:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.06)}
  .plan-name{font-size:14px;opacity:.85;letter-spacing:1px}
  .amount{font-size:44px;font-weight:800;margin-top:6px;letter-spacing:-1px;text-shadow:0 2px 8px rgba(0,0,0,.1)}
  .amount small{font-size:20px;font-weight:600;margin-right:2px}
  .card{background:#fff;border-radius:20px;box-shadow:0 4px 20px rgba(15,23,42,.06);padding:24px 20px;margin-top:16px}
  .section-title{font-size:14px;font-weight:600;color:#475569;margin-bottom:14px;display:flex;align-items:center;gap:6px}
  .section-title .dot{width:6px;height:6px;border-radius:50%;background:#1677ff;display:inline-block}
  .pay-options{display:flex;gap:12px}
  .pay-option{flex:1;border:2px solid #e2e8f0;border-radius:14px;padding:16px 10px;cursor:pointer;text-align:center;transition:all .18s;background:#fff}
  .pay-option:hover{border-color:#94a3b8}
  .pay-option.active{border-color:#1677ff;background:#f0f7ff;box-shadow:0 2px 12px rgba(22,119,255,.12)}
  .pay-option .icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:20px}
  .pay-option.ali .icon{background:#e8f4ff}
  .pay-option.wx .icon{background:#e6f9ee}
  .pay-option .name{font-size:14px;font-weight:600;color:#1e293b}
  .pay-option .sub{font-size:11px;color:#94a3b8;margin-top:2px}
  .qr-box{display:none;margin-top:16px;text-align:center;animation:fadeIn .25s ease}
  .qr-box.show{display:block}
  .qr-frame{display:inline-block;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:14px;box-shadow:0 2px 10px rgba(15,23,42,.05)}
  .qr-frame img{width:230px;height:230px;object-fit:contain;border-radius:10px;display:block}
  .qr-hint{font-size:13px;color:#475569;margin-top:12px;line-height:1.7}
  .qr-hint b{color:#1677ff}
  .amount-badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;margin-top:8px}
  .btn{display:block;width:100%;padding:15px;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#1677ff,#3b9bff);color:#fff;margin-top:18px;box-shadow:0 4px 14px rgba(22,119,255,.25);transition:all .15s}
  .btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(22,119,255,.3)}
  .btn:disabled{background:#cbd5e1;box-shadow:none;cursor:not-allowed;transform:none}
  .status{margin-top:14px;font-size:14px;font-weight:600;text-align:center}
  .status.pending{color:#b45309}
  .status.paid{color:#16a34a}
  .status.awaiting{color:#2563eb}
  .status.cancelled{color:#dc2626}
  .orderid{color:#94a3b8;font-size:11px;margin-top:16px;text-align:center;word-break:break-all}
  .footer{color:#cbd5e1;font-size:11px;text-align:center;margin-top:16px}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="plan-name">${d.planName} 套餐</div>
      <div class="amount"><small>¥</small>${d.amount}</div>
    </div>

    <div class="card">
      <div class="section-title"><span class="dot"></span>选择支付方式</div>
      <div class="pay-options">
        <div class="pay-option ali" id="opt-ali" onclick="selectPay('ali')">
          <div class="icon">支</div>
          <div class="name">支付宝</div>
          <div class="sub">推荐</div>
        </div>
        <div class="pay-option wx" id="opt-wx" onclick="selectPay('wx')">
          <div class="icon">微</div>
          <div class="name">微信</div>
          <div class="sub">WeChat</div>
        </div>
      </div>

      <div class="qr-box" id="qr-ali">
        <div class="qr-frame"><img src="${d.qrPaths.ali}" alt="支付宝收款码"></div>
        <div class="amount-badge">应付 ¥${d.amount}</div>
        <div class="qr-hint">打开<b>支付宝</b>扫一扫上方收款码<br>付款金额必须输入 <b style="color:#dc2626">¥${d.amount}</b>，分毫不差<br><span style="color:#dc2626">金额不符将无法开通</span></div>
      </div>
      <div class="qr-box" id="qr-wx">
        <div class="qr-frame"><img src="${d.qrPaths.wx}" alt="微信收款码"></div>
        <div class="amount-badge">应付 ¥${d.amount}</div>
        <div class="qr-hint">打开<b>微信</b>扫一扫上方收款码<br>付款金额必须输入 <b style="color:#dc2626">¥${d.amount}</b>，分毫不差<br><span style="color:#dc2626">金额不符将无法开通</span></div>
      </div>

      <button class="btn" id="payBtn" ${paid || awaiting || cancelled ? 'disabled' : ''}>✓ 我已付款</button>
      <div class="status ${paid ? 'paid' : awaiting ? 'awaiting' : cancelled ? 'cancelled' : 'pending'}" id="status">${statusText}</div>
      <div class="orderid">订单号：${d.orderId}</div>
    </div>
    <div class="footer">SmartCS · 安全收款</div>
  </div>
<script>
  var statusUrl = ${JSON.stringify(`${d.apiBase}/payment/cashier/${d.orderId}/status`)};
  var confirmUrl = ${JSON.stringify(`${d.apiBase}/payment/confirm-paid`)};
  var orderId = ${JSON.stringify(d.orderId)};
  var token = window.localStorage.getItem('token') || '';
  var current = null;

  function selectPay(ch){
    current = ch;
    document.getElementById('opt-ali').className = ch === 'ali' ? 'pay-option ali active' : 'pay-option ali';
    document.getElementById('opt-wx').className = ch === 'wx' ? 'pay-option wx active' : 'pay-option wx';
    document.getElementById('qr-ali').className = ch === 'ali' ? 'qr-box show' : 'qr-box';
    document.getElementById('qr-wx').className = ch === 'wx' ? 'qr-box show' : 'qr-box';
  }

  function setStatus(text, cls){
    var el = document.getElementById('status');
    el.textContent = text;
    el.className = 'status ' + (cls || 'pending');
  }

  function refresh(){
    try{
      var r = window.XMLHttpRequest ? new XMLHttpRequest() : null;
      if(!r) return;
      r.open('GET', statusUrl, true);
      r.onload = function(){
        var btn = document.getElementById('payBtn');
        var d2;
        try{ d2 = JSON.parse(r.responseText); }catch(e){ return; }
        if(d2.status === 'PAID'){ setStatus('✅ 已支付，订阅已开通','paid'); btn.disabled = true; }
        else if(d2.status === 'AWAITING_CONFIRM'){ setStatus('⏳ 已提交，等待商家确认','awaiting'); btn.disabled = true; }
        else if(d2.status === 'CANCELLED' || d2.status === 'EXPIRED'){ setStatus('❌ 订单已取消/过期','cancelled'); btn.disabled = true; }
      };
      r.send();
    }catch(e){}
  }
  document.getElementById('payBtn').onclick = function(){
    var btn = document.getElementById('payBtn');
    btn.disabled = true;
    btn.textContent = '提交中...';
    try{
      var r = new XMLHttpRequest();
      r.open('POST', confirmUrl, true);
      r.setRequestHeader('Content-Type', 'application/json');
      if(token){ r.setRequestHeader('Authorization', 'Bearer ' + token); }
      r.onload = function(){
        try{
          var d2 = JSON.parse(r.responseText);
          if(r.status >= 200 && r.status < 300 && (d2.status === 'AWAITING_CONFIRM' || d2.status === 'PAID')){
            btn.textContent = '已提交 ✅';
            setStatus('⏳ 已提交，等待商家确认','awaiting');
            refresh();
          } else {
            btn.textContent = d2.message || '提交失败，请重试';
            btn.disabled = false;
          }
        }catch(e){
          btn.textContent = '提交失败，请重试';
          btn.disabled = false;
        }
      };
      r.onerror = function(){ btn.textContent = '网络错误，请重试'; btn.disabled = false; };
      r.send(JSON.stringify({ orderId: orderId }));
    }catch(e){
      btn.textContent = '网络错误，请重试';
      btn.disabled = false;
    }
  };
  setInterval(refresh, 3000);
</script>
</body>
</html>`;
}

export function renderCashierErrorHtml(message: string): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>收银台</title></head><body style="font-family:sans-serif;text-align:center;padding-top:100px;color:#64748b"><h2>${message}</h2></body></html>`;
}
