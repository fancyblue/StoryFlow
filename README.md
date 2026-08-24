# StoryFlow

StoryFlow 是一個以瀏覽器執行的長篇內容切篇與多平台發布工作台。程式可以部署在 GitHub Pages；文章、工作進度與個人 Google 整合設定保存在使用者自行選擇的 StoryFlow 資料夾。

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

## 本機資料

```text
StoryFlow/
├─ settings.json      # Google Client ID、Picker API Key、平台與排版設定
├─ workspace.json     # 作品、章節、切篇與發布進度
├─ workspace.backup.json # 最近一次正常寫入前的工作區備份
├─ Recovery/         # 衝突副本、損壞原檔與被取代版本
└─ Works/
   └─ <作品>/<章節>/*.md
```

StoryFlow 只會在 `workspace.json` 實際寫入完成後顯示「已同步」；尚未連接資料夾、正在同步或寫入失敗都會分別顯示。所有工作區寫入都依序執行，並在改寫前把最近正常版本保存為 `workspace.backup.json`。若其他分頁或裝置先寫入了較新版本，StoryFlow 會停止覆蓋，並將本頁修改另存到 `Recovery/`。

當 `workspace.json` 無法解析時，頁面會自動開啟恢復介面：可一鍵從備份恢復，或匯入既有 `workspace.json` / `workspace.backup.json`。恢復前會先把損壞原檔留在 `Recovery/`。從 Google Docs 更新章節後，同一次開啟頁面期間也可用「復原來源更新」立即回到更新前的章節。

Google access token 不寫入 `settings.json`；為了讓單純重新整理頁面時不必再次登入，只會短暫存在目前瀏覽器工作階段的 `sessionStorage`。「離開此裝置」會清除該瀏覽器中的 token、暫存整合設定、`storyflow.*` 瀏覽器狀態與已記住的資料夾連線資訊，但不會修改或刪除 StoryFlow 資料夾內的 `settings.json`、`workspace.json`、`workspace.backup.json`、`Recovery/` 或作品 Markdown。離開後可以重新連接既有 StoryFlow 資料夾，或匯入 `settings.json` 快速恢復 Google 整合設定。
