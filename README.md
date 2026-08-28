# StoryFlow

StoryFlow 是一個以瀏覽器執行的長篇內容切篇與多平台發布工作台。程式可以部署在 GitHub Pages；文章、工作進度與個人 Google 整合設定保存在使用者自行選擇的 StoryFlow 資料夾。

> 圖文內容維護模式的產品、Phase 狀態與技術決策見 [`docs/VISUAL_CONTENT_MODE_DESIGN.md`](docs/VISUAL_CONTENT_MODE_DESIGN.md)。Phase 1 圖文 MVP 已開放：建立作品時可選擇「圖文系列」，並維護文字、私人圖片、封面、圖說、替代文字、順序與基本預覽；整合發布仍屬 Phase 2。

建立圖文系列後，工作台會切換成獨立的圖文編輯介面，不顯示 Smart Split。每則圖文使用固定 ID 儲存在 `Works/<作品>/Visual/<entry-id>/`，改名不會移動圖片；刪除圖文前會建立 Recovery，預設保留私人 assets 圖檔。手機唯讀模式可以閱讀與預覽，但不允許新增、匯入、排序、刪除或保存。

SMART SPLIT 預設只在原稿的場景分隔點提出切篇建議，並可用「少一個場景／多一個場景」快速調整。遇到單一場景過長時，可在「切篇確認」開啟「手動微調」，拖曳「這一篇結束」或直接點選任一段落間的位置；切點只吸附在段落之間，會即時更新本篇與後續字數，而且不會改寫原稿。手動微調只作用於目前尚未確認的文章，不會回溯重切已建立或已發布的文章。

發布排版中的「段落間空一行」只控制一般段落間距，不會刪除原稿的場景邊界。即使關閉段落空行，啟用場景分隔符時仍會輸出符號；若同時關閉場景分隔符，場景之間仍至少保留一個空白行，避免前後場景被黏在一起。

發布頁中的每篇文章可另外保存一則後記。後記屬於發布稿資料，不會回寫 Google Docs 或混入來源正文，字數也與正文分開顯示；平台預覽與複製時可選擇是否附上。來源更新會保留既有後記，刪除或退回重新切篇時則會先提示受影響的後記數量。

每個平台也可保存一筆輕量發布紀錄：發布時間與選填的文章網址。保存紀錄會同步把該平台標為已發布；取消已發布時會明確提示並清除這筆紀錄。這不是排程或平台串接，StoryFlow 不會自動登入發布平台。

文章可另設「發布標題」供讀者看到，同時保留內部文章名稱與既有 Markdown 檔名。發布預覽會把標題和內容分開顯示、分開複製；留白則自動沿用內部名稱。

側欄的「搜尋」或 `⌘ K`（Windows / Linux 自動顯示為 `Ctrl K`）可跨目前工作區內的作品、章節、內部名稱與發布標題快速跳轉；手機／觸控介面會隱藏鍵盤提示。正文搜尋預設關閉，需要時才勾選「同時搜尋正文」；搜尋索引只在當下記憶體建立，不會把私人內容另存進 GitHub Pages 或瀏覽器儲存空間。

發布文章也可「匯入圖片」。檔案來源可以是桌面、Google Drive、iCloud 或作業系統檔案選擇器提供的位置；瀏覽器會把 JPG、PNG、WebP 或 GIF 複製到私人 StoryFlow 資料夾，不會上傳到 GitHub Pages。每張圖片可保存替代文字、圖說與正文前／正文後／後記後位置，並在發布預覽中顯示、放大或複製 Markdown。平台的「複製內容」不會傳送圖片檔，實際發布時仍需依預覽順序逐張上傳。

## Clone / Fork 後使用

Repo **不包含任何人的 Google OAuth Client ID 或 Picker API Key**。每個使用者可以使用自己的 Google Cloud 專案，不需要修改程式碼。

第一次使用：

1. 在 Google Cloud 建立自己的 Web OAuth Client ID，並把實際使用 StoryFlow 的網址 origin 加到 Authorized JavaScript origins（例如自己的 GitHub Pages 網址，或本機開發伺服器 origin）。
2. 啟用 StoryFlow 所需的 Google Docs / Picker 相關 API，建立 Picker API Key。
3. 開啟 StoryFlow，選擇一個本機 `StoryFlow` 資料夾。
4. 到「設定 → Google 整合」填入 OAuth Client ID 與 Picker API Key，按「保存 Google 整合設定」。
5. 設定會寫入該資料夾的 `settings.json`，之後不需要把個人設定 commit 到 repo。

OAuth Client ID 對 Web 應用本身不是 client secret，但把它從 repo 設定移出去可以讓 fork / clone 的使用者更容易帶入自己的 Google Cloud 專案，也避免不同部署共用同一組 OAuth 設定。

## 手機 / 新裝置

Google OAuth 在取得 Drive / Docs 存取權之前就必須知道 Web OAuth Client ID，所以 StoryFlow 不能「先登入 Google，再從私人 Drive 讀取包含 Client ID 的 settings.json」。

