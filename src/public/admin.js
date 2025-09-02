let currentPassword = '';
let participantsData = []; // 存儲參與者資料用於預覽

function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    alertContainer.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

function getAuthHeaders() {
    const password = document.getElementById('adminPassword').value || currentPassword;
    if (!password) {
        showAlert('請先輸入管理員密碼', 'error');
        return null;
    }
    currentPassword = password;
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${password}`
    };
}

async function verifySmtp() {
    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch('/admin/verify-smtp', {
            method: 'POST',
            headers
        });

        const result = await response.json();
        
        if (response.ok && result.success) {
            showAlert('SMTP 設定驗證成功！', 'success');
        } else {
            showAlert(`SMTP 驗證失敗: ${result.error || result.message}`, 'error');
        }
    } catch (error) {
        showAlert(`SMTP 驗證錯誤: ${error.message}`, 'error');
    }
}

async function loadStats() {
    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const eventId = document.getElementById('eventId').value;
        const url = eventId ? `/admin/stats?eventId=${encodeURIComponent(eventId)}` : '/admin/stats';
        const response = await fetch(url, { headers });
        const stats = await response.json();

        if (response.ok) {
            document.getElementById('totalParticipants').textContent = stats.totalParticipants;
            document.getElementById('totalCheckins').textContent = stats.totalCheckins;
            document.getElementById('todayCheckins').textContent = stats.todayCheckins;
            document.getElementById('checkInRate').textContent = stats.checkInRate;
        } else {
            showAlert(`獲取統計資料失敗: ${stats.error}`, 'error');
        }
    } catch (error) {
        showAlert(`獲取統計資料錯誤: ${error.message}`, 'error');
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('dragover');
}

function handleFileDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.name.toLowerCase().endsWith('.csv')) {
            showSelectedCSVFile(file);
            uploadCSVFile(file);
        } else {
            showAlert('請選擇 CSV 檔案', 'error');
        }
    }
}

function uploadCSV(event) {
    const file = event.target.files[0];
    if (file) {
        // 顯示已選擇的檔案名稱
        showSelectedCSVFile(file);
        uploadCSVFile(file);
    }
}

// 顯示已選擇的 CSV 檔案資訊
function showSelectedCSVFile(file) {
    const csvFileText = document.getElementById('csvFileText');
    const csvFileStatus = document.getElementById('csvFileStatus');
    const csvFileName = document.getElementById('csvFileName');
    
    csvFileText.textContent = '📁 檔案已選擇，點擊可重新選擇';
    csvFileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    csvFileStatus.style.display = 'block';
}

async function uploadCSVFile(file) {
    // 檢查是否為離線模式（直接開啟 HTML 檔案）
    if (location.protocol === 'file:') {
        processCSVOffline(file);
        return;
    }

    const headers = getAuthHeaders();
    if (!headers) return;

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
        const response = await fetch('/admin/upload-csv', {
            method: 'POST',
            headers: {
                'Authorization': headers.Authorization
            },
            body: formData
        });

        const result = await response.json();
        console.log('CSV upload response:', result); // 調試用

        if (response.ok) {
            showAlert(`CSV 上傳成功！共 ${result.total} 筆記錄`, 'success');
            displayCSVPreview(result);
            
            if (result.duplicates && result.duplicates.length > 0) {
                showAlert(`發現重複的 Email: ${result.duplicates.length} 筆`, 'info');
            }
            
            loadStats();
        } else {
            showAlert(`CSV 上傳失敗: ${result.error}`, 'error');
            if (result.details && result.details.length > 0) {
                console.error('詳細錯誤:', result.details);
            }
        }
    } catch (error) {
        showAlert(`連接服務器失敗，嘗試離線處理: ${error.message}`, 'warning');
        processCSVOffline(file);
    }
}

// 離線處理 CSV 檔案
function processCSVOffline(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const csvContent = e.target.result;
        const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
        
        if (lines.length < 2) {
            showAlert('CSV 檔案格式錯誤：需要至少包含標題行和一筆資料', 'error');
            return;
        }
        
        // 解析標題行
        const headers = lines[0].split(',').map(header => header.trim().replace(/"/g, ''));
        
        // 檢查必要欄位
        if (!headers.includes('name') || !headers.includes('email')) {
            showAlert('CSV 檔案必須包含 "name" 和 "email" 欄位', 'error');
            return;
        }
        
        // 解析資料行
        const records = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(value => value.trim().replace(/"/g, ''));
            if (values.length >= headers.length) {
                const record = {};
                headers.forEach((header, index) => {
                    record[header] = values[index] || '';
                });
                
                // 檢查必要欄位
                if (record.name && record.email) {
                    records.push(record);
                }
            }
        }
        
        if (records.length === 0) {
            showAlert('CSV 檔案中沒有有效的參與者記錄', 'error');
            return;
        }
        
        // 模擬服務器回應格式
        const result = {
            total: records.length,
            preview: records.slice(0, 20), // 取前20筆作為預覽
            columns: headers,
            duplicates: []
        };
        
        showAlert(`CSV 處理成功！共 ${result.total} 筆記錄 (離線模式)`, 'success');
        displayCSVPreview(result);
        
        // 儲存完整資料用於預覽（離線模式儲存所有資料）
        participantsData = records;
    };
    
    reader.onerror = function() {
        showAlert('讀取 CSV 檔案時發生錯誤', 'error');
    };
    
    reader.readAsText(file);
}

function displayCSVPreview(result) {
    console.log('displayCSVPreview called with:', result); // 調試用
    const previewDiv = document.getElementById('csvPreview');
    const statsP = document.getElementById('csvStats');
    const headerThead = document.getElementById('previewHeader');
    const bodyTbody = document.getElementById('previewBody');

    statsP.textContent = `共 ${result.total} 筆記錄，預覽前 20 筆`;

    headerThead.innerHTML = '';
    bodyTbody.innerHTML = '';

    if (result.preview && result.preview.length > 0) {
        const headerRow = document.createElement('tr');
        result.columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headerRow.appendChild(th);
        });
        headerThead.appendChild(headerRow);

        result.preview.forEach(record => {
            const row = document.createElement('tr');
            result.columns.forEach(col => {
                const td = document.createElement('td');
                td.textContent = record[col] || '';
                row.appendChild(td);
            });
            bodyTbody.appendChild(row);
        });

        previewDiv.classList.remove('hidden');
        
        // 存儲參與者資料供預覽使用
        participantsData = result.preview || [];
        
        // 如果是線上模式且有更多資料，給予提示
        if (result.total > result.preview.length && location.protocol !== 'file:') {
            showAlert(`注意：目前預覽功能僅支援前 ${result.preview.length} 位參與者，共有 ${result.total} 位參與者`, 'info');
        }
        
        // 更新預覽功能的參與者選擇器
        updateParticipantSelector();
    }
}

// 更新參與者選擇器
function updateParticipantSelector() {
    console.log('updateParticipantSelector called, participantsData:', participantsData); // 調試用
    const selector = document.getElementById('participantSelector');
    const previewAllBtn = document.getElementById('previewAllBtn');
    
    // 清空現有選項
    selector.innerHTML = '<option value="">選擇參與者進行預覽</option>';
    
    if (participantsData && participantsData.length > 0) {
        participantsData.forEach((participant, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${participant.name || '未命名'} (${participant.email || '無Email'})`;
            selector.appendChild(option);
        });
        
        // 顯示批次預覽按鈕
        previewAllBtn.style.display = 'inline-block';
        
        showAlert(`已載入 ${participantsData.length} 位參與者，可開始預覽`, 'info');
    } else {
        // 隱藏批次預覽按鈕
        previewAllBtn.style.display = 'none';
    }
}

