# 🎫 QR Code 報到系統

一個完整的活動報到系統，支援 QR Code 產生、郵件寄送、Google Sheets 整合，以及手機友好的報到頁面。

## ✨ 功能特色

- **📋 CSV 名單管理** - 上傳參與者名單，自動驗證格式
- **📧 批次郵件寄送** - 個人化 QR Code 邀請信，支援測試模式
- **🔐 JWT 安全認證** - 帶時效性的 QR Code，防偽造
- **📊 Google Sheets 整合** - 即時寫入報到記錄，支援去重
- **📱 手機友好介面** - 報到成功/失敗頁面，適配各種螢幕
- **🎥 相機掃碼** - 內建相機掃碼頁面 (可選)
- **💾 多種儲存方式** - SQLite/JSONL 本地備援
- **📈 統計與匯出** - 即時統計報到率，匯出 CSV 記錄

## 🏗️ 系統架構

```
/qr-checkin
├─ src/
│   ├─ server.ts           # Express 伺服器主程式
│   ├─ routes/
│   │   ├─ admin.ts        # 管理介面 API
│   │   └─ checkin.ts      # 報到驗證 API
│   ├─ services/
│   │   ├─ mailer.ts       # 郵件服務
│   │   ├─ qr.ts           # QR Code 產生
│   │   ├─ token.ts        # JWT 處理
│   │   ├─ sheets.ts       # Google Sheets 整合
│   │   └─ storage.ts      # 本地儲存
│   ├─ utils/csv.ts        # CSV 解析工具
│   ├─ public/             # 前端頁面
│   └─ types.ts            # TypeScript 類型定義
├─ templates/email.html    # 郵件模板
├─ creds/                  # Google 服務帳號憑證 (.gitignore)
└─ data/                   # 本地資料庫檔案 (.gitignore)
```

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 環境設定

複製範例設定檔並修改：

```bash
cp .env.sample .env
```

編輯 `.env` 檔案，設定必要參數：

```env
# 基本設定
PORT=8080
BASE_URL=http://localhost:8080
EVENT_ID=my-event-2025
EVENT_NAME=我的活動名稱
JWT_SECRET=your-super-secret-key-here
JWT_TTL_HOURS=240

# SMTP 郵件設定 (Gmail 範例)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_account@gmail.com
SMTP_PASS=your_app_password

# 寄件者資訊
FROM_DISPLAY=活動主辦方
FROM_EMAIL=your_account@gmail.com
MAIL_SUBJECT=[{{eventName}}] 你的專屬入場QR碼

# Google Sheets 設定
GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_SHEETS_TAB=checkins

# 其他設定
LOCAL_PERSISTENCE=sqlite    # sqlite | jsonl | none
ATTACH_QR_PNG=false        # true=附件, false=內嵌
RATE_LIMIT_PER_SEC=3       # 每秒寄送郵件數量限制
ADMIN_PASS=your-admin-password
```

### 3. Google Sheets 設定

#### 3.1 建立 Google Cloud 專案並啟用 API

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 **Google Sheets API**：
   - 導航到「APIs & Services」>「Library」
   - 搜尋「Google Sheets API」並啟用

#### 3.2 建立服務帳號

1. 前往「APIs & Services」>「Credentials」
2. 點擊「Create Credentials」>「Service Account」
3. 填寫服務帳號資訊並建立
4. 在服務帳號頁面，點擊「Add Key」>「Create New Key」
5. 選擇 JSON 格式下載金鑰檔案
6. 將檔案重新命名為 `service-account.json` 並放到 `creds/` 目錄

#### 3.3 設定 Google Sheets

1. 建立新的 Google Sheets 試算表
2. 從網址列複製試算表 ID：
   ```
   https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
   ```
3. 將試算表分享給服務帳號的 email（在 JSON 檔案中的 `client_email` 欄位）
4. 授予「編輯者」權限
5. 將試算表 ID 設定到 `.env` 檔案的 `GOOGLE_SHEETS_ID`

### 4. Gmail SMTP 設定

#### 4.1 啟用兩步驟驗證

