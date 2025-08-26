let currentPassword = '';

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
        const response = await fetch('/admin/stats', { headers });
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
            uploadCSVFile(file);
        } else {
            showAlert('請選擇 CSV 檔案', 'error');
        }
    }
}

function uploadCSV(event) {
    const file = event.target.files[0];
    if (file) {
        uploadCSVFile(file);
    }
}

async function uploadCSVFile(file) {
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
        showAlert(`CSV 上傳錯誤: ${error.message}`, 'error');
    }
}

function displayCSVPreview(result) {
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
    }
}

async function sendBatchEmails() {
    const headers = getAuthHeaders();
    if (!headers) return;

    const eventName = document.getElementById('eventName').value;
    const subject = document.getElementById('emailSubject').value;
    const from = document.getElementById('fromEmail').value;
    const testMode = document.getElementById('testMode').checked;
    const attachPng = document.getElementById('attachPng').checked;

    if (!eventName || !subject) {
        showAlert('請填寫活動名稱和信件主旨', 'error');
        return;
    }

    const sendData = {
        eventName,
        subject,
        from,
        testMode,
        attachPng
    };

    const progressDiv = document.getElementById('sendProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    progressDiv.classList.remove('hidden');
    progressBar.style.width = '10%';
    progressText.textContent = '開始寄送...';

    try {
        const response = await fetch('/admin/send-batch', {
            method: 'POST',
            headers,
            body: JSON.stringify(sendData)
        });

        const result = await response.json();

        if (response.ok) {
            progressBar.style.width = '100%';
            progressText.textContent = `寄送完成！成功: ${result.summary.successful}，失敗: ${result.summary.failed}`;
            showAlert(result.message, 'success');
            
            if (result.summary.failed > 0) {
                console.log('失敗的寄送記錄:', result.summary.results.filter(r => !r.success));
            }
            
            loadStats();
        } else {
            progressBar.style.width = '0%';
            progressText.textContent = '寄送失敗';
            showAlert(`批次寄送失敗: ${result.error}`, 'error');
        }
    } catch (error) {
        progressBar.style.width = '0%';
        progressText.textContent = '寄送錯誤';
        showAlert(`批次寄送錯誤: ${error.message}`, 'error');
    }
}

async function resendEmail() {
    const headers = getAuthHeaders();
    if (!headers) return;

    const email = document.getElementById('resendEmail').value;
    const eventName = document.getElementById('resendEventName').value;
    const subject = document.getElementById('resendSubject').value;
    const attachPng = document.getElementById('resendAttachPng').checked;

    if (!email || !eventName || !subject) {
        showAlert('請填寫所有必要欄位', 'error');
        return;
    }

    const resendData = {
        email,
        eventName,
        subject,
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

window.addEventListener('load', () => {
    document.getElementById('eventName').value = 'AI Orators Monthly Meeting';
    document.getElementById('emailSubject').value = '[{{eventName}}] 你的專屬入場QR碼';
    document.getElementById('fromEmail').value = 'AI Orators <noreply@example.com>';
    
    document.getElementById('resendEventName').value = 'AI Orators Monthly Meeting';
    document.getElementById('resendSubject').value = '[活動名稱] 你的專屬入場QR碼';
    
    loadStats();
});