# StoryFlow Codex Project 設定指南

> 狀態：現行操作指南
>
> 目的：把 StoryFlow 當成獨立 Codex Project 使用時，提供足夠的專案脈絡、權限邊界與交付流程，不必每次重新解釋整個網站。

## 建議的 Project 組成

只需要三個層次：

1. 根目錄 `AGENTS.md`：Codex 每次工作都必須遵守的正式規則。
2. 本文件：首次建立 Project、選擇工作方式與檢查交付結果。
3. `CODEX_PROMPT_LIBRARY.md`：常用任務的可複製提示詞。

不需要把私人 StoryFlow 資料夾、Google Docs、`settings.json`、`workspace.json`、`Works/` 或 `Recovery/` 加進程式碼 Project。

## 在 Codex 建立 Project

1. 將 GitHub repo `fancyblue/StoryFlow` clone 成獨立的本機專案，或在 Codex 儲存這個 repo 的專案路徑。
2. 讓 Project 根目錄就是含有 `AGENTS.md`、`index.html`、`app-loader.js` 的 StoryFlow repo 根目錄。
3. Git repo 預設使用 Codex worktree；只有你明確想直接使用目前 checkout 時才改用 local。
4. 確認 GitHub connector 登入帳號是 `fancyblue`。
5. 第一次工作先請 Codex 讀取 `AGENTS.md`、`README.md` 與任務相關的 `docs/` 文件，再檢查目前 `main`、開啟中的 PR 和 GitHub Pages 狀態。
6. 真實作品資料保持在使用者選擇的 StoryFlow 資料夾，不要放進 repo 或測試 fixture。

## 可貼入 Codex Project 的簡短 Instructions

如果 Codex Project 介面另有「Project instructions」欄位，可貼入下列文字。細節仍以 repo 根目錄 `AGENTS.md` 為準。

```text
這是 fancyblue/StoryFlow。每次任務先讀 repo 根目錄 AGENTS.md，並以它為正式規則。

請直接修改 StoryFlow repo，不要在其他創作專案路徑建立程式副本。GitHub 分支、PR 與合併使用 fancyblue 帳號。保護私人資料：不得提交 settings.json、workspace.json、Works、Recovery、OAuth 資訊、真實正文或私人圖片。

UI 變更要保持長文與圖文相同行為的一致性；同名動作應共用元件、位置和邏輯。破壞性操作必須先建立 Recovery，失敗即停止。依風險執行測試、同步相關文件、更新靜態資產 cache version，合併後確認 GitHub Pages 實際載入新版本。
```

## 每個新任務建議提供的資訊

Codex 最需要的是可驗收的差異，不是長篇背景。新任務盡量包含：

- **問題位置**：工作台／作品／發布／設定／搜尋。
- **目前行為**：現在看到什麼或哪一步失敗。
- **期望行為**：希望和哪個既有頁面或流程一致。
- **重現條件**：作品類型、資料狀態、視窗尺寸、手機／桌面。
- **視覺證據**：截圖可附，但文字指令仍寫在訊息中。
- **安全條件**：是否涉及刪除、檔案、Recovery、Google Docs。
- **完成條件**：是否要 PR、合併、部署與線上驗證。

## Codex 應採用的任務流程

```text
確認 main 與相關文件
  ↓
找出共用元件／資料責任，不先堆頁面特例
  ↓
建立 codex/<topic> 分支
  ↓
修改程式 + 相關文件 + 測試 + cache version
  ↓
靜態檢查與相關瀏覽器測試
  ↓
fancyblue PR
  ↓
CI 通過後合併
  ↓
確認 GitHub Pages 實際載入新版本
```

若 CI 抓到與本次變更無關的偶發失敗，可先單獨重跑並讀 log；不要為了變綠而放寬與本次需求直接相關的測試。

## 什麼時候開新 Codex Task

適合開新 Task：

- 新功能或新的資料模型。
- 與目前工作無關的 UI/UX 稽核。
- 大型文件整理或架構重構。
- 需要獨立比較多個方案。

適合在原 Task 繼續：

- 同一畫面的微調。
- PR／CI／部署尚未完成。
- 使用者提供同一問題的新截圖。
- 前一修正仍有一致性問題。

「繼續」表示沿用目前目標、分支與驗收條件，不代表擴大權限或跳過測試。

## Project 中不需要長期保存的內容

- 每次截圖的臨時說明檔。
- 已經整合進正式設計文件的重複草稿。
- 私人測試輸出與真實內容 fixture。
- 僅記錄單次聊天過程、沒有長期決策價值的工作日誌。
- 只為繞過 GitHub Pages 或 CI 問題而做的應用程式修改。

## 文件責任

- `README.md`：產品用途、使用與資料安全。
- `ARCHITECTURE.md`：模組與資料責任。
- `UI_SYSTEM.md`：可重用視覺與互動規則。
- `UX_FLOW.md`：跨頁流程與任務優先級。
- `VISUAL_CONTENT_MODE_DESIGN.md`：已完成的圖文 Phase 設計紀錄與候選觀察。
- `CHROME_ACCEPTANCE.md`：每次發版按需重跑的人工檢查，不是一次性完成清單。
- `CODEX_PROMPT_LIBRARY.md`：日常任務提示詞。

## 建議的日常起始提示

最短可以只說：

```text
請依 AGENTS.md 處理。先確認 main 與目前線上版本，再完成以下需求：
[需求]

完成時請同步相關文件、執行相應測試、用 fancyblue 建立並合併 PR，最後驗證 GitHub Pages。
```

若只要分析，不要修改，明確加上：「本次只評估與回報，不建立分支或修改檔案。」
