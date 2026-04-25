// Apps Script 部署後請替換這個 URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzoTvbFiqTpkzjFkoKpeTP3KYpZcE_HeLS3CPHrhrpS0PP5tcutDXjp1X_L84XWAvBu/exec';

// ===== 工具函式 =====

function $(id) { return document.getElementById(id); }

function showError(fieldId, msg) {
  const input = $(fieldId);
  const errEl = $(`${fieldId}-err`);
  if (input) input.classList.add('error');
  if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
}

function clearError(fieldId) {
  const input = $(fieldId);
  const errEl = $(`${fieldId}-err`);
  if (input) input.classList.remove('error');
  if (errEl) errEl.classList.remove('show');
}

function validatePhone(phone) {
  return /^09\d{8}$/.test(phone.replace(/[-\s]/g, ''));
}

// ===== 表單頁（index.html）=====

function initFormPage() {
  const form = $('order-form');
  if (!form) return;

  // 若有暫存資料（返回修改），還原填寫內容
  const saved = sessionStorage.getItem('orderData');
  if (saved) {
    const data = JSON.parse(saved);
    const fields = ['buyerName','buyerPhone','recipientName','recipientPhone','recipientAddress','qty12A','qty20A','notes'];
    fields.forEach(key => {
      const el = $(key);
      if (el && data[key] !== undefined) el.value = data[key];
    });
  }

  // 即時清除錯誤
  ['buyerName','buyerPhone','recipientName','recipientPhone','recipientAddress'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => clearError(id));
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm()) return;

    const data = collectFormData();
    sessionStorage.setItem('orderData', JSON.stringify(data));
    window.location.href = 'confirm.html';
  });
}

function validateForm() {
  let valid = true;

  // 訂購人姓名（必填）
  const buyerName = $('buyerName').value.trim();
  if (!buyerName) {
    showError('buyerName', '請填寫訂購人姓名');
    valid = false;
  } else clearError('buyerName');

  // 訂購人電話（必填）
  const buyerPhone = $('buyerPhone').value.trim();
  if (!buyerPhone) {
    showError('buyerPhone', '請填寫訂購人電話');
    valid = false;
  } else if (!validatePhone(buyerPhone)) {
    showError('buyerPhone', '電話格式不正確（例：0912345678）');
    valid = false;
  } else clearError('buyerPhone');

  // 收件人姓名（必填）
  const recipientName = $('recipientName').value.trim();
  if (!recipientName) {
    showError('recipientName', '請填寫收件人姓名');
    valid = false;
  } else clearError('recipientName');

  // 收件人電話（必填）
  const recipientPhone = $('recipientPhone').value.trim();
  if (!recipientPhone) {
    showError('recipientPhone', '請填寫收件人電話');
    valid = false;
  } else if (!validatePhone(recipientPhone)) {
    showError('recipientPhone', '電話格式不正確（例：0912345678）');
    valid = false;
  } else clearError('recipientPhone');

  // 收件人地址（必填）
  const address = $('recipientAddress').value.trim();
  if (!address) {
    showError('recipientAddress', '請填寫收件地址');
    valid = false;
  } else clearError('recipientAddress');

  // 至少選一種芒果
  const qty12A = Number($('qty12A').value) || 0;
  const qty20A = Number($('qty20A').value) || 0;
  if (qty12A === 0 && qty20A === 0) {
    showError('qty12A', '請至少訂購一種芒果');
    valid = false;
  } else clearError('qty12A');

  if (!valid) {
    // 捲動到第一個錯誤欄位
    const firstErr = document.querySelector('.field input.error, .field textarea.error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return valid;
}

function collectFormData() {
  return {
    buyerName: $('buyerName').value.trim(),
    buyerPhone: $('buyerPhone').value.trim(),
    recipientName: $('recipientName').value.trim(),
    recipientPhone: $('recipientPhone').value.trim(),
    recipientAddress: $('recipientAddress').value.trim(),
    qty12A: Number($('qty12A').value) || 0,
    qty20A: Number($('qty20A').value) || 0,
    notes: $('notes').value.trim()
  };
}

// ===== 確認頁（confirm.html）=====

function initConfirmPage() {
  const container = $('summary-container');
  if (!container) return;

  const saved = sessionStorage.getItem('orderData');
  if (!saved) {
    window.location.href = 'index.html';
    return;
  }

  const data = JSON.parse(saved);
  renderSummary(data);

  $('btn-back').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  $('btn-confirm').addEventListener('click', () => submitOrder(data));
}

function renderSummary(data) {
  const rows = [
    ['訂購人姓名', data.buyerName || '（未填寫）'],
    ['訂購人電話', data.buyerPhone || '（未填寫）'],
    ['收件人姓名', data.recipientName],
    ['收件人電話', data.recipientPhone],
    ['收件人地址', data.recipientAddress],
    ['備註', data.notes || '（無）'],
  ];

  const infoHTML = rows.map(([label, val]) => `
    <div class="summary-row">
      <span class="summary-label">${label}</span>
      <span class="summary-value">${val}</span>
    </div>
  `).join('');

  $('summary-info').innerHTML = infoHTML;
  $('qty12A-display').textContent = data.qty12A;
  $('qty20A-display').textContent = data.qty20A;
}

async function submitOrder(data) {
  const btn = $('btn-confirm');
  const alert = $('alert-error');

  btn.classList.add('loading');
  btn.disabled = true;
  alert.classList.remove('show');

  try {
    // Apps Script doPost 需要特殊處理 CORS：使用 no-cors 模式
    // no-cors 下無法讀取 response，所以改用帶 redirect 的方式
    // 若 Apps Script 設定允許，可改用標準 fetch
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    // no-cors 模式下拿不到 response，視為成功
    // 產生本地訂單編號作為顯示用（實際編號由 Apps Script 產生並存入 Sheets）
    const localOrderId = generateLocalOrderId();
    sessionStorage.setItem('orderId', localOrderId);
    sessionStorage.removeItem('orderData');
    window.location.href = 'success.html';

  } catch (err) {
    alert.textContent = '送出失敗，請檢查網路後重試。';
    alert.classList.add('show');
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function generateLocalOrderId() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${date}-${time}`;
}

// ===== 成功頁（success.html）=====

function initSuccessPage() {
  const orderId = sessionStorage.getItem('orderId');
  const el = $('order-id-value');
  if (el) el.textContent = orderId || '已送出';

  const btn = $('btn-new-order');
  if (btn) btn.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = 'index.html';
  });
}

// ===== 路由初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'form') initFormPage();
  else if (page === 'confirm') initConfirmPage();
  else if (page === 'success') initSuccessPage();
});
