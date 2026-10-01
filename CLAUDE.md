# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

繁體中文、離線優先的個人閱讀日記 **PWA**（原為 iOS 原生 App，因免費簽章每 7 天失效而改成 PWA，從 Safari
「加入主畫面」安裝）。Expo SDK 57 + react-native-web + TypeScript + expo-router，`output: "single"`，
部署在 GitHub Pages 的 `/ReadingDiary` 子路徑。資料存在瀏覽器端：sql.js（SQLite WASM）在記憶體執行，
每次寫入後 debounce 存進 IndexedDB（`src/db/open.ts`）。唯一的網路呼叫是書目查詢（Google Books／Open Library）
與選用的 Google Drive 備份。產品層面的設計決策見 README.md，不在此重複。

## Commands

```bash
npm test                              # jest（SQL 測試用 node:sqlite，不需瀏覽器）
npm run typecheck                     # tsc --noEmit
npm run lint
npx expo start --web                  # 開發伺服器（相機需要 HTTPS 或 localhost）
npx expo export -p web                # 產出 dist/，之後 cp dist/index.html dist/404.html
```

部署由 `.github/workflows/deploy.yml` 在 push 到 main 時執行。`app.json` 的 `experiments.baseUrl`、
`public/manifest.webmanifest`、`public/index.html`、`public/sw.js` 內的 `/ReadingDiary` 必須一致。

## Browser-only pieces

- 條碼：`components/camera-view.tsx`（getUserMedia + ZXing；iOS Safari 沒有 BarcodeDetector）。
- OCR：`services/ocr.ts` 用 tesseract.js（eng 讀 ISBN、chi_tra 讀書名），模型第一次用才下載。
- 封面以 JPEG data URL 直接存在 `books.cover_uri`（`services/cover.ts`），備份檔格式與舊原生版相容。
- `utils/alert.ts` + `components/alert-host.tsx`：react-native-web 的 `Alert` 是空實作，所以自行實作對話框。
  一律從 `@/utils/alert` 引入 Alert，不要從 `react-native`。
- Google 登入用 Google Identity Services（`services/cloud/auth.ts`），沒有 refresh token，
  token 過期後需使用者手勢重新授權。
- `public/sql-wasm-browser.wasm` 需與 `node_modules/sql.js` 版本一致，升級 sql.js 時一併複製。

## Architecture

**Layering is strict and one-directional:** `app/` (screens) → `repositories/` → `db/`. Screens never
write raw SQL — they call a repository function. Repositories are the only code that touches
`getDb()`/SQL. Cross-cutting logic (ISBN validation, metadata lookup, cover file handling, OCR, backup
export/import) lives in `services/` and is called from screens or repositories as needed, not from `db/`.

**Data refresh without a global store:** there is no Redux/Zustand. Screens call
`useAsyncData(loaderFn, deps)` (`src/hooks/use-async-data.ts`) to fetch from a repository; any mutation
calls `bumpDataVersion()` (`src/hooks/use-data-version.ts`) afterward, which increments a module-level
counter that every mounted `useAsyncData` subscribes to via `useSyncExternalStore`, causing an automatic
re-fetch. This is the mechanism that keeps e.g. the library list and the home screen's stats in sync after
any edit — if you add a new mutation, remember to call `bumpDataVersion()`.

**Testable DB layer:** `src/db/index.ts` defines a `SqlDatabase` interface shaped like expo-sqlite's async
API. `src/db/testing.ts` wraps Node's built-in `node:sqlite` (`DatabaseSync`) behind the same interface and
swaps it in via `setDbForTesting()`, so repository tests (`src/repositories/__tests__/`) run against a real
in-memory SQLite engine, not mocks. `src/db/migrations.ts` holds a versioned array of SQL migration
strings applied in order via `PRAGMA user_version` — append, never edit existing entries.

**Metadata lookup chain:** `src/services/metadata/index.ts` (`lookupByIsbn`) tries providers in order
(`googleBooks.ts` → `openLibrary.ts`), each with its own timeout, and never throws — a total failure
returns `{ metadata: null, failedReason: 'not_found' | 'network' }` so the UI (`src/app/scan.tsx`) can fall
back to a blank manual-entry form. `src/services/isbn.ts` is the single source of truth for ISBN
normalization/validation/10↔13 conversion and is used by scanning, OCR post-processing, and manual entry
alike — never validate an ISBN ad hoc elsewhere.

**Reading calendar sync:** `reading_logs` rows are the calendar's data source. `readingLogRepo.ts`'s
`syncLogsFromRange`/`trimLogsOutsideRange` auto-generate rows with `note = NULL` from a book's
`started_at`/`finished_at` whenever those change (called from `bookRepo.ts`'s create/update); rows with a
non-null `note` are user-added via the calendar UI and are never touched by that sync. Keep this
distinction (`note IS NULL` = auto-generated) if you touch either path.

**Pending metadata handoff between screens:** `src/state/pending-book.ts` is a module-level variable (not
router params) used to pass a full `BookMetadata` object from `scan.tsx` to `book/edit.tsx` without
serializing long descriptions into a URL — `setPendingBook()`/`takePendingBook()` (take-once semantics).

**Cover files:** always downloaded/copied into the app's local `covers/` directory
(`src/services/cover.ts`) before being referenced by a book row — never store a bare remote URL, so the UI
works offline and survives dead links.

## Testing conventions

- 登入與網路狀態（`services/cloud/auth.ts`、`network.ts`）在雲端備份測試中以 `jest.mock` 取代。
- Repository tests use `createTestDb()`/`clearTestDb()` from `src/db/testing.ts` in `beforeEach`/`afterEach`
  — don't hand-roll a different SQLite mock.
- Metadata lookup tests mock `global.fetch` directly (see `src/services/metadata/__tests__/lookup.test.ts`).
