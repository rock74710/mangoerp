// ===== 設定區 =====
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID'; // ← 替換成你的 Google Sheets ID
const ORDER_SHEET = '訂單資料';
const TCAT_SHEET = '黑貓格式';
const PRODUCT_ITEMS = [
  { key: 'qty12A', name: '12A', price: 1300 },
  { key: 'qty15A', name: '15A', price: 1150 },
  { key: 'qty18A', name: '18A', price: 1050 },
  { key: 'qty20A', name: '20A', price: 950 },
  { key: 'qtyNG', name: 'NG', price: 700 }
];
const ORDER_HEADERS = [
  '訂單編號', '時間戳', '訂購人姓名', '訂購人手機',
  '收件人姓名', '收件人手機', '收件人地址',
  '12A數量', '15A數量', '18A數量', '20A數量', 'NG數量',
  '總金額', '備註', '狀態'
];

// ===== 【第一次使用必跑】初始化整個 Sheets 結構 =====
function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // --- 建立 Sheet1：訂單資料 ---
  let orderSheet = ss.getSheetByName(ORDER_SHEET);
  if (!orderSheet) {
    orderSheet = ss.insertSheet(ORDER_SHEET);
  }
  ensureOrderSheetSchema(orderSheet);

  // --- 建立 Sheet2：黑貓格式 ---
  let tcatSheet = ss.getSheetByName(TCAT_SHEET);
  if (!tcatSheet) {
    tcatSheet = ss.insertSheet(TCAT_SHEET);
  }

  // 清除舊內容並重設
  tcatSheet.clearContents();

  // 黑貓宅急便批次匯入標頭（依統一速達官方格式）
  const tcatHeaders = [
    '收件人', '收件人手機', '收件人地址', '品名', '數量', '寄件人備註', '訂單編號'
  ];
  tcatSheet.getRange(1, 1, 1, tcatHeaders.length).setValues([tcatHeaders]);

  // 黑貓標頭樣式
  tcatSheet.getRange(1, 1, 1, tcatHeaders.length)
           .setBackground('#333333')
           .setFontColor('#FFFFFF')
           .setFontWeight('bold');
  tcatSheet.setFrozenRows(1);

  Logger.log('✅ 初始化完成！Sheet1「訂單資料」與 Sheet2「黑貓格式」已建立。');
}

function ensureOrderSheetSchema(orderSheet) {
  if (orderSheet.getLastRow() === 0) {
    orderSheet.appendRow(ORDER_HEADERS);
  } else {
    orderSheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
  }

  // 標頭樣式
  const headerRange = orderSheet.getRange(1, 1, 1, ORDER_HEADERS.length);
  headerRange.setBackground('#F5A623')
             .setFontColor('#FFFFFF')
             .setFontWeight('bold')
             .setHorizontalAlignment('center');
  orderSheet.setFrozenRows(1);

  // 欄寬設定
  orderSheet.setColumnWidth(1, 130);   // 訂單編號
  orderSheet.setColumnWidth(2, 150);   // 時間戳
  orderSheet.setColumnWidth(7, 250);   // 收件地址
  orderSheet.setColumnWidth(13, 120);  // 總金額

  // 設定手機欄位為純文字，防止首位 0 被去掉
  orderSheet.getRange('D:D').setNumberFormat('@'); // 訂購人手機
  orderSheet.getRange('F:F').setNumberFormat('@'); // 收件人手機
}

