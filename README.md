# 🎫 QR Code 報到系統

一個完整的活動報到系統，支援 QR Code 產生、郵件寄送、Google Sheets 整合，以及手機友好的報到頁面。

## ✨ 功能特色

### 📧 雙模式郵件系統 (v1.1.0 新增)
- **🎉 推廣信模式** - 活動宣傳、報名邀請，包含報名連結按鈕
- **🎫 邀請信模式** - 行前通知、報到提醒，包含專屬QR Code
- **🔄 智慧切換** - 根據郵件類型自動調整UI和範本
- **🎨 雙重範本** - 推廣信（橘紅主題）vs 邀請信（藍紫主題）

### 🛡️ QR Code 管理 (v1.1.0 新增)
- **🚫 一鍵停用** - 可暫停QR Code報到功能
- **⚡ 即時生效** - 狀態變更立即影響所有報到頁面
- **📱 智慧提示** - 停用時顯示友善的暫停頁面
- **🔧 靈活控制** - 適合分階段開放報到或緊急暫停

### 📋 核心管理功能
- **CSV 名單管理** - 上傳參與者名單，自動驗證格式和重複檢查
- **智能郵件系統** - Gmail 相容的 CID 內嵌 QR Code，完美顯示
- **自訂範本編輯器** - HTML 範本編輯、上傳、即時預覽功能  
- **多附件支援** - PDF、DOC、圖片等多檔案自動附加
- **JWT 安全認證** - 帶姓名的時效性 QR Code，防偽造
- **Google Sheets 整合** - 即時寫入報到記錄，智能去重防重複
- **手機友好介面** - 顯示真實姓名的報到成功頁面
- **相機掃碼** - 內建相機掃碼頁面 (可選)
- **多種儲存方式** - SQLite/JSONL 本地備援
- **統計與匯出** - 唯一人數統計報到率，匯出 CSV 記錄
- **進度提示** - 批次寄送時顯示處理進度和完成狀態
- **完整活動資訊** - 支援活動時間、地點、集合地點、其他資訊設定
- **郵件相容性優化** - 淺色背景深色文字，適配各種郵件系統

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
├─ templates/              # 郵件範本
│   ├─ email.html          # 原始範本（向後兼容）
│   ├─ invitation.html     # 邀請信範本（含QR Code）
│   └─ promotion.html      # 推廣信範本（含報名連結）
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

### 2. 設定活動基本資料

在「活動基本資料」區塊中設定：
- **活動 ID**：系統自動產生，可手動修改
- **活動名稱**：例如 "AI Orators Monthly Meeting"
- **活動日期時間**：例如 "2025年9月7日（週日）13:00–20:00"
- **活動地點**：正式活動舉辦地點
- **集合地點**：參與者報到或集合位置
- **其他資訊**：額外資訊，如活動後聚餐地點等（支援多行文字）

### 3. 上傳參與者名單

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

### 4. 臨時新增參與者 (可選)

適合活動當天或緊急情況下新增參與者：
1. **填寫參與者資訊**：姓名 (必填)、Email (必填)、公司、職稱
2. **選擇是否寄信**：可選擇立即寄送邀請信或僅新增到名單
3. **自動整合**：新增的參與者會自動加入當前參與者列表
4. **完整功能**：支援報到、統計、個人補寄等所有功能

**使用場景：**
- 活動當天現場報名
- 臨時決定參加的 VIP
- 原始名單遺漏的參與者
- 緊急補邀的重要人士

### 5. 選擇郵件類型並寄送 (v1.1.0 新增)

#### 📧 雙模式郵件系統
系統現在支援兩種郵件類型，適用不同階段：

**🎉 推廣信模式 - 活動宣傳階段**
- **用途**：活動宣傳、招募參與者
- **內容**：活動介紹、報名連結、活動詳情
- **設定**：填寫報名網址 ({{registrationUrl}})
- **範本**：橘紅色主題，突出報名按鈕
- **不含**：QR Code（因為還未確定參與者）

**🎫 邀請信模式 - 行前通知階段**  
- **用途**：已報名參與者的行前通知
- **內容**：個人專屬QR Code、報到說明
- **設定**：需要活動ID ({{eventId}})
- **範本**：藍紫色主題，強調QR Code
- **包含**：個人專屬報到QR Code

