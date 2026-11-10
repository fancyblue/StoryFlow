# 手機直接讀寫 Google Drive：規劃

> 狀態：**候選／待驗證**（2026-11-10）— 尚未授權實作。這份文件記錄手機改走 Google Drive API 的分階段規劃與待作者決定的問題；
> 任何一階段要動工，都要先解決「決定與待決定」一節中仍待決定的項目，並由作者確認開始。現行行為仍以
> `docs/ARCHITECTURE.md`、`docs/UX_FLOW.md`「Phone editing」與 `privacy.html` 為準。

## 背景

作者的 StoryFlow 資料夾放在 Google Drive。電腦上 Drive 以磁碟掛載，讀寫是本機檔案速度；手機上則是用
Files by Google 選取資料夾，File System Access 經由 Android 的儲存空間存取架構（SAF）交給 Google Drive app 提供檔案，
每個檔案操作都要經過 Drive app。

實測（2026-11）：

- `workspace.json` 約 335 KB。
- #180 之前，手機存檔一次約 7 秒，主要是約 10 次依序執行的 SAF 操作（讀回比對、寫入、備份、文章檔）。
- #180、#183 之後，存檔立即回應，文章 Markdown 延到關閉「管理發布」時才寫；但開啟工作資料、按「開始編輯」後重新載入仍要等 Drive app。
- Drive app 提供的內容不一定是雲端最新版；電腦剛存的變更可能還沒同步到手機的 Drive app。

## 目標

手機改用 Google Drive API 直接讀寫雲端的 `workspace.json`，不經 Drive app：

- 載入更快，而且永遠讀到雲端最新版。
- 電腦端行為完全不變，仍讀寫使用者選取的資料夾。
- 不增加 Google 權限範圍：只用既有的 `drive.file`，由作者以 Picker 指定一次 `workspace.json`。

## 分階段

### 第 0 階段：量測

在「設定 → 手機使用模式」顯示載入與存檔的分段耗時（取得檔案、讀取、解析；存檔的讀回比對與寫入）。
先用真實裝置確認時間花在哪裡，再決定後續階段是否值得做。

驗收：手機上能看到每一次載入與存檔的總時間與分段時間；不寫入任何新檔案。

### 第 1 階段：只讀取

- 作者在「手機使用模式」以 Picker 選一次 Drive 上的 `workspace.json`（`drive.file`，不新增權限）；StoryFlow 只記住檔案 id。
- 手機開啟時，以及「開始編輯」重新載入時，先從 Drive API 讀取；拿不到時（沒有登入權杖、401、網路失敗、內容驗證失敗）退回資料夾，並顯示原因。
- 寫入仍走資料夾，因此既有的 revision 比對照常把關：Drive 讀到的版本比資料夾新或舊，都會在存檔前被擋下，不會覆蓋。
- 權杖過期時提醒作者重新登入（決定 4）；其他原因拿不到時才退回資料夾。
- 「手機使用模式」顯示「上次載入：Google Drive · N.N 秒」或「資料夾 · N.N 秒（原因）」，並可「改回從資料夾讀取」。

驗收：同一份工作資料，在真實手機上 Drive 的「上次載入」時間明顯短於資料夾；權杖過期、檔案被移除、網路中斷時都能退回資料夾並說明原因。

原型：commit `1f2fa07`（Phone: read workspace.json straight from Google Drive once it is named）已完整實作此階段（`integrations.js` 的
`readWorkspaceFromDrive`、`google-docs.js` 的 `readDriveFileText` / `pickDriveWorkspaceFile`、`mobile-safe-mode.js` 的
`renderDriveSource`，以及測試與文件），之後依作者要求先撤回，未在 main 上。動工時可從該 commit 開始。

### 第 2 階段：發布資料經 Drive 寫入

只涵蓋手機目前可編輯的發布輔助資料（摘要、Hashtags、後記、發布紀錄）。

- **衝突檢查**：寫入前取得 Drive 檔案目前的版本（`version` / `headRevisionId`），與載入時記下的不同就停下，要求重新載入，不覆蓋。
- **備份**：寫入前把目前的 Drive revision 標記為 `keepForever`，作為這次變更的 Recovery 點；標記失敗就不寫入（對應 AGENTS.md「Recovery 建立失敗就停止」）。需確認這是否足以取代資料夾內的 `Recovery/` 快照。
- **文章匯出檔**：由手機寫出，不留給電腦（決定 1）；寫法依決定 1 的甲或乙。
- **政策文字**：`privacy.html` 與 AGENTS.md 目前寫「StoryFlow 不修改 Drive 檔案」，改為「只修改作者指定的那一份 `workspace.json`」（決定 3），與實作同一個 PR。
- 寫入後仍要等 Drive API 回應成功才顯示「已儲存」。

驗收：電腦與手機交錯編輯時，舊版本的寫入一律被擋下；寫入失敗、備份失敗、權杖過期都有瀏覽器測試覆蓋失敗與回復邊界；手機寫出的文章匯出檔與在電腦上編輯同一篇的結果相同。

### 第 3 階段（之後再議）

讀寫都直接走雲端、衝突檢查可靠之後，再評估是否放寬手機的唯讀限制（例如手機也能編輯文稿以外的更多內容）。
這一階段不在本規劃的授權範圍內，需要另外提案。

## 決定與待決定

作者 2026-11-10 的回覆：

1. **文章檔不可留給電腦補產生。**（已決定）手機改了發布資料，該篇的匯出檔（`Works/<作品>/<章節>/<文章>.md`、
   圖文的 `content.md` / `metadata.json`）要由手機自己寫出。`drive.file` 無法改寫這些檔案，因此寫法待選：
   - 甲：`workspace.json` 走 Drive API，文章匯出檔仍在關閉「管理發布」時經資料夾寫出（即目前 #183 的做法）。不需新權限，但這一步仍是現在的速度。
   - 乙：新增 `drive` 權限（可讀寫整個 Drive），兩者都走 Drive API。最快，但權限最大，`privacy.html` 要大幅改寫。
2. **Drive 版本紀錄作為備份**：待作者看過說明後決定。Drive 會為每個檔案保留過去的版本（Drive 網頁上的「管理版本」）；
   一般檔案的舊版本預設約 30 天或 100 個版本後自動清除，標記 `keepForever` 的版本則永久保留。另一個做法是寫入前照現在的方式，
   在資料夾的 `Recovery/` 留一份快照（需經資料夾或 Drive API 寫一個新檔案；`drive.file` 可以建立新檔案）。
3. **政策改為「只修改作者指定的 `workspace.json`」**：同意。（已決定；若第 1 項選乙，範圍要再擴大，需另外確認文字。）
4. **手機上 Google 權杖過期**：整個改走 Google Drive 後，提醒作者重新登入，不退回資料夾。（已決定；第 1 階段讀取也照此處理。）

## 風險

- **同步延遲與交錯編輯**：電腦存檔後 Drive 需要時間上傳；這段時間手機讀到的仍是舊版。revision 檢查會擋下覆蓋，但偶爾會出現「存檔被擋下，需要重新載入」。
- **只能在真實裝置驗證**：Playwright 無法重現 Drive app 的 SAF 延遲，也無法使用真實的 Google 權杖；自動測試只能以假的 Drive 回應覆蓋流程與失敗邊界，速度改善要靠作者在手機上確認。
- **權杖壽命**：Google 存取權杖約一小時過期，手機上要重新登入（跳出 Google 視窗）才能繼續讀寫。
