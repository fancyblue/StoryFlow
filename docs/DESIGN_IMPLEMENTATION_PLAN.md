# 介面重新設計：實作順序

> 狀態：**候選／待驗證** — 尚未授權實作。這份文件排的是「如果要做，用什麼順序做」，
> 不是已核可的工作項。設計稿見對話中的提案連結；資料結構與使用案例差異見
> [`DESIGN_DATA_GAPS.md`](DESIGN_DATA_GAPS.md)。

## 排序原則

順序不是照影響力排的，是照**相依性與風險**排的：

1. **顏色改不動，除非先 token 化。** 8,642 行 CSS 裡有 1,110 處硬寫色碼、422 種不重複顏色，
   而 `var()` 只用了 450 次。顏色不是從 token 讀的，所以直接改 token 會有一大半不生效。
   （另外那 2,905 個 `!important` 是**不同**的問題，不擋換色——見下方「插曲」。）
2. **cascade 不可靠。** `ensureThemeOrder()`（`src/settings/settings-page.js`）與兩個 `ensureStyleLast()`
   在 runtime 重排 stylesheet，所以「看起來在最後」的規則可能會輸。動任何 stylesheet 順序都要同步更新
   `scripts/cascade-order.json`，否則 `tests/browser/cascade-contract.spec.js` 會失敗。
3. **視覺回歸只保護四個畫面。** `tests/browser/visual-regression.spec.js` 只有
   `workspace-long`（1280/1440/1920）、`works-library-1440`、`publishing-queue-1440`、`settings-1440`。
   **圖文工作台、管理發布、平台預覽、所有對話框都沒有基準截圖**，在那些地方「像素不變」無法自動證明。
4. **每個改到靜態資產的 PR 都要更新 cache query**，否則 `npm run test:assets` 失敗。
   用 `npm run bump:assets` 依 git diff 自動處理。

---

## 階段 0 · 不等任何決策，現在就能做

與設計提案無關，各自獨立，做完即有價值。

### 0-1　側欄收合狀態持久化
- **問題**：收合功能已存在（250px → 76px），但 `src/ui/navigation.js:169` 只 toggle 一個 class，
  重整就回到展開。等於這個功能每次都要重按。
- **做法**：沿用既有寫法（`src/core/app.js:83` 已有 `localStorage` 模式）保存收合狀態，啟動時還原。
- **風險**：極低。**驗證**：手動重整一次即可；順帶確認 `sidebar-collapsed` 在行動版斷點下不生效。

### 0-2　修正「最新確認的文章顯示在最上面」
- **問題**：`src/publishing/publishing-flow.js:189` 依 `updatedAt || createdAt` 排序，不是確認時間。
  改一篇已發布文章的後記會讓它跳到最上面。圖文模式同一個排序卻寫「最近編輯的圖文顯示在最上面」。
- **做法**：長文文案（`publishing-flow.js:265`、`1418`）改成與圖文一致的「最近更新」。
- **不做**：真的依確認時間排序需要新增 `confirmedAt`，那是資料模型變更，見 GAPS 第 4 項。
- **風險**：零（純文案）。**驗證**：`npm run test:static`。

### 0-3　補上缺的基準截圖
- **理由**：階段 1 的「零風險」保證靠的是視覺回歸，但目前只涵蓋四個畫面。
- **做法**：為圖文工作台、管理發布、平台預覽對話框加上 `toHaveScreenshot`。
- **風險**：低，但會拉長 CI 時間。**這一項若不做，階段 1 在那些畫面上就只能人工驗收**
  （`docs/CHROME_ACCEPTANCE.md`）。

---

## 階段 1 · 顏色收斂進 token（畫面不變）

所有視覺變更的前置作業。**此階段的目標是像素完全不變。**

- **做法**：把 422 種硬寫顏色對應回 `--sf-*`。**`!important` 原封不動保留**——
  `color:#bd6873!important` 改成 `color:var(--sf-danger)!important` 一樣生效，token 化的目的就達到了。
- **不要做**：不要在這個階段順手清 `!important`。那是另一個問題，不在換色的關鍵路徑上，
  混在一起會讓「像素零差異」這個驗證條件失去意義——分不出差異是換值造成的還是移除造成的。