#### 📝 寄送步驟
1. **選擇郵件類型**：推廣信或邀請信
2. **填寫對應資訊**：
   - 推廣信：報名網址
   - 邀請信：活動ID + QR設定
3. **設定郵件主旨和寄件者**
4. **選擇測試模式**（只寄前 3 封）或正式寄送
5. **點擊「開始批次寄送」**

#### 💡 使用時機建議
- **活動前30-14天**：發送推廣信招募參與者
- **報名截止後**：發送邀請信給確定參與者
- **活動前1-2天**：可再次發送邀請信提醒

#### ⏰ QR Code 時效性與寄送時機

**QR Code 有效期限**
- 預設：**240 小時（10 天）**
- 設定檔案：`.env` 中的 `JWT_TTL_HOURS=240`
- 可調整選項：
  - `JWT_TTL_HOURS=168` = 7天
  - `JWT_TTL_HOURS=336` = 14天
  - `JWT_TTL_HOURS=720` = 30天

**建議寄送時機**
- 🎯 **活動前 7-10 天**：寄送邀請信（含 QR Code）
- 🔔 **活動前 1-2 天**：寄送提醒通知（可選）

**安排優勢**
- ✅ QR Code 在活動當天仍然有效
- ✅ 參與者有足夠時間準備和規劃
- ✅ 避免太早寄送導致被遺忘
- ✅ 避免太晚寄送來不及處理問題

### 6. QR Code 管理 (v1.1.0 新增)

#### 🛡️ 報到功能控制
管理介面新增「QR Code 管理」區塊，可以：

**🚫 一鍵停用報到**
- 暫停所有QR Code報到功能
- 適用場景：活動延期、報到時間外、緊急暫停
- 即時生效，所有QR Code立即失效

**✅ 重新啟用報到**
- 恢復QR Code報到功能
- 所有有效期內的QR Code立即可用

**📱 用戶友善提示**
- QR功能停用時，掃描會顯示「功能暫停」頁面
- 提示用戶聯繫現場工作人員協助

#### 💡 使用場景
- **分階段報到**：控制不同時間段的報到開放
- **活動延期**：暫停報到避免混亂
- **技術維護**：臨時停用進行系統調整
- **緊急控制**：遇到問題時立即暫停

### 7. 活動當天報到

#### 方式一：一般 QR 掃碼器
1. 參與者向工作人員展示 QR Code
2. 工作人員用任何 QR 掃碼器掃描
3. 掃碼器會導向報到網址
4. 手機顯示報到成功頁面

#### 方式二：內建相機掃碼
1. 前往 `/scan.html` 開啟相機掃碼頁面
2. 將參與者的 QR Code 對準框架
3. 自動識別並導向報到頁面

### 8. 查看統計與匯出

#### 📊 報到統計
- 管理面板即時顯示報到統計
- 總參與者、已報到、今日報到、報到率

#### 📥 匯出功能 (v1.1.0 修復)
- **修復問題**：匯出按鈕無作用的問題已解決
- **新增功能**：建立測試報到記錄
- **改善體驗**：詳細的匯出狀態提示
- **錯誤處理**：更好的錯誤訊息和調試資訊

#### 🧪 測試功能
- **測試記錄**：一鍵建立測試報到記錄
- **驗證匯出**：確保匯出功能正常運作
- **調試模式**：瀏覽器控制台顯示詳細日誌

#### 📋 資料同步
- 報到記錄會自動同步到 Google Sheets
- 本機 SQLite 作為備援儲存

#### 🔢 重複掃描與統計邏輯

**重複掃描處理：**
- ✅ **防重複記錄**：同一人重複掃描 QR Code 不會產生多筆記錄
- 🔄 **更新時間戳記**：重複掃描會更新最新掃描時間，保留首次報到時間
- 💬 **用戶提示**：首次掃描顯示「報到成功」，重複掃描顯示「已完成報到」

