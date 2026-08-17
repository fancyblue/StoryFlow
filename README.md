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

## 本機資料

```text
StoryFlow/
├─ settings.json      # Google Client ID、Picker API Key、平台與排版設定
├─ workspace.json     # 作品、章節、切篇與發布進度
└─ Works/
   └─ <作品>/<章節>/*.md
```

Google access token 不寫入 `settings.json`；為了讓單純重新整理頁面時不必再次登入，只會短暫存在目前瀏覽器工作階段的 `sessionStorage`。登出會清除該工作階段 token 與已記住的資料夾連線資訊，但不會刪除 StoryFlow 資料夾內的檔案。