- **工具**：`node scripts/dead-declarations.mjs` 目前回報 **0 個可移除宣告**（已經清過了），
  所以這一階段沒有自動化捷徑，是人工對照。
- **建議切法**：一個 PR 一個 domain 檔，不要一次全改。`styles/domains/publishing.css`（170 處硬寫色碼）
  最大，單獨一個 PR。
- **驗證**：`npm test` 全跑，視覺回歸必須零差異。有差異就是改錯了，不要更新基準。

---

## 插曲 · `!important` 為什麼不是一個階段

2,905 個 `!important` 是這份 CSS 最刺眼的數字，但它**不擋任何一件事**，所以它不在上面的順序裡。
原因是它和「顏色硬寫」是兩個不同的問題，只是住在同一批檔案裡：

| 問題 | 數量 | 修法 | 是換色的前置嗎 |
| --- | --- | --- | --- |
| 硬寫色碼 | 1,110 處 / 422 種 | 值換成 `var(--sf-*)` | **是**。不做就換不了色 |
| `!important` | 2,905 個 | 移除宣告且不改變計算結果 | **否**。帶著 `!important` 的 `var()` 一樣生效 |

分布（實際出現次數，非行數）：

| 檔案 | 數量 | 佔比 |
| --- | --- | --- |
| `styles/layers/ui-system.css` | 493 | 17% |
| `styles/domains/workspace-ux.css` | 283 | 10% |
| `styles/layers/layout-integrity.css` | 231 | 8% |
| `styles/domains/publishing.css` | 181 | 6% |
| `styles/layers/theme.css` | 162 | 6% |
| 其餘 | ~1,555 | 53% |

分成三類處理，都不排進主線：

### A. 換色後會自然消失的（`theme.css`，162 個）

`theme.css` 現在的角色是「用 `!important` 一條一條蓋掉 `foundation.css` 的紫色底稿」
（`--primary:#6d4aff` 那層還在）。階段 3 把正確的值寫進 token 之後，這些覆蓋就失去存在理由，
整層可以大幅縮減。**當成階段 3 的收尾，不另外排。**

### B. 可以用實驗清掉的（`ui-system.css` + `layout-integrity.css`，724 個，25%）

這兩個檔案由 `ensureThemeOrder()` 在 runtime 重新附加到很後面，所以它們的 `!important`
**多數可能是多餘的——它本來就贏**。這是可驗證的假設，不是推測：

> 移除一批 `!important` → 跑視覺回歸 → 零差異就代表原本就贏，可以刪。

但 `ui-system.css` 並非真正最後：兩個 `ensureStyleLast()` 會把
`project-source-mode.css` 與 `source-article-ux.css` 移到它後面，而且那兩者的先後**在使用中會互換**
（見 `docs/UI_SYSTEM.md`）。所以逐批實驗、逐批驗證，不要整檔一次移除。

**可以排在階段 1 完成後的任何時候，與視覺工作平行。**

### C. 其餘約 1,900 個

不排期。改到哪個檔案，順手清那個檔案的。硬排一個「清完 `!important`」的大 PR
沒有使用者可見價值，而且風險與工作量都不成比例。

---

## 階段 2 · 字型與字重（改善幅度最大，且獨立於配色）

- **2-1　CJK 字型堆疊**：`styles/layers/foundation.css:20` 目前只有
  `Inter` 加一串**西文** fallback，沒有任何中文字型。這是一個純中文寫作工具最大的排版缺口。
- **2-2　字重收斂**：目前用了 13 種字重，其中 `800` 用 83 次、`850` 用 29 次。中文沒有 800 字面，
  瀏覽器合成偽粗體，小字級下會糊。收成 400 / 500 / 700 三種。
- **2-3　正文排版**：切篇預覽與發布預覽是最常看的畫面，但 `.sf-preview-rendered-root` 只寫了
  `font-family:inherit`。給它自己的字級、行高與行寬（16px / 1.8 / 36em）。
- **驗證**：視覺回歸**會**有差異，這是預期的——逐張確認後更新基準。

---