// ===== 重新整理黑貓格式 Sheet（手動觸發）=====
function refreshTcatSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orderSheet = ss.getSheetByName(ORDER_SHEET);
  const tcatSheet = ss.getSheetByName(TCAT_SHEET);

  const lastRow = orderSheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('目前沒有訂單資料');
    return;
  }

  // 清除舊資料（保留標頭）
  if (tcatSheet.getLastRow() > 1) {
    tcatSheet.getRange(2, 1, tcatSheet.getLastRow() - 1, 7).clearContent();
  }

  // 讀取所有訂單
  const orders = orderSheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues();
  const tcatRows = [];

  orders.forEach(row => {
    const order = mapOrderRow(row);
    PRODUCT_ITEMS.forEach(item => {
      const qty = Number(order[item.key]) || 0;
      if (qty > 0) {
        tcatRows.push([
          order.recipientName,
          order.recipientPhone,
          order.recipientAddress,
          item.name,
          qty,
          order.notes,
          order.orderId
        ]);
      }
    });
  });

  if (tcatRows.length > 0) {
    tcatSheet.getRange(2, 1, tcatRows.length, 7).setValues(tcatRows);
  }

  Logger.log(`✅ 黑貓格式已更新，共 ${tcatRows.length} 筆出貨記錄`);
}

// ===== 自訂選單 =====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🥭 芒果 ERP')
    .addItem('初始化（第一次使用）', 'setup')
    .addItem('重新整理黑貓格式', 'refreshTcatSheet')
    .addToUi();
}

// ===== 接收訂單（前端 POST 過來）=====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const orderId = generateOrderId();
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');

    writeOrder(orderId, timestamp, data);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, orderId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== 後台 API：回傳訂單列表（admin.html 用）=====
function doGet(e) {
  const action = e.parameter.action || 'list';

  if (action === 'list') {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(ORDER_SHEET);
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return jsonResponse({ orders: [], total: 0 });
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues();
    const orders = rows.map(mapOrderRow).reverse(); // 最新在最上面

    return jsonResponse({ orders, total: orders.length });
  }

  return jsonResponse({ error: 'unknown action' });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 訂單編號產生 =====
function generateOrderId() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ORDER_SHEET);
  const lastRow = Math.max(sheet.getLastRow(), 1); // 排除標頭
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  const seq = String(lastRow).padStart(3, '0');
  return `${today}-${seq}`;
}

// ===== 寫入訂單資料 =====
function writeOrder(orderId, timestamp, data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ORDER_SHEET);
  ensureOrderSheetSchema(sheet);

  // 必須在 appendRow 之前設定，否則數字會先被寫入再格式化（首位 0 已丟失）
  sheet.getRange('D:D').setNumberFormat('@'); // 訂購人手機
  sheet.getRange('F:F').setNumberFormat('@'); // 收件人手機

  const qty12A = Number(data.qty12A) || 0;
  const qty15A = Number(data.qty15A) || 0;
  const qty18A = Number(data.qty18A) || 0;
  const qty20A = Number(data.qty20A) || 0;
  const qtyNG = Number(data.qtyNG) || 0;
  const totalAmount = calculateTotalAmount({ qty12A, qty15A, qty18A, qty20A, qtyNG });

  sheet.appendRow([
    orderId,
    timestamp,
    data.buyerName || '',
    data.buyerPhone || '',
    data.recipientName || '',
    data.recipientPhone || '',
    data.recipientAddress || '',
    qty12A,
    qty15A,
    qty18A,
    qty20A,
    qtyNG,
    totalAmount,
    data.notes || '',
    '待處理'
  ]);
}

function calculateTotalAmount(data) {
  return PRODUCT_ITEMS.reduce((sum, item) => {
    return sum + (Number(data[item.key]) || 0) * item.price;
  }, 0);
}

function mapOrderRow(row) {
  return {
    orderId: row[0],
    timestamp: row[1],
    buyerName: row[2],
    buyerPhone: row[3],
    recipientName: row[4],
    recipientPhone: row[5],
    recipientAddress: row[6],
    qty12A: Number(row[7]) || 0,
    qty15A: Number(row[8]) || 0,
    qty18A: Number(row[9]) || 0,
    qty20A: Number(row[10]) || 0,
    qtyNG: Number(row[11]) || 0,
    totalAmount: Number(row[12]) || 0,
    notes: row[13] || '',
    status: row[14] || '待處理'
  };
}