**統計數據說明：**
- 📊 **唯一人數統計**：報到統計以「唯一參與者」計算，不是掃描次數
- 🎯 **準確報到率**：報到率 = 已報到人數 / 邀請總人數
- 📈 **即時更新**：管理介面統計數據即時反映當前報到狀況

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

### Zeabur 部署

1. 前往 [Zeabur](https://zeabur.com/) 註冊帳號
2. 建立新專案並連接 GitHub 存放庫
3. 系統會自動偵測 `zeabur.json` 配置檔案
4. 設定環境變數：
   - 將 `.env` 檔案內容複製到環境變數設定
   - **重要**：將 Google 服務帳號 JSON 內容轉為 base64 格式設定到 `GOOGLE_SERVICE_ACCOUNT_KEY`
   ```bash
   # 在本地執行此命令取得 base64 編碼
   cat creds/service-account.json | base64 -w 0
   ```
5. 部署完成

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

### 💻 本機執行

系統完全支援在本機執行，適合小型活動、測試環境或高度機密性場合。

#### 本機執行優勢
- ✅ **完全離線操作** - 不需要雲端服務
- ✅ **成本零消耗** - 無雲端費用
- ✅ **資料完全掌控** - 敏感資料不上雲
- ✅ **快速測試** - 即時調試和修改

#### 本機設定步驟

**1. 環境準備**
```bash
# 確認 Node.js 已安裝 (需要 16+ 版本)
node --version

# 安裝依賴
npm install

# 複製環境設定
cp .env.sample .env
```

**2. 本機專用 .env 設定**
```env
# 本機設定
PORT=8080
BASE_URL=http://localhost:8080
EVENT_ID=local-event-2025
EVENT_NAME=本機測試活動
JWT_SECRET=your-secret-key-here
JWT_TTL_HOURS=240

# 郵件設定（使用您的真實郵箱）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# 本機儲存設定
LOCAL_PERSISTENCE=sqlite    # 使用本機 SQLite 資料庫
GOOGLE_SHEETS_ID=           # 可留空，僅使用本機儲存

# 管理設定
ADMIN_PASS=admin123
RATE_LIMIT_PER_SEC=5
ATTACH_QR_PNG=false
```

**3. 啟動系統**
```bash
# 開發模式（推薦）
npm run dev

# 或生產模式
npm run build
npm start
```

系統將在 `http://localhost:8080` 啟動

#### 本機儲存選項

**選項 1：僅本機儲存（推薦）**
```env
LOCAL_PERSISTENCE=sqlite
GOOGLE_SHEETS_ID=    # 留空
```
- 資料儲存在 `data/checkins.sqlite`
- 完全離線操作，可匯出 CSV

**選項 2：雙重備份**
```env
LOCAL_PERSISTENCE=sqlite
GOOGLE_SHEETS_ID=your_sheet_id
```
- 主要：本機 SQLite，備份：Google Sheets
- 網路問題時自動切換本機儲存

#### 區域網路存取

讓同事在區域網路內也能使用：

**1. 取得本機 IP 位址**
```bash
# Windows
ipconfig

# Mac/Linux  
ifconfig
```

**2. 修改設定**
```env
BASE_URL=http://192.168.1.100:8080    # 替換為您的本機 IP
```

**3. 防火牆設定**
- Windows：允許 Node.js 通過防火牆
- Mac：系統偏好設定 > 安全性 > 防火牆
- Linux：`sudo ufw allow 8080`

#### 本機使用流程

**管理者操作：**
1. 開啟 `http://localhost:8080`
2. 上傳參與者 CSV 並發送邀請
3. 即時查看統計和匯出記錄

**報到流程：**
1. 參與者收到邀請信（含 QR Code）
2. 工作人員掃描 QR Code
3. 自動導向：`http://localhost:8080/checkin?token=...`
4. 顯示報到成功頁面

#### 資料管理

**資料位置：**
- SQLite 資料庫：`data/checkins.sqlite`
- 系統日誌：控制台輸出

**備份方式：**
```bash
# 備份資料庫檔案
cp data/checkins.sqlite backup/

# 或透過管理介面匯出 CSV
```

#### 本機 vs 雲端比較

| 功能 | 本機執行 | 雲端部署 |
|------|----------|----------|
| 成本 | 免費 | 需付費 |
| 設定複雜度 | 簡單 | 中等 |
| 網路存取 | 區域網路 | 全球存取 |
| 資料安全 | 完全掌控 | 依賴平台 |
| 擴展性 | 有限 | 無限 |
| 維護 | 自行負責 | 平台管理 |

**本機執行適合：**
- 🏢 企業內部活動
- 🎓 學校小型聚會
- 🧪 系統測試和開發
- 🔒 高度機密性活動

## 📧 其他郵件服務設定

系統支援多種郵件服務，只需修改 `.env` 檔案中的 SMTP 設定：

### Microsoft Outlook/Hotmail

```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_account@outlook.com
SMTP_PASS=your_app_password
FROM_EMAIL=your_account@outlook.com
```

**取得 Outlook 應用程式密碼：**
1. 前往 [Microsoft 帳戶安全性](https://account.microsoft.com/security)
2. 啟用兩步驟驗證
3. 建立應用程式密碼（16 位數密碼，移除空格）
4. 將密碼設定到 `SMTP_PASS`

### Yahoo Mail

```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_account@yahoo.com
SMTP_PASS=your_app_password
FROM_EMAIL=your_account@yahoo.com
```

### 企業郵件服務

```env
SMTP_HOST=mail.yourcompany.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourcompany.com
SMTP_PASS=your_password
FROM_EMAIL=noreply@yourcompany.com
```

### 其他常見服務

**QQ 郵箱：** `SMTP_HOST=smtp.qq.com`  
**163 網易：** `SMTP_HOST=smtp.163.com`  
**126 網易：** `SMTP_HOST=smtp.126.com`

### SMTP 設定說明

**埠號選擇：**
- **587** - TLS 加密（推薦，設定 `SMTP_SECURE=false`）
- **465** - SSL 加密（設定 `SMTP_SECURE=true`）
- **25** - 無加密（不建議使用）

**安全要求：**
大部分現代郵件服務都需要：
1. 啟用兩步驟驗證
2. 使用應用程式專用密碼（而非一般登入密碼）
3. 開啟「允許較不安全的應用程式」（某些服務需要）

## 📝 自定義郵件範本和附件

系統支援完全自定義的郵件範本和多附件功能：

### 範本編輯功能
- 📝 HTML 範本編輯器
- 🔄 載入預設範本
- 👁️ 即時預覽功能
- 🏷️ 支援範本變數：`{{name}}`, `{{email}}`, `{{company}}`, `{{title}}`, `{{eventName}}`, `{{eventDate}}`, `{{eventLocation}}`, `{{meetLocation}}`, `{{secondRunSection}}`, `{{checkinUrl}}`, `{{qrDataUri}}`, `{{participantDetails}}`

### 多附件支援
- 📎 支援多檔案上傳（PDF, DOC, DOCX, PNG, JPG 等）
- 📋 附件清單管理
- 🗑️ 個別移除附件
- 📏 檔案大小顯示

### 使用範例

**自定義範本：**
```html
<h1>{{eventName}} 邀請函</h1>
<p>親愛的 {{name}} 您好：</p>
<p>請參閱附件中的會議議程，並使用以下 QR Code 報到：</p>
<img src="{{qrDataUri}}" alt="QR Code">
```

**常用附件：**
- Meeting_Agenda.pdf（會議議程）
- Event_Guidelines.docx（活動指南）
- Venue_Map.png（會場地圖）
- Parking_Info.pdf（停車資訊）

### 使用方式
1. 在管理介面「📝 郵件範本編輯」區塊編輯 HTML 範本
2. 在「📎 附件管理」區塊上傳所需附件
3. 正常進行批次寄送，系統會自動使用自定義範本和附件

## 🔧 技術細節和常見問題

### SQLite 資料庫
系統使用 SQLite 作為本機資料儲存，**無需額外安裝或設定**：

- ✅ **自動初始化** - 首次運行時自動建立 `data/checkins.sqlite`
- ✅ **零設定** - 不需要安裝資料庫伺服器
- ✅ **輕量級** - 單檔案資料庫，佔用資源極少
- ✅ **跨平台** - Windows/Mac/Linux 都支援

**資料庫位置**：`data/checkins.sqlite`
**備份方式**：直接複製 `.sqlite` 檔案

### QR Code 產生
系統使用內建的 `qrcode` npm 套件產生 QR Code：

- ✅ **完全離線** - 不需要雲端 QR Code 服務
- ✅ **不需要 Google Charts API** - 本機產生
- ✅ **高品質** - 256x256 像素，支援錯誤糾正
- ✅ **快速產生** - 毫秒級本機運算

### 載入範本功能
管理介面的「載入預設範本」按鈕支援兩種模式：

#### 線上模式（系統運行時）
```bash
npm run dev
# 開啟 http://localhost:8080
```
- 從 `templates/email.html` 載入真實範本
- 支援即時更新範本檔案

#### 離線模式（直接開啟 admin.html）
- 使用內建的預設範本
- 適合範本編輯和預覽

#### 更新預設範本
要更新系統預設範本，只需：
1. **直接取代檔案**：`cp your-new-template.html templates/email.html`
2. **無需重啟系統** - 範本檔案會即時重新讀取
3. **保留範本變數** - 確保新範本包含所有 `{{變數}}`
4. **建議備份** - 更新前備份原檔案：`cp templates/email.html templates/email.html.backup`

**範本變數清單**：
- **參與者資訊**：`{{name}}`, `{{email}}`, `{{company}}`, `{{title}}`
- **活動資訊**：`{{eventName}}`, `{{eventDate}}`, `{{eventLocation}}`, `{{meetLocation}}`
- **其他資訊**：`{{secondRunSection}}` (格式化的額外資訊區塊)
- **系統變數**：`{{checkinUrl}}`, `{{qrDataUri}}`, `{{participantDetails}}`

### 獨立掃碼器
系統提供 `standalone-scanner.html` 獨立掃碼檔案：

- ✅ **完全獨立** - 不需要後端系統
- ✅ **離線可用** - 只需一個 HTML 檔案
- ✅ **顯示結果** - 掃描後彈窗顯示內容
- ✅ **持續掃描** - 可連續掃描多個 QR Code

**使用方式**：將檔案傳給工作人員，用手機瀏覽器開啟

### 本機執行功能完整度
本機執行支援 **95%** 的完整功能：

| 功能 | 本機支援 | 說明 |
|------|----------|------|
| 上傳 CSV | ✅ | 完全支援 |
| 批次寄信 | ✅ | 需要 SMTP 設定 |
| QR Code 產生 | ✅ | 本機產生 |
| 報到驗證 | ✅ | 完全支援 |
| 資料儲存 | ✅ | SQLite 本機資料庫 |
| 統計查看 | ✅ | 即時統計 |
| 匯出記錄 | ✅ | CSV 格式 |
| 網路存取 | 🔄 | 僅限區域網路 |

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

#### 6. 載入範本按鈕沒有反應
- **本機使用**：確保系統正在運行（`npm run dev`）
- **離線使用**：直接開啟 admin.html 會使用內建範本
- **網路問題**：檢查 `http://localhost:8080` 是否可以存取

#### 7. 本機 SQLite 資料庫問題
- **自動建立**：首次運行會自動建立 `data/checkins.sqlite`
- **權限問題**：確保程序有寫入 `data/` 目錄的權限
- **資料重置**：刪除 `data/` 目錄會清除所有本機資料
- **備份資料**：直接複製 `.sqlite` 檔案即可備份

#### 8. 獨立掃碼器相機無法使用
- **HTTPS 要求**：現代瀏覽器需要 HTTPS 才能使用相機
- **本機檔案**：直接開啟 HTML 檔案通常可以使用相機
- **權限設定**：確保瀏覽器已授權使用相機
- **瀏覽器相容**：建議使用 Chrome、Safari 或 Edge

#### 9. 區域網路存取問題
- **防火牆**：確保防火牆允許 Node.js 通過
- **IP 設定**：在 `.env` 中設定正確的 `BASE_URL=http://你的IP:8080`
- **網路設定**：確保所有設備在同一區域網路

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