## 階段 3 · 配色與去框

token 就位後，這一步是改幾十行的事。

- **3-1**　換上紙墨色票與主色（預設黛 `#4B4557`；候選色見設計稿頁首的切換器）。
- **3-2**　全平面：移除稿面、對話框、浮層的投影，改靠色階與細線分層。
- **3-3**　拆掉章節列、統計、作品列的卡片框，改用留白與細線。
- **驗證**：視覺回歸全面變更，逐張確認後更新基準；同時跑
  `docs/CHROME_ACCEPTANCE.md` 的人工清單。

---

## 階段 4 · 版面與結構（各自獨立的小 PR）

彼此不相依，可以分開排程。

| # | 項目 | 主要檔案 | 備註 |
| --- | --- | --- | --- |
| 4-1 | 導覽順序改「作品 · 工作台 · 發布」，作品為預設落地頁 | `index.html`、`src/ui/navigation.js` | 改寫 UX_FLOW 的頁面順序 |
| 4-2 | 連線狀態移進導覽底部；搜尋與設定移出目的地清單 | `index.html`、`styles/domains/connection-status.css` | 現有三個設定入口要一併收斂 |
| 4-3 | 統計從橫跨右欄移進切篇預覽，改成一條進度線 | `styles/layers/foundation.css`、`workspace.css` | 四個數字都是章節層的 |
| 4-4 | 作品頁與發布頁共用「作品 › 章節 › 篇」清單元件 | `chapter-management.js`、`publishing-grouping.js`、`works-library-ux.js` | 本階段最大的一項，建議單獨排 |
| 4-5 | 發布篩選依語意分組；排序控制 | `publishing-flow.js` | 排序偏好要保存 → 見 GAPS 第 5 項 |
| 4-6 | 空狀態與首次使用關卡 | `connection-ui.css`、`quick-start.js` | 必須守 UX_FLOW W-06：空狀態只有一個實心動作 |

---

## 階段 5 · 功能性重構（風險最高，最後做）

- **5-1　讀稿檢視 + 接縫檢視合併，移除 `reviewDialog`**
  - 動到 `src/ui/workspace-interactions.js`（對話框本體）、`workspace-ux.js`、
    `src/split/boundary-engine.js`（手動微調不再是模式）、
    `styles/domains/workspace-ux.css` 的整組 `.manual-boundary-active` 規則。
  - 這是唯一會刪掉既有使用者流程的一項，務必先確認。
- **5-2　管理發布改成兩欄**（左稿右平台軌），平台預覽改為左欄原地切換而非再開對話框。
- **5-3　圖片依 `placement` 分組顯示**，並常駐「圖片不會隨複製內容送出」的說明。
- **5-4　圖文編輯器去框**，摘要從發布預覽對話框移回編輯器。

---

## 被決策擋住的

以下在 [`DESIGN_DATA_GAPS.md`](DESIGN_DATA_GAPS.md) 逐項確認之前**不要開工**：

- 分平台的「附上後記」「複製時附上標題」「摘要」（GAPS 1–3）
- `confirmedAt`（GAPS 4，階段 0-2 只改文案不碰這個）
- 發布佇列排序偏好的保存位置（GAPS 5，擋住 4-5）
- 「未切」的計算方式，以及「最新那一個還沒切的章」的定義（GAPS 6，擋住作品列的進度與主要動作）

**來源相關維持現狀**：`project.sourceDocId` 的推導行為與作品列的來源顯示不在本次範圍內。

---

## 每個 PR 的完成條件

依 `AGENTS.md`：

- [ ] 改到靜態資產 → `npm run bump:assets`，且 `npm run test:assets` 通過
- [ ] `npm run test:static` 通過
- [ ] 動到 stylesheet 順序 → `scripts/cascade-order.json` 同步更新，cascade 契約測試通過
- [ ] 視覺回歸：階段 1 必須零差異；階段 2 之後逐張確認才更新基準
- [ ] 行為、架構或已完成設計階段有變 → 同一個 PR 更新對應文件
      （採用了 GAPS 第五節列出的使用案例差異時，同步更新 `docs/UX_FLOW.md` 的那幾列）
