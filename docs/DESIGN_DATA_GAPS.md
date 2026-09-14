# 介面重新設計：資料結構缺口

> 狀態：**候選／待驗證** — 尚未授權實作。這份文件只記錄「介面設計過程中提出、但目前資料模型沒有」的需求，
> 供實作前逐項確認要不要做。任何一項在動工前都需要重新確認，不得因為它列在這裡就視為已核可。

介面提案本身不在 repo 內，是一份設計稿；這份文件只保留會影響 `content-model.js` 結構或既有行為的部分。

## 一、分平台覆寫的範圍

目前 `normalizeVisualEntry` / `normalizePublishItem`（`src/projects/content-model.js`）已支援兩個分平台欄位：

| 欄位 | 現況 | 備註 |
| --- | --- | --- |
| `platformTitles` | 已支援 | 每個平台可有自己的標題 |
| `platformHashtags` | 已支援 | 以 `keepEmpty: true` 正規化，所以「刻意不加標籤」與「沿用共用標籤」是兩種狀態 |

設計過程提出、但目前**沒有**的：

### 1. 分平台的「附上後記」開關

- 現況：`includeAfterword` 是單一 boolean（`content-model.js:97`、`publishing-flow.js:53`），一次決定所有平台。
- 需求：不同平台可各自決定要不要附後記。
- 影響：需要新增 `platformIncludeAfterword`（boolean record），並讓 `outputSections(part, platform, includeAfterword)` 依平台取值。
- 待確認：共用值與平台值的優先順序，以及是否需要像 hashtags 一樣的「刻意關閉」第三態。

### 2. 分平台的「複製時附上標題」開關

- 現況：平台預覽對話框的複製標題選項是單一設定，不隨平台保存。
- 需求：每個平台各自決定複製內容時要不要帶標題。
- 影響：需要 `platformCopyTitle`（boolean record），並與既有的 `outputWithTitle(part, platform, includeAfterword, titleStyle)` 串接。

### 3. 分平台的摘要

- 現況：`summary` 是單一字串（`content-model.js:92`），沒有 `platformSummaries`。
- 需求：不同平台可以有不同的摘要／描述。
- 影響：需要新增 `platformSummaries`（string record）。這是資料模型變更，不是介面問題——介面設計稿刻意沒有畫這個欄位。
- 待確認：是否所有平台都需要，或只有圖文模式需要。

## 二、發布佇列的排序

### 4. 「最新確認」與實際排序不符

- 現況：`publishing-flow.js:189` 依 `updatedAt || createdAt` 降冪排序，但畫面文案是「最新確認的文章顯示在最上面」（`publishing-flow.js:265`、`1418`）。
- 問題：改一篇已發布文章的後記會讓它跳到最上面，但使用者並沒有「確認」它。圖文模式的文案是「最近編輯的圖文顯示在最上面」，同一個排序卻有兩種說法。
- 兩個處理方向，擇一：
  - **只改文案**（零程式風險）：長文也改成「最近更新的顯示在最上面」，與圖文一致。
  - **改實作**：新增 `confirmedAt`，在「確認並存成 Markdown」時寫入，排序改用它。屬於資料模型變更。

### 5. 排序偏好可選

- 需求：發布佇列可在「最近更新」與「章節順序」之間切換。照章節順序發布是常見做法，目前做不到。
- 影響：需要保存排序偏好（歸在哪一層待確認：全域偏好或每個作品各自）。

## 三、作品清單的進度

### 6. 「未切字數」的來源

- 需求：作品清單要同時顯示「已發布」「已切未發」「還沒切」三段進度，才能表達一部連載常見的「原稿沒切完、切好的也沒發完」狀態。
- 現況：前兩段可由 `chapter.parts` 與 `platformStatus` 推導。第三段「還沒切的字數」需要確認能否由既有資料推導（章節總字數扣掉已建立篇的字數），或需要另外保存。
- 待確認：手動建立的章節、以及來源已變更但尚未重新切篇的章節，這個數字要怎麼算才不會誤導。

## 四、確認清單

實作前逐項確認，不要整批視為已核可：

- [ ] 1. `platformIncludeAfterword`
- [ ] 2. `platformCopyTitle`
- [ ] 3. `platformSummaries`
- [ ] 4. `confirmedAt`，或只改文案
- [ ] 5. 發布佇列排序偏好
- [ ] 6. 未切字數的計算方式

每一項通過後，才更新 `docs/ARCHITECTURE.md` 的資料所有權說明與 `docs/UX_FLOW.md` 的任務順序。