手機或新裝置可以改用「設定 → Google 整合 → 匯入 settings.json」：StoryFlow 會開啟瀏覽器的系統檔案選擇器，不需要先經過 StoryFlow 的 Google OAuth。若手機已把 Google Drive 加入系統檔案來源，可以直接從 Drive 選取 `settings.json`。載入後即可按「登入 Google」。

匯入後，Google Client ID 與 Picker API Key 只會為目前瀏覽器工作階段保留一份 bootstrap 設定，讓單純重新整理不需要重新選檔；關閉該瀏覽器工作階段後可以再次匯入。文章內容不會因此寫進瀏覽器儲存空間。

手機開啟 StoryFlow 時預設為唯讀，避免 Google Drive 在只限 Wi-Fi 傳輸或尚未下載最新版時，讓舊的 `workspace.json` 覆蓋新檔。主畫面只顯示精簡的「唯讀」狀態；唯讀時仍可重新連接資料夾、匯入 `settings.json` 與閱讀內容，但不會寫入 workspace、settings 或作品 Markdown。確定 Drive 已完成上傳／下載後，可到「設定 → 手機使用模式」開啟本次編輯；StoryFlow 會先從資料夾重新載入 `workspace.json`，只有載入成功且沒有 Recovery／版本衝突才會解鎖。也可在同一處先保存再切回唯讀；權限只維持目前頁籤工作階段，關閉頁籤後再次回到唯讀。

## 本機資料

```text
StoryFlow/
├─ settings.json      # Google Client ID、Picker API Key、平台與排版設定
├─ workspace.json     # 作品、章節、切篇、發布標題、後記、發布進度與平台發布紀錄
├─ workspace.backup.json # 最近一次正常寫入前的工作區備份
├─ Recovery/         # 循環備份、衝突副本、高風險操作快照與刪除圖片備份
└─ Works/
   └─ <作品>/<章節>/
      ├─ *.md
      ├─ metadata.json
      └─ assets/<文章固定 ID>/*.{jpg,jpeg,png,webp,gif}
```

StoryFlow 只會在 `workspace.json` 實際寫入完成後顯示「已保存」；尚未連接資料夾、準備保存、保存中或寫入失敗都會分別顯示。所有工作區寫入都依序執行，並在改寫前把最近正常版本保存為 `workspace.backup.json`。

為了提供個人使用剛好足夠的保護，內容有變更時，StoryFlow 每小時最多在 `Recovery/` 建立一份 `workspace.auto-*.json` 循環備份；相同內容不重複建立，並只保留最近 3 份。刪除作品、章節或發布稿，以及套用來源覆寫、匯入工作區或從備份恢復前，也會先建立獨立 Recovery 快照；若快照建立失敗，刪除或覆寫會停止。這些安全副本不會修改 Google Docs 原稿。

若其他分頁或裝置先寫入了較新版本，StoryFlow 會停止覆蓋，並將本頁修改另存到 `Recovery/`。

圖片本體不會塞入 `workspace.json`；工作區只保存私人相對路徑、尺寸、替代文字、圖說、位置與順序。同名圖片會自動產生唯一檔名，超過 8 MB 會提示但不阻止匯入。從文章移除圖片時可選擇保留檔案；若選擇刪除檔案，StoryFlow 會先複製到 `Recovery/Assets/`。刪除整篇文章時也會保留 assets 圖檔，避免文章操作意外刪除原圖。

當 `workspace.json` 無法解析時，頁面會自動開啟恢復介面：可一鍵從備份恢復，或匯入既有 `workspace.json` / `workspace.backup.json`。恢復前會先把損壞原檔留在 `Recovery/`。從 Google Docs 更新章節後，同一次開啟頁面期間也可用「復原來源更新」立即回到更新前的章節。

Google access token 不寫入 `settings.json`；為了讓單純重新整理頁面時不必再次登入，只會短暫存在目前瀏覽器工作階段的 `sessionStorage`。「離開此裝置」會清除該瀏覽器中的 token、暫存整合設定、`storyflow.*` 瀏覽器狀態與已記住的資料夾連線資訊，但不會修改或刪除 StoryFlow 資料夾內的 `settings.json`、`workspace.json`、`workspace.backup.json`、`Recovery/` 或作品 Markdown。離開後可以重新連接既有 StoryFlow 資料夾，或匯入 `settings.json` 快速恢復 Google 整合設定。

StoryFlow 是私人單人使用工具，測試採風險導向：一般文字、文件或單一樣式調整只需靜態檢查、相關測試與受影響畫面確認，不必每次重跑完整瀏覽器套件、多尺寸視覺基準或全份人工驗收。涉及檔案寫入、Recovery、刪除、來源同步、切篇輸出或發布資料等可能影響作品安全的變更，才維持完整或相應的高風險驗證。細節見 [`tests/README.md`](tests/README.md)。

需要檢查真實 Chrome File System Access 行為或準備大型發版時，使用專用測試資料夾並依照 [`docs/CHROME_ACCEPTANCE.md`](docs/CHROME_ACCEPTANCE.md) 的相關章節執行；請勿使用真實作品資料做破壞性測試。
