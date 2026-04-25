// Apps Script 部署後請替換這個 URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzoTvbFiqTpkzjFkoKpeTP3KYpZcE_HeLS3CPHrhrpS0PP5tcutDXjp1X_L84XWAvBu/exec';

// ===== 工具函式 =====

function $(id) { return document.getElementById(id); }
const QTY_FIELDS = ['qty12A', 'qty15A', 'qty18A', 'qty20A', 'qtyNG'];
const PRODUCT_CONFIG = [
  { key: 'qty12A', name: '12A', price: 1200 },
  { key: 'qty15A', name: '15A', price: 1050 },
  { key: 'qty18A', name: '18A', price: 950 },
  { key: 'qty20A', name: '20A', price: 850 },
  { key: 'qtyNG', name: 'NG', price: 700 }
];

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

function normalizeMobileInput(fieldId) {
  const el = $(fieldId);
  if (!el) return;
  el.addEventListener('input', () => {
    const value = el.value.replace(/\D/g, '').slice(0, 10);
    el.value = value;
  });
}

// ===== 地址下拉輔助函式 =====

function updateDistrictDropdown() {
  const county = $('recipientCounty').value;
  const el = $('recipientDistrict');
  el.innerHTML = '<option value="">請選擇區/市</option>';
  $('recipientPostcode').value = '';
  if (!county) { el.disabled = true; return; }
  el.disabled = false;
  Object.keys(TAIWAN_DISTRICTS[county]).forEach(dist => {
    el.appendChild(Object.assign(document.createElement('option'), { value: dist, textContent: dist }));
  });
}

function updatePostcode() {
  const c = $('recipientCounty').value;
  const d = $('recipientDistrict').value;
  $('recipientPostcode').value = (c && d && TAIWAN_DISTRICTS[c]) ? (TAIWAN_DISTRICTS[c][d] || '') : '';
}

// ===== 表單頁（index.html）=====

