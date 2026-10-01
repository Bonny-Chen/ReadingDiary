# 閱讀日記 開發須知

繁中離線閱讀日記 PWA。Expo SDK 57（react-native-web）+ TypeScript，資料存瀏覽器端 SQLite（sql.js + IndexedDB）。

- Expo 版本變動大，寫程式前先查對應版本的文件：https://docs.expo.dev/versions/v57.0.0/
- 畫面不要直接寫 SQL，一律經過 `src/repositories/`。
- 所有 UI 文案放在 `src/i18n/zh-TW.ts`，不要在元件裡寫死字串。
- 日期一律使用 `src/utils/date.ts` 的本地時區 `YYYY-MM-DD` 工具，不要用 `toISOString()`。
- 改動資料後呼叫 `bumpDataVersion()`，畫面上的 `useAsyncData` 會自動重查。
- 送交前跑：`npm test`、`npm run typecheck`、`npm run lint`。