// 當選擇參與者時更新預覽資料
let selectedParticipant = null;
function updatePreviewData() {
    const selector = document.getElementById('participantSelector');
    const selectedIndex = selector.value;
    
    if (selectedIndex !== '' && participantsData[selectedIndex]) {
        selectedParticipant = participantsData[selectedIndex];
        showAlert(`已選擇：${selectedParticipant.name} 進行預覽`, 'success');
    } else {
        selectedParticipant = null;
    }
}

async function sendBatchEmails() {
    const headers = getAuthHeaders();
    if (!headers) return;

    const eventId = document.getElementById('eventId').value;
    const eventName = document.getElementById('eventName').value;
    const eventDate = document.getElementById('eventDate').value;
    const eventLocation = document.getElementById('eventLocation').value;
    const meetLocation = document.getElementById('meetLocation').value;
    const secondRun = document.getElementById('secondRun').value;
    const subject = document.getElementById('emailSubject').value;
    const from = document.getElementById('fromEmail').value;
    const testMode = document.getElementById('testMode').checked;
    const attachPng = document.getElementById('attachPng').checked;
    const customTemplate = document.getElementById('emailTemplate').value;

    if (!eventId || !eventName || !subject) {
        showAlert('請填寫活動ID、活動名稱和信件主旨', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('eventId', eventId);
    formData.append('eventName', eventName);
    formData.append('eventDate', eventDate || '');
    formData.append('eventLocation', eventLocation || '');
    formData.append('meetLocation', meetLocation || '');
    formData.append('secondRun', secondRun || '');
    formData.append('subject', subject);
    formData.append('from', from || '');
    formData.append('testMode', testMode);
    formData.append('attachPng', attachPng);
    
    if (customTemplate && customTemplate.trim()) {
        formData.append('customTemplate', customTemplate);
    }
    
    // 添加附件檔案
    attachmentFiles.forEach((file, index) => {
        formData.append(`attachment_${index}`, file);
    });

    const progressDiv = document.getElementById('sendProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const sendButton = document.querySelector('button[onclick="sendBatchEmails()"]');
    
    // 顯示進度並禁用按鈕
    progressDiv.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = '🚀 準備寄送中...';
    sendButton.disabled = true;
    sendButton.textContent = '⏳ 寄送中...';

    try {
        // 模擬進度
        progressBar.style.width = '20%';
        progressText.textContent = '📡 連接郵件伺服器...';
        
        const response = await fetch('/admin/send-batch-enhanced', {
            method: 'POST',
            headers: {
                'Authorization': headers.Authorization
            },
            body: formData
        });

        progressBar.style.width = '60%';
        progressText.textContent = '📧 處理郵件中...';

        const result = await response.json();

        if (response.ok && result.success) {
            const failedCount = result.totalCount - result.successCount;
            progressBar.style.width = '100%';
            progressText.textContent = `✅ 寄送完成！成功: ${result.successCount}，失敗: ${failedCount}`;
            showAlert(`📤 批次寄送完成！成功: ${result.successCount}/${result.totalCount} 封`, 'success');
            
            if (failedCount > 0) {
                console.log('失敗的寄送記錄:', result.results);
                showAlert(`⚠️ 部分郵件寄送失敗，請查看控制台獲取詳細資訊`, 'warning');
            }
            
            loadStats();
            
            // 3秒後隱藏進度條
            setTimeout(() => {
                progressDiv.classList.add('hidden');
            }, 3000);
        } else {
            progressBar.style.width = '0%';
            progressText.textContent = '❌ 寄送失敗';
            showAlert(`批次寄送失敗: ${result.error || '未知錯誤'}`, 'error');
        }
    } catch (error) {
        progressBar.style.width = '0%';
        progressText.textContent = '❌ 連接錯誤';
        showAlert(`批次寄送錯誤: ${error.message}`, 'error');
    } finally {
        // 恢復按鈕狀態
        sendButton.disabled = false;
        sendButton.textContent = '📤 開始批次寄送';
    }
}

async function resendEmail() {
    const headers = getAuthHeaders();
    if (!headers) return;

    const eventId = document.getElementById('eventId').value;
    const email = document.getElementById('resendEmail').value;
    const eventName = document.getElementById('resendEventName').value;
    const subject = document.getElementById('resendSubject').value;
    const attachPng = document.getElementById('resendAttachPng').checked;

    if (!eventId || !email || !eventName || !subject) {
        showAlert('請填寫所有必要欄位（包括活動ID）', 'error');
        return;
    }

    const resendData = {
        eventId,
        email,
        eventName,
        eventDate: document.getElementById('eventDate').value || '',
        eventLocation: document.getElementById('eventLocation').value || '',
        meetLocation: document.getElementById('meetLocation').value || '',
        secondRun: document.getElementById('secondRun').value || '',
        subject,
        from: document.getElementById('fromEmail').value || '',
        attachPng
    };

    try {
        const response = await fetch('/admin/resend-one', {
            method: 'POST',
            headers,
            body: JSON.stringify(resendData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showAlert(`成功補寄郵件到 ${email}`, 'success');
            document.getElementById('resendEmail').value = '';
        } else {
            showAlert(`補寄郵件失敗: ${result.error}`, 'error');
        }
    } catch (error) {
        showAlert(`補寄郵件錯誤: ${error.message}`, 'error');
    }
}

async function exportCheckins() {
    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch('/admin/export-checkins', {
            headers
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const contentDisposition = response.headers.get('Content-Disposition');
            const filename = contentDisposition 
                ? contentDisposition.split('filename=')[1].replace(/"/g, '')
                : `checkins-${new Date().toISOString().split('T')[0]}.csv`;
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showAlert('報到記錄匯出成功', 'success');
        } else {
            const error = await response.json();
            showAlert(`匯出失敗: ${error.error}`, 'error');
        }
    } catch (error) {
        showAlert(`匯出錯誤: ${error.message}`, 'error');
    }
}

// 郵件範本管理
let attachmentFiles = [];

async function loadDefaultTemplate() {
    try {
        const response = await fetch('/admin/get-default-template', {
            headers: { 'Authorization': `Bearer ${adminPass}` }
        });
        
        if (response.ok) {
            const template = await response.text();
            document.getElementById('emailTemplate').value = template;
            showAlert('預設範本已載入', 'success');
        } else {
            showAlert('載入預設範本失敗', 'error');
        }
    } catch (error) {
        // 如果 API 請求失敗，載入內建的預設範本
        console.warn('API 請求失敗，使用內建範本:', error);
        loadOfflineTemplate();
    }
}

function loadOfflineTemplate() {
    const defaultTemplate = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{eventName}} - 專屬入場 QR Code</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 600;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 18px;
            margin-bottom: 20px;
            color: #2c3e50;
        }
        
        .qr-section {
            text-align: center;
            margin: 30px 0;
            padding: 30px;
            background: #f8f9fa;
            border-radius: 10px;
            border: 2px dashed #007bff;
        }
        
        .qr-code {
            max-width: 200px;
            height: auto;
            margin: 20px auto;
            display: block;
        }
        
        .participant-info {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        
        .participant-info h3 {
            margin: 0 0 15px 0;
            color: #1976d2;
        }
        
        .footer {
            background: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #dee2e6;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎫 {{eventName}}</h1>
            <p>專屬入場 QR Code</p>
        </div>
        
        <div class="content">
            <div class="greeting">
                <p>親愛的 <strong>{{name}}</strong> 您好，</p>
            </div>
            
            <p>感謝您報名參加 <strong>{{eventName}}</strong>！我們很高興您將與我們一起參與這次精彩的活動。</p>
            
            <div class="participant-info">
                <h3>📋 參與者資訊</h3>
                <p><strong>姓名：</strong>{{name}}</p>
                <p><strong>Email：</strong>{{email}}</p>
                {{participantDetails}}
            </div>
            
            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                <h3>📅 活動詳情</h3>
                <p><strong>活動名稱：</strong>{{eventName}}</p>
                <p><strong>日期時間：</strong>{{eventDate}}</p>
                <p><strong>活動地點：</strong>{{eventLocation}}</p>
            </div>
            
            <div class="qr-section">
                <h3>🎯 您的專屬報到 QR Code</h3>
                <p>請在活動當天向工作人員出示此 QR Code 進行報到</p>
                <img src="{{qrDataUri}}" alt="QR Code" class="qr-code">
                <p><small>QR Code 僅限本人使用，請妥善保管</small></p>
            </div>
        </div>
        
        <div class="footer">
            <p><strong>{{eventName}} 主辦單位</strong></p>
            <p>如有任何問題，請聯繫主辦單位</p>
        </div>
    </div>
</body>
</html>`;

    document.getElementById('emailTemplate').value = defaultTemplate;
    showAlert('預設範本已載入 (離線版本)', 'success');
}

function uploadTemplate() {
    const fileInput = document.getElementById('templateFile');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.html') && !file.name.toLowerCase().endsWith('.htm')) {
        showAlert('請選擇 HTML 格式的檔案', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        document.getElementById('emailTemplate').value = content;
        
        // 顯示上傳狀態
        const templateStatus = document.getElementById('templateStatus');
        const templateFileName = document.getElementById('templateFileName');
        templateFileName.textContent = `📄 已載入範本: ${file.name}`;
        templateStatus.style.display = 'block';
        
        showAlert(`範本檔案 "${file.name}" 已載入成功`, 'success');
        
        // 清空檔案選擇器
        fileInput.value = '';
    };
    
    reader.onerror = function() {
        showAlert('讀取檔案時發生錯誤', 'error');
    };
    
    reader.readAsText(file);
}

function clearTemplate() {
    document.getElementById('emailTemplate').value = '';
    document.getElementById('templateStatus').style.display = 'none';
    document.getElementById('templateFile').value = '';
    showAlert('範本已清除', 'info');
}

async function previewTemplate() {
    const template = document.getElementById('emailTemplate').value;
    const eventId = document.getElementById('eventId').value;
    const eventName = document.getElementById('eventName').value || '範例活動';
    const eventDate = document.getElementById('eventDate').value || '請參考活動通知或官網';
    const eventLocation = document.getElementById('eventLocation').value || '請參考活動通知或官網';
    const meetLocation = document.getElementById('meetLocation').value || '請提前15分鐘抵達會場';
    const secondRun = document.getElementById('secondRun').value || '';
    
    if (!template.trim()) {
        showAlert('請先輸入或載入郵件範本', 'error');
        return;
    }
    
    // 使用選擇的參與者資料，如果沒有選擇則使用範例資料
    const participant = selectedParticipant || {
        name: '王小明',
        email: 'example@email.com',
        company: '範例公司',
        title: '工程師'
    };
    
    // 生成參與者詳細資訊
    let participantDetails = '';
    if (participant.company) {
        participantDetails += `<p><strong>公司：</strong>${participant.company}</p>`;
    }
    if (participant.title) {
        participantDetails += `<p><strong>職稱：</strong>${participant.title}</p>`;
    }
    
    // 生成真實的QR code
    let qrDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    
    if (eventId && participant.email) {
        try {
            const headers = getAuthHeaders();
            if (headers) {
                const response = await fetch('/admin/preview-qr', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        eventId: eventId,
                        email: participant.email
                    })
                });
                
                if (response.ok) {
                    const qrData = await response.json();
                    qrDataUri = qrData.qrDataUri;
                }
            }
        } catch (error) {
            console.warn('無法生成QR code預覽:', error);
        }
    }
    
    // 處理其他資訊區塊
    const secondRunSection = secondRun ? 
        `<div style="margin-top: 15px;">
            <p><strong>其他資訊：</strong></p>
            <div style="white-space: pre-line; background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 5px 0;">${secondRun}</div>
        </div>` : '';

    // 替換範本變數
    let preview = template
        .replace(/\{\{eventName\}\}/g, eventName)
        .replace(/\{\{eventDate\}\}/g, eventDate)
        .replace(/\{\{eventLocation\}\}/g, eventLocation)
        .replace(/\{\{meetLocation\}\}/g, meetLocation)
        .replace(/\{\{secondRunSection\}\}/g, secondRunSection)
        .replace(/\{\{name\}\}/g, participant.name || '')
        .replace(/\{\{email\}\}/g, participant.email || '')
        .replace(/\{\{company\}\}/g, participant.company || '')
        .replace(/\{\{title\}\}/g, participant.title || '')
        .replace(/\{\{participantDetails\}\}/g, participantDetails)
        .replace(/\{\{checkinUrl\}\}/g, '#')
        .replace(/\{\{qrDataUri\}\}/g, qrDataUri)
        .replace(/cid:qrcode/g, qrDataUri); // 預覽時將 CID 替換為 data URI
    
    const previewWindow = window.open('', '_blank', 'width=800,height=600');
    previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>郵件範本預覽 - ${participant.name || '範例參與者'}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .preview-header { 
                    background: #f0f0f0; 
                    padding: 10px; 
                    border-radius: 5px; 
                    margin-bottom: 20px;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="preview-header">
                <strong>📧 郵件預覽</strong> - 
                參與者：${participant.name || '範例參與者'} (${participant.email || 'example@email.com'})
                <br>活動：${eventName}
                <br>日期：${eventDate} | 地點：${eventLocation}
            </div>
            ${preview}
        </body>
        </html>
    `);
    previewWindow.document.close();
    
    if (selectedParticipant) {
        showAlert(`預覽已載入：${selectedParticipant.name} 的郵件`, 'success');
    } else {
        showAlert('預覽已載入（使用範例資料，請先上傳名單並選擇參與者以查看真實預覽）', 'info');
    }
}

// 批次預覽所有參與者的郵件
async function previewAllParticipants() {
    const template = document.getElementById('emailTemplate').value;
    const eventId = document.getElementById('eventId').value;
    const eventName = document.getElementById('eventName').value || '範例活動';
    const eventDate = document.getElementById('eventDate').value || '請參考活動通知或官網';
    const eventLocation = document.getElementById('eventLocation').value || '請參考活動通知或官網';
    const meetLocation = document.getElementById('meetLocation').value || '請提前15分鐘抵達會場';
    const secondRun = document.getElementById('secondRun').value || '';
    
    if (!template.trim()) {
        showAlert('請先輸入或載入郵件範本', 'error');
        return;
    }
    
    if (!participantsData || participantsData.length === 0) {
        showAlert('請先上傳參與者名單', 'error');
        return;
    }
    
    const previewWindow = window.open('', '_blank', 'width=1000,height=700');
    
    let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>批次郵件預覽 - ${eventName}</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 20px; 
                    line-height: 1.4;
                }
                .batch-header { 
                    background: #2c3e50; 
                    color: white;
                    padding: 15px; 
                    border-radius: 5px; 
                    margin-bottom: 20px;
                    text-align: center;
                }
                .participant-preview {
                    border: 2px solid #ddd;
                    margin-bottom: 30px;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .participant-header {
                    background: #f8f9fa;
                    padding: 10px 15px;
                    border-bottom: 1px solid #ddd;
                    font-weight: bold;
                    color: #2c3e50;
                }
                .participant-content {
                    padding: 20px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                .navigation {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    padding: 10px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    z-index: 1000;
                }
                .nav-item {
                    display: block;
                    padding: 5px 10px;
                    text-decoration: none;
                    color: #007bff;
                    border-bottom: 1px solid #eee;
                }
                .nav-item:hover {
                    background: #f8f9fa;
                }
            </style>
        </head>
        <body>
            <div class="batch-header">
                <h2>📋 批次郵件預覽</h2>
                <p><strong>活動：</strong>${eventName}</p>
                <p><strong>日期：</strong>${eventDate}</p>
                <p><strong>地點：</strong>${eventLocation}</p>
                <p>共 ${participantsData.length} 位參與者</p>
            </div>
            
            <div class="navigation">
                <strong>快速導航：</strong><br>
    `;
    
    // 生成導航連結
    participantsData.forEach((participant, index) => {
        htmlContent += `<a href="#participant-${index}" class="nav-item">${participant.name || `參與者${index + 1}`}</a>`;
    });
    
    htmlContent += `</div>`;
    
    // 顯示載入提示
    showAlert('正在生成批次預覽，請稍候...', 'info');
    
    // 批次生成QR codes
    const qrDataMap = new Map();
    if (eventId) {
        try {
            const headers = getAuthHeaders();
            if (headers) {
                const batchQRResponse = await fetch('/admin/batch-preview-qr', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        eventId: eventId,
                        emails: participantsData.map(p => p.email)
                    })
                });
                
                if (batchQRResponse.ok) {
                    const batchQRData = await batchQRResponse.json();
                    batchQRData.qrCodes.forEach(qr => {
                        qrDataMap.set(qr.email, qr.qrDataUri);
                    });
                }
            }
        } catch (error) {
            console.warn('無法生成批次QR code預覽:', error);
        }
    }
    
    // 生成每位參與者的郵件預覽
    participantsData.forEach((participant, index) => {
        // 生成參與者詳細資訊
        let participantDetails = '';
        if (participant.company) {
            participantDetails += `<p><strong>公司：</strong>${participant.company}</p>`;
        }
        if (participant.title) {
            participantDetails += `<p><strong>職稱：</strong>${participant.title}</p>`;
        }
        
        // 獲取對應的QR code或使用預設圖片
        const qrDataUri = qrDataMap.get(participant.email) || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        
        // 處理其他資訊區塊
        const secondRunSection = secondRun ? 
            `<div style="margin-top: 15px;">
                <p><strong>其他資訊：</strong></p>
                <div style="white-space: pre-line; background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 5px 0;">${secondRun}</div>
            </div>` : '';

        // 替換範本變數
        let participantPreview = template
            .replace(/\{\{eventName\}\}/g, eventName)
            .replace(/\{\{eventDate\}\}/g, eventDate)
            .replace(/\{\{eventLocation\}\}/g, eventLocation)
            .replace(/\{\{meetLocation\}\}/g, meetLocation)
            .replace(/\{\{secondRunSection\}\}/g, secondRunSection)
            .replace(/\{\{name\}\}/g, participant.name || '')
            .replace(/\{\{email\}\}/g, participant.email || '')
            .replace(/\{\{company\}\}/g, participant.company || '')
            .replace(/\{\{title\}\}/g, participant.title || '')
            .replace(/\{\{participantDetails\}\}/g, participantDetails)
            .replace(/\{\{checkinUrl\}\}/g, '#')
            .replace(/\{\{qrDataUri\}\}/g, qrDataUri)
            .replace(/cid:qrcode/g, qrDataUri); // 預覽時將 CID 替換為 data URI
        
        htmlContent += `
            <div class="participant-preview" id="participant-${index}">
                <div class="participant-header">
                    📧 ${index + 1}. ${participant.name || `參與者${index + 1}`} (${participant.email || '無Email'})
                </div>
                <div class="participant-content">
                    ${participantPreview}
                </div>
            </div>
        `;
    });
    
    htmlContent += `</body></html>`;
    
    previewWindow.document.write(htmlContent);
    previewWindow.document.close();
    
    showAlert(`批次預覽已開啟，共包含 ${participantsData.length} 位參與者的郵件預覽`, 'success');
}

// 附件管理
function setupAttachmentHandling() {
    const fileInput = document.getElementById('attachmentFiles');
    
    fileInput.addEventListener('change', function(event) {
        const files = Array.from(event.target.files);
        
        files.forEach(file => {
            if (!attachmentFiles.some(f => f.name === file.name && f.size === file.size)) {
                attachmentFiles.push(file);
            }
        });
        
        updateAttachmentList();
        event.target.value = ''; // 清空輸入框
    });
}

function updateAttachmentList() {
    const listContainer = document.getElementById('attachmentList');
    
    if (attachmentFiles.length === 0) {
        listContainer.innerHTML = '<p style="color: #666; text-align: center;">尚未選擇附件</p>';
        return;
    }
    
    const listHTML = attachmentFiles.map((file, index) => `
        <div class="attachment-item">
            <div>
                <div class="filename">📎 ${file.name}</div>
                <div class="filesize">${formatFileSize(file.size)}</div>
            </div>
            <button class="remove-btn" onclick="removeAttachment(${index})">移除</button>
        </div>
    `).join('');
    
    listContainer.innerHTML = listHTML;
}

function removeAttachment(index) {
    attachmentFiles.splice(index, 1);
    updateAttachmentList();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 修改發送郵件函數支援自定義範本和附件

window.addEventListener('load', () => {
    const today = new Date().toISOString().split('T')[0];
    const formattedDate = new Date().toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
    
    // 設定預設值（用戶可以手動修改）
    document.getElementById('eventId').value = `meeting-${today}`;
    document.getElementById('eventName').value = 'AI Orators Monthly Meeting';
    document.getElementById('eventDate').value = `${formattedDate} 13:00–20:00`;
    document.getElementById('eventLocation').value = '台北市信義區忠孝東路五段68號19樓（市政府站3號出口）';
    document.getElementById('meetLocation').value = '請於活動開始前15分鐘在1樓大廳集合';
    document.getElementById('secondRun').value = '';
    document.getElementById('emailSubject').value = '[{{eventName}}] 你的專屬入場QR碼';
    document.getElementById('fromEmail').value = 'AI Orators <AI.Orator@Toastmasters.org.tw>';
    
    document.getElementById('resendEventName').value = 'AI Orators Monthly Meeting';
    document.getElementById('resendSubject').value = '[活動名稱] 你的專屬入場QR碼';
    
    // 初始化附件處理
    setupAttachmentHandling();
    updateAttachmentList();
    
    loadStats();
});

// 臨時新增參與者功能
async function addTempParticipant() {
    const headers = getAuthHeaders();
    if (!headers) return;

    const name = document.getElementById('tempName').value.trim();
    const email = document.getElementById('tempEmail').value.trim();
    const company = document.getElementById('tempCompany').value.trim();
    const title = document.getElementById('tempTitle').value.trim();
    const sendEmail = document.getElementById('tempSendEmail').checked;

    if (!name || !email) {
        showAlert('請填寫姓名和 Email 地址', 'error');
        return;
    }

    // 基本 email 格式驗證
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showAlert('請輸入有效的 Email 地址', 'error');
        return;
    }

    const tempData = {
        name,
        email,
        company: company || undefined,
        title: title || undefined,
        sendEmail
    };

    // 如果要寄信，需要活動資訊
    if (sendEmail) {
        const eventId = document.getElementById('eventId').value;
        const eventName = document.getElementById('eventName').value;
        const subject = document.getElementById('emailSubject').value;
        
        if (!eventId || !eventName || !subject) {
            showAlert('要寄送邀請信需要填寫活動基本資料和信件主旨', 'error');
            return;
        }

        tempData.eventId = eventId;
        tempData.eventName = eventName;
        tempData.eventDate = document.getElementById('eventDate').value || '';
        tempData.eventLocation = document.getElementById('eventLocation').value || '';
        tempData.meetLocation = document.getElementById('meetLocation').value || '';
        tempData.secondRun = document.getElementById('secondRun').value || '';
        tempData.subject = subject;
        tempData.from = document.getElementById('fromEmail').value || '';
    }

    try {
        showTempStatus('正在新增參與者...', 'info');
        
        const response = await fetch('/admin/add-temp-participant', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(tempData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showTempStatus(
                `✅ 新增成功！${result.emailSent ? ' 邀請信已寄出' : ' 未寄送邀請信'}`, 
                'success'
            );
            
            // 清空表單
            document.getElementById('tempName').value = '';
            document.getElementById('tempEmail').value = '';
            document.getElementById('tempCompany').value = '';
            document.getElementById('tempTitle').value = '';
            
            // 更新統計
            loadStats();
            
            // 更新預覽表格顯示（包含新增的參與者）
            refreshParticipantList();
        } else {
            showTempStatus(`❌ ${result.error || '新增失敗'}`, 'error');
        }

    } catch (error) {
        console.error('Add temp participant error:', error);
        showTempStatus('❌ 網路錯誤，請稍後再試', 'error');
    }
}

function showTempStatus(message, type) {
    const statusDiv = document.getElementById('tempStatus');
    statusDiv.style.display = 'block';
    statusDiv.className = `alert alert-${type}`;
    statusDiv.textContent = message;
    
    // 3秒後隱藏成功訊息
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}

// 重新整理參與者列表顯示
async function refreshParticipantList() {
    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch('/admin/get-current-participants', {
            method: 'GET',
            headers: headers
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success && result.participants) {
                // 更新全域變數
                currentParticipants = result.participants;
                
                // 更新預覽顯示
                const mockResult = {
                    total: result.participants.length,
                    preview: result.participants.slice(0, 20),
                    columns: ['name', 'email', 'company', 'title', 'source']
                };
                
                displayCSVPreview(mockResult);
                showAlert(`參與者列表已更新，共 ${result.participants.length} 人（含臨時新增）`, 'success');
            }
        }
    } catch (error) {
        console.warn('Failed to refresh participant list:', error);
    }
}