function initFormPage() {
  const form = $('order-form');
  if (!form) return;

  // 初始化縣市下拉
  const countyEl = $('recipientCounty');
  Object.keys(TAIWAN_DISTRICTS).forEach(county => {
    countyEl.appendChild(Object.assign(document.createElement('option'), { value: county, textContent: county }));
  });
  countyEl.addEventListener('change', () => { updateDistrictDropdown(); clearError('recipientAddress'); });
  $('recipientDistrict').addEventListener('change', () => { updatePostcode(); clearError('recipientAddress'); });
  $('recipientDetail').addEventListener('input', () => clearError('recipientAddress'));

  // 若有暫存資料（返回修改），還原填寫內容
  const saved = sessionStorage.getItem('orderData');
  if (saved) {
    const data = JSON.parse(saved);
    const fields = ['buyerName','buyerPhone','recipientName','recipientPhone', ...QTY_FIELDS, 'notes'];
    fields.forEach(key => {
      const el = $(key);
      if (el && data[key] !== undefined) el.value = data[key];
    });
    // 還原地址三段
    if (data.recipientCounty) {
      countyEl.value = data.recipientCounty;
      updateDistrictDropdown();
      if (data.recipientDistrict) {
        $('recipientDistrict').value = data.recipientDistrict;
        updatePostcode();
      }
    }
    if (data.recipientDetail) $('recipientDetail').value = data.recipientDetail;
  }

  // 即時清除錯誤
  ['buyerName','buyerPhone','recipientName','recipientPhone'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => clearError(id));
  });
  normalizeMobileInput('buyerPhone');
  normalizeMobileInput('recipientPhone');

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

  // 訂購人手機（必填）
  const buyerPhone = $('buyerPhone').value.trim();
  if (!buyerPhone) {
    showError('buyerPhone', '請填寫訂購人手機');
    valid = false;
  } else if (!validatePhone(buyerPhone)) {
    showError('buyerPhone', '手機格式不正確（需 09 開頭且 10 碼）');
    valid = false;
  } else clearError('buyerPhone');

  // 收件人姓名（必填）
  const recipientName = $('recipientName').value.trim();
  if (!recipientName) {
    showError('recipientName', '請填寫收件人姓名');
    valid = false;
  } else clearError('recipientName');

  // 收件人手機（必填）
  const recipientPhone = $('recipientPhone').value.trim();
  if (!recipientPhone) {
    showError('recipientPhone', '請填寫收件人手機');
    valid = false;
  } else if (!validatePhone(recipientPhone)) {
    showError('recipientPhone', '手機格式不正確（需 09 開頭且 10 碼）');
    valid = false;
  } else clearError('recipientPhone');

  // 收件地址（縣市 + 區 + 詳細地址，三者皆必填）
  const county = $('recipientCounty').value;
  const district = $('recipientDistrict').value;
  const detail = $('recipientDetail').value.trim();
  if (!county || !district || !detail) {
    showError('recipientAddress', '請選擇縣市／區，並填寫詳細地址');
    if (!county) $('recipientCounty').classList.add('error');
    else if (!district) $('recipientDistrict').classList.add('error');
    valid = false;
  } else {
    clearError('recipientAddress');
    $('recipientCounty').classList.remove('error');
    $('recipientDistrict').classList.remove('error');
  }

  // 至少選一種芒果
  const qtyValues = QTY_FIELDS.map(id => Number($(id).value) || 0);
  const hasOrder = qtyValues.some(value => value > 0);
  if (!hasOrder) {
    showError('qty12A', '請至少訂購一種芒果');
    valid = false;
  } else clearError('qty12A');

  const overLimit = qtyValues.some(value => value > 20);
  if (overLimit) {
    showError('qty12A', '每個品項單次最多 20 箱');
    valid = false;
  }

  if (!valid) {
    // 捲動到第一個錯誤欄位
    const firstErr = document.querySelector('.field input.error, .field textarea.error, .field select.error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return valid;
}

function collectFormData() {
  const county = $('recipientCounty').value;
  const district = $('recipientDistrict').value;
  const postcode = $('recipientPostcode').value;
  const detail = $('recipientDetail').value.trim();
  return {
    buyerName: $('buyerName').value.trim(),
    buyerPhone: $('buyerPhone').value.trim(),
    recipientName: $('recipientName').value.trim(),
    recipientPhone: $('recipientPhone').value.trim(),
    recipientAddress: [postcode, county + district, detail].filter(Boolean).join(' '),
    recipientCounty: county,
    recipientDistrict: district,
    recipientPostcode: postcode,
    recipientDetail: detail,
    qty12A: Number($('qty12A').value) || 0,
    qty15A: Number($('qty15A').value) || 0,
    qty20A: Number($('qty20A').value) || 0,
    qty18A: Number($('qty18A').value) || 0,
    qtyNG: Number($('qtyNG').value) || 0,
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
    ['訂購人手機', data.buyerPhone || '（未填寫）'],
    ['收件人姓名', data.recipientName],
    ['收件人手機', data.recipientPhone],
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
  $('qty15A-display').textContent = data.qty15A || 0;
  $('qty20A-display').textContent = data.qty20A;
  $('qty18A-display').textContent = data.qty18A || 0;
  $('qtyNG-display').textContent = data.qtyNG || 0;

  renderAmountSummary(data);
}

function renderAmountSummary(data) {
  const container = $('summary-amount');
  if (!container) return;

  let total = 0;
  const rows = PRODUCT_CONFIG.map(product => {
    const qty = Number(data[product.key]) || 0;
    const subtotal = qty * product.price;
    total += subtotal;
    return `
      <div class="amount-row">
        <span class="amount-label">${product.name}（${qty}箱 × ${product.price.toLocaleString()} 元）</span>
        <span class="amount-value">${subtotal.toLocaleString()} 元</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="amount-box">
      ${rows}
      <div class="amount-row amount-total">
        <span class="amount-label">總金額</span>
        <span class="amount-value">${total.toLocaleString()} 元</span>
      </div>
    </div>
  `;
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
