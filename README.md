# 閱讀日記（PWA）

繁體中文、離線優先的個人閱讀日記。以 PWA 形式運作：不需要 App Store、不需要簽章，也就沒有「每 7 天重簽」的問題。

## 功能

- 書庫：封面牆／列表、狀態／分類／年份／關鍵字篩選、五種排序
- 新增書籍：掃描 ISBN 條碼、拍版權頁 OCR、書名搜尋（Google Books／Open Library）、手動輸入
- 書籍紀錄：狀態、起訖日期、星等（可半星）、心得、分類、引言、自訂封面
- 首頁：年度目標進度環、各狀態統計、年度最高分、隨機引言、閱讀月曆
- 統計：每月／每年完成數、平均閱讀天數、分類占比、最快／最慢
- 備份：JSON 匯出入（含封面）、Google Drive 備份

## 安裝（iPhone）

1. 用 **Safari** 開啟部署網址 `https://<你的帳號>.github.io/ReadingDiary/`
2. 分享 → **加入主畫面**。一定要從主畫面開啟：iOS 會清除一般 Safari 分頁中 7 天沒使用的網站資料，已加入主畫面的 App 則不受此限。
3. 資料只存在這支手機的瀏覽器儲存空間，請定期到「設定」匯出備份。

## 從舊的原生 App 搬資料

1. 在舊 App：設定 → 匯出備份，存成 JSON（簽章還沒過期前做）。
2. 在 PWA：設定 → 匯入備份，選擇該檔案。備份格式完全相容。

## 開發

```bash
npm install
npx expo start --web     # 開發
npm test
npx expo export -p web   # 產出 dist/
```

環境變數（`.env.local`，部署時用 GitHub Secrets `GOOGLE_BOOKS_API_KEY`、`GOOGLE_WEB_CLIENT_ID`）：

- `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY`：選用，建議在 Google Cloud 設定 HTTP referrer 限制為 Pages 網域。
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`：Google Drive 備份用的 **Web** OAuth Client ID，Authorized JavaScript origins 要加入 Pages 網域與 `http://localhost:8081`。

## 部署（GitHub Pages）

1. 建立 GitHub repo `ReadingDiary` 並推上 main（網址子路徑要與 `app.json` 的 `experiments.baseUrl` 一致；repo 改名時要同步改 `app.json`、`public/manifest.webmanifest`、`public/index.html`）。
2. Settings → Pages → Source 選 **GitHub Actions**。
3. push 後由 `.github/workflows/deploy.yml` 自動建置部署。

## 已知限制

- 中文封面 OCR 用 tesseract.js，準確度低於原生 ML Kit，第一次使用需下載約 12MB 語言模型；辨識結果只當建議。
- Google Drive：網頁版沒有 refresh token，約 1 小時後自動備份會因無法重新授權而失敗，打開設定頁手動備份一次即可重新授權。
- 相機需要 HTTPS（或 localhost）。
