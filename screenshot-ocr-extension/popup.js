/**
 * 一键截图OCR v2.0.0
 * 架构: Chrome扩展截图 → HTTP → 本地Python OCR服务 (localhost:8765)
 */

// ==================== 常量 ====================
var SERVER = 'http://127.0.0.1:8765';
var STORAGE_KEY = 'ocr_records';

// ==================== DOM 引用 ====================
var $captureBtn   = document.getElementById('capture-btn');
var $statusBar    = document.getElementById('status-bar');
var $serverStatus = document.getElementById('server-status');
var $list         = document.getElementById('list');
var $listCount    = document.getElementById('list-count');
var $exportBtn    = document.getElementById('export-btn');
var $clearBtn     = document.getElementById('clear-btn');

// ==================== 状态 ====================
var records = [];

// ==================== 工具函数 ====================
function showStatus(msg, type) {
  $statusBar.textContent = msg;
  $statusBar.className = 'status-bar ' + (type || 'info');
}
function hideStatus() {
  $statusBar.className = 'status-bar hidden';
}

// ==================== 服务连接检查 ====================
function checkServer() {
  fetch(SERVER + '/health')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.status === 'ok') {
        $serverStatus.textContent = '● 在線';
        $serverStatus.className = 'server-badge on';
        $captureBtn.disabled = false;
      } else {
        setOffline();
      }
    })
    .catch(function() {
      setOffline();
    });
}

function setOffline() {
  $serverStatus.textContent = '● 離線';
  $serverStatus.className = 'server-badge off';
  $captureBtn.disabled = true;
}

// ==================== 存储管理 ====================
function loadRecords() {
  chrome.storage.local.get([STORAGE_KEY], function(data) {
    records = data[STORAGE_KEY] || [];
    renderList();
  });
}

function saveRecords() {
  // 保持最多 50 条
  if (records.length > 50) {
    records = records.slice(-50);
  }
  chrome.storage.local.set({ ocr_records: records });
}

// ==================== 渲染列表 ====================
function renderList() {
  $listCount.textContent = records.length + ' 張截圖';
  $exportBtn.disabled = records.length === 0;

  if (records.length === 0) {
    $list.innerHTML = '<div class="empty-state">尚無截圖，點擊上方按鈕開始</div>';
    return;
  }

  var html = '';
  for (var i = records.length - 1; i >= 0; i--) {
    var r = records[i];
    var textHtml = '';
    if (r.text_clean) {
      textHtml = '<div class="capture-text">' + escapeHtml(r.text_clean) + '</div>';
    } else if (r.ocr_error) {
      textHtml = '<div class="capture-text" style="color:var(--danger)">⚠ ' + escapeHtml(r.ocr_error) + '</div>';
    } else {
      textHtml = '<div class="capture-text ocr-pending">⏳ 等待 OCR...</div>';
    }
    html +=
      '<div class="capture-item" data-id="' + r.id + '">' +
        '<div class="capture-info">' +
          '<span class="capture-time">' + r.time + '</span>' +
          '<span>' + escapeHtml(r.title || '').substring(0, 30) + '</span>' +
          '<button class="capture-del" data-id="' + r.id + '" title="刪除">✕</button>' +
        '</div>' +
        '<img class="capture-thumb" src="' + r.thumb + '" alt="截圖">' +
        textHtml +
      '</div>';
  }
  $list.innerHTML = html;

  // 绑定删除
  var dels = $list.querySelectorAll('.capture-del');
  for (var j = 0; j < dels.length; j++) {
    dels[j].addEventListener('click', function(e) {
      e.stopPropagation();
      deleteRecord(parseInt(this.getAttribute('data-id')));
    });
  }
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function deleteRecord(id) {
  records = records.filter(function(r) { return r.id !== id; });
  saveRecords();
  renderList();
}

// ==================== 截图 + OCR ====================
function doCapture() {
  if ($captureBtn.disabled) return;

  $captureBtn.disabled = true;
  showStatus('📷 截取屏幕中...', 'info');

  chrome.runtime.sendMessage({ type: 'capture' }, function(resp) {
    if (!resp || !resp.dataUrl) {
      showStatus('❌ 截圖失敗: ' + (resp ? resp.error : '無響應'), 'error');
      $captureBtn.disabled = false;
      return;
    }

    var dataUrl = resp.dataUrl;
    var id = Date.now();
    var now = new Date().toLocaleString('zh-TW', { hour12: false });

    // 先创建记录（含缩略图）
    var record = {
      id: id,
      time: now,
      url: resp.url || '',
      title: resp.title || '',
      thumb: dataUrl,
      text_raw: '',
      text_clean: '',
      ocr_error: ''
    };
    records.push(record);
    saveRecords();
    renderList();

    // 发送到本地 OCR 服务
    showStatus('🔍 OCR 識別中...', 'info');

    fetch(SERVER + '/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrl,
        url: resp.url || '',
        title: resp.title || ''
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok && data.record) {
        // 更新记录
        for (var i = 0; i < records.length; i++) {
          if (records[i].id === id) {
            records[i].text_raw = data.record.text_raw;
            records[i].text_clean = data.record.text_clean;
            break;
          }
        }
        saveRecords();
        renderList();
        hideStatus();
      } else {
        updateRecordError(id, data.error || '未知錯誤');
      }
      $captureBtn.disabled = false;
    })
    .catch(function(err) {
      console.error('OCR 請求失敗:', err);
      updateRecordError(id, '無法連接 OCR 服務，請確認已啟動 ocr_server.py');
      $captureBtn.disabled = false;
    });
  });
}

function updateRecordError(id, msg) {
  for (var i = 0; i < records.length; i++) {
    if (records[i].id === id) {
      records[i].ocr_error = msg;
      break;
    }
  }
  saveRecords();
  renderList();
  showStatus('⚠ ' + msg, 'error');
}

// ==================== CSV 导出 ====================
function exportCSV() {
  if (records.length === 0) return;

  // UTF-8 BOM + CSV
  var csv = '\uFEFF';
  csv += '序號,時間,頁面標題,頁面URL,識別文字(原始),識別文字(整理)\n';

  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    csv += [
      i + 1,
      csvCell(r.time),
      csvCell(r.title),
      csvCell(r.url),
      csvCell(r.text_raw),
      csvCell(r.text_clean)
    ].join(',') + '\n';
  }

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'OCR_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.csv';
  a.click();
  URL.revokeObjectURL(url);

  showStatus('✅ CSV 已下載', 'ok');
  setTimeout(hideStatus, 2000);
}

function csvCell(val) {
  if (!val) return '""';
  val = val.replace(/"/g, '""');
  return '"' + val + '"';
}

// ==================== 清空 ====================
function clearAll() {
  if (!confirm('確定要清空全部截圖記錄嗎？此操作不可撤銷。')) return;
  records = [];
  saveRecords();
  renderList();
  showStatus('🗑 已清空', 'ok');
  setTimeout(hideStatus, 1500);
}

// ==================== 事件绑定 ====================
$captureBtn.addEventListener('click', doCapture);
$exportBtn.addEventListener('click', exportCSV);
$clearBtn.addEventListener('click', clearAll);

// 快捷键 Ctrl+Enter
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    doCapture();
  }
});

// ==================== 初始化 ====================
loadRecords();
checkServer();

// 每 30 秒重新检查服务状态
setInterval(checkServer, 30000);