1. 前往 [Google 帳戶設定](https://myaccount.google.com/)
2. 選擇「安全性」>「兩步驟驗證」
3. 按照指示完成設定

#### 4.2 產生應用程式密碼

1. 在「安全性」頁面，選擇「應用程式密碼」
2. 選擇「郵件」和設備類型
3. 產生 16 位數的應用程式密碼
4. 將密碼設定到 `.env` 檔案的 `SMTP_PASS`

### 5. 運行系統

#### 開發模式
```bash
npm run dev
```

#### 生產模式
```bash
npm run build
npm start
```

系統將在 `http://localhost:8080` 啟動

## 📖 使用說明

### 1. 存取管理介面

開啟瀏覽器前往 `http://localhost:8080`，進入管理面板。

### 2. 上傳參與者名單

準備 CSV 檔案，必須包含以下欄位：
- `name` - 參與者姓名 (必填)
- `email` - 參與者 Email (必填)
- `company` - 公司名稱 (可選)
- `title` - 職稱 (可選)

範例 CSV：
```csv
name,email,company,title
王小明,wang@example.com,科技公司,工程師
李小華,lee@example.com,設計公司,設計師
張小強,zhang@example.com,,學生
```

### 3. 批次寄送邀請信

1. 填寫活動名稱、郵件主旨
2. 選擇測試模式（只寄前 3 封）或正式寄送
3. 選擇 QR Code 嵌入方式（內嵌或附件）
4. 點擊「開始批次寄送」

### 4. 活動當天報到

#### 方式一：一般 QR 掃碼器
1. 參與者向工作人員展示 QR Code
2. 工作人員用任何 QR 掃碼器掃描
3. 掃碼器會導向報到網址
4. 手機顯示報到成功頁面

#### 方式二：內建相機掃碼
1. 前往 `/scan.html` 開啟相機掃碼頁面
2. 將參與者的 QR Code 對準框架
3. 自動識別並導向報到頁面

### 5. 查看統計與匯出

- 管理面板即時顯示報到統計
- 點擊「匯出報到記錄」下載 CSV 檔案
- 報到記錄會自動同步到 Google Sheets

## 🔧 API 文件

### 管理 API (需要認證)

所有管理 API 都需要在 Header 中加入：
```
Authorization: Bearer {ADMIN_PASS}
```

#### 上傳 CSV
```http
POST /admin/upload-csv
Content-Type: multipart/form-data

Body: CSV 檔案
```

#### 批次寄送
```http
POST /admin/send-batch
Content-Type: application/json

{
  "eventName": "活動名稱",
  "subject": "郵件主旨",
  "from": "寄件者",
  "testMode": false,
  "attachPng": false
}
```

#### 個人補寄
```http
POST /admin/resend-one
Content-Type: application/json

{
  "email": "participant@example.com",
  "eventName": "活動名稱",
  "subject": "郵件主旨",
  "attachPng": false
}
```

#### 匯出報到記錄
```http
GET /admin/export-checkins
```

#### 取得統計資料
```http
GET /admin/stats
```

### 報到 API (公開)

#### 報到驗證
```http
GET /checkin?token={JWT_TOKEN}
```

成功後返回 HTML 頁面顯示報到結果。

## 🛠️ 部署指南

### Railway 部署

1. 前往 [Railway](https://railway.app/) 註冊帳號
2. 連接 GitHub 存放庫
3. 設定環境變數 (將 `.env` 內容複製到 Railway)
4. 上傳 Google 服務帳號金鑰到 `creds/service-account.json`
5. 部署完成

### Render 部署

1. 前往 [Render](https://render.com/) 註冊帳號
2. 建立新的 Web Service
3. 連接 GitHub 存放庫
4. 設定環境變數
5. 上傳服務帳號金鑰檔案
6. 部署

### Docker 部署

```bash
# 建立映像檔
docker build -t qr-checkin .

# 運行容器
docker run -p 8080:8080 --env-file .env qr-checkin
```

或使用 Docker Compose：

```bash
docker-compose up -d
```

## 🔍 故障排除

### 常見問題

#### 1. Gmail SMTP 認證失敗
- 確認已啟用兩步驟驗證
- 使用應用程式密碼而非帳戶密碼
- 檢查 SMTP 設定是否正確

#### 2. Google Sheets 寫入失敗
- 確認服務帳號金鑰檔案路徑正確
- 檢查試算表是否已分享給服務帳號
- 確認試算表 ID 設定正確

#### 3. QR Code 掃描後顯示過期
- 檢查系統時間是否正確
- 確認 `JWT_TTL_HOURS` 設定合理
- 重新產生 QR Code

#### 4. 郵件中 QR Code 無法顯示
- 嘗試切換為附件模式 (`ATTACH_QR_PNG=true`)
- 檢查郵件客戶端是否封鎖圖片
- 確認 `BASE_URL` 設定正確

#### 5. 報到頁面無法正常顯示姓名
- 檢查 CSV 中參與者資料是否完整
- 確認 JWT payload 包含正確的 email
- 查看伺服器日誌中的錯誤訊息

### 日誌查看

開發環境：
```bash
npm run dev
```
會在控制台顯示詳細日誌。

生產環境可以設定日誌等級：
```env
LOG_LEVEL=info
```

### 除錯模式

設定環境變數啟用除錯：
```env
NODE_ENV=development
LOG_LEVEL=debug
```

## 🧪 測試

### 建立測試資料

使用提供的範例檔案：

```bash
# 複製範例 CSV
cp sample.csv test-participants.csv
```

範例包含 3 筆測試資料，可用於驗證系統功能。

### 測試流程

1. 啟動系統：`npm run dev`
2. 上傳 `sample.csv`
3. 開啟測試模式批次寄送
4. 檢查收信並測試 QR Code
5. 用手機掃描測試報到流程
6. 檢查 Google Sheets 記錄

## 🔒 安全性

### JWT 設定
- 使用強密碼作為 `JWT_SECRET`
- 設定合理的過期時間 `JWT_TTL_HOURS`
- Token 包含 nonce 防重放攻擊

### 管理介面
- 使用強密碼作為 `ADMIN_PASS`
- 建議部署時使用 HTTPS
- 限制管理介面存取來源

### 資料保護
- 所有機密資料放在 `.env`
- Google 服務帳號金鑰加入 `.gitignore`
- 生產環境使用環境變數而非檔案

## 📝 更新日誌

### v1.0.0
- 初始版本發布
- 完整的 QR 報到系統功能
- Google Sheets 整合
- 手機友好的報到介面

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

MIT License

## 📞 支援

如有問題請開啟 GitHub Issue 或聯繫維護團隊。

---

**🎉 祝您的活動圓滿成功！**