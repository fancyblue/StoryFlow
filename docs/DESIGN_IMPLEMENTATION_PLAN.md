# 介面重新設計：實作順序

> 狀態：**候選／待驗證** — 尚未授權實作。這份文件排的是「如果要做，用什麼順序做」，
> 不是已核可的工作項。設計稿見對話中的提案連結；資料結構與使用案例差異見
> [`DESIGN_DATA_GAPS.md`](DESIGN_DATA_GAPS.md)。

## 排序原則

順序不是照影響力排的，是照**相依性與風險**排的：

1. **顏色改不動，除非先 token 化。** 但規模跟原本估的差很多，見階段 1 的實測。
   （另外那些 `!important`——動工時 2,905 個，2026-10-15 重量為 2,581 個，B 類第一批後 2,191 個，A 類之後 2,101 個，B 類第二批後 2,089 個，移除舊來源按鈕列後 2,015 個，移除執行期不存在的元素的規則再少 11 個——是**不同**的問題，不擋換色——見下方「插曲」。）
2. **cascade 不可靠。** `ensureThemeOrder()`（`src/settings/settings-page.js`）與兩個 `ensureStyleLast()`
   在 runtime 重排 stylesheet，所以「看起來在最後」的規則可能會輸。動任何 stylesheet 順序都要同步更新
   `scripts/cascade-order.json`，否則 `tests/browser/cascade-contract.spec.js` 會失敗。
3. **視覺回歸的涵蓋範圍**（0-3 完成後）：`workspace-long`（1280/1440/1920）、`works-library-1440`、
   `publishing-queue-1440`、`settings-1440`、`publishing-detail-1440`、`platform-preview-1440`、
   `visual-workspace-1440`。**仍未涵蓋**：手動章節編輯、來源比對、備份中心與其餘對話框，
   那些地方「像素不變」還是只能人工驗收（`docs/CHROME_ACCEPTANCE.md`）。
4. **每個改到靜態資產的 PR 都要更新 cache query**，否則 `npm run test:assets` 失敗。
   用 `npm run bump:assets` 依 git diff 自動處理。

---

## 階段 0 · 不等任何決策，現在就能做

與設計提案無關，各自獨立，做完即有價值。

### 0-1　側欄收合狀態持久化　✅ 已完成
- **原本的問題**：收合功能已存在（250px → 76px），但只 toggle 一個 class，重整就回到展開。
- **做了什麼**：`src/ui/navigation.js` 的 `readSidebarCollapsed()`／`rememberSidebarCollapsed()`
  把狀態存在 `localStorage` 的 `storyflow.ui.sidebarCollapsed`，啟動時還原。
  刻意**不放進 `state.ui`**：`switchProject()` 會整個換掉 `state`，放在那裡每次切作品都會重新展開。
  儲存空間不可用時（私密視窗、封鎖網站資料）只會失去記憶，按鈕照常運作。
- **行動版**：不需要額外判斷——所有 `.sidebar-collapsed` 規則都在 `sidebar-layout.css` 的
  `@media (min-width: 821px)` 裡，窄版面還原這個 class 不會有作用。
- **規範**：寫在 `docs/UI_SYSTEM.md` 的側欄收合段落。目前沒有瀏覽器測試覆蓋重整後的還原，
  靠 `docs/CHROME_ACCEPTANCE.md` 的側欄收合項目人工驗收。

### 0-2　~~修正「最新確認的文章顯示在最上面」~~ · 查證後不需要做

動工前重讀程式，發現這一項的前提是錯的：長文與圖文用的是**兩段不同的排序**，
而且各自的文案都正確。詳見 GAPS 第 4 項的更正。**這一項移除，不要照原本的描述去改文案**
——把長文改成「最近更新」反而會變成錯的，長文的順序完全不受 `updatedAt` 影響。

### 0-3　補上缺的基準截圖　✅ 已完成

三張新基準加在既有測試已經走過的路徑上，沒有新增流程：

| 基準 | 涵蓋 |
| --- | --- |
| `publishing-detail-1440.png` | 「管理發布」展開後的平台面板——發布補充內容、各平台列與其動作 |
| `platform-preview-1440.png` | 桌面寬度的發布預覽（5-2 之後是列內的預覽面板，不再是對話框） |
| `visual-workspace-1440.png` | 圖文工作台（清單 + 編輯器） |

一併修掉一個潛在的間歇失敗：`.visual-autosave-status` 會印出時鐘（「已儲存 10:57」），
基準裡帶著當下時間，下一次執行就會跟自己差異。它現在和 `.save-state` 一起被隱藏。

圖文工作台只在 1440 取一張，不是三個寬度各一張——迴圈本來就已經在每個桌面寬度驗過版面，
多兩張只是拉長執行時間，證據並沒有變多。

> **已確認**：這三張是用容器內的 Chromium **1194** 產生的，而專案釘的
> `@playwright/test@1.62.1` 在 CI 會抓 **1234**。「容器產生、CI 驗證」這個組合之後已經實測：
> CI 的 `chromium-smoke` 每次都對全部基準跑 `npm run test:browser`，`main` 上 #103 到 #122
> 每一次都通過，包括 #117、#118 重新產生基準之後。
> `maxDiffPixelRatio: 0.025` 吸收得掉版本差異，而且這個容差是刻意保留的（理由見階段 3 的說明，
> 精確度改由 `tests/browser/cascade-contract.spec.js` 負責）。

---

## 階段 1 · 顏色收斂進 token（畫面不變）

所有視覺變更的前置作業。**此階段的目標是像素完全不變。**

### 實測的規模（動工後修正）

原本寫「把 422 種硬寫顏色對應回 `--sf-*`」，把它當成機械作業。實際數字不是這樣：

| | 數量 |
| --- | --- |
| 色碼總數 | 1,099 |
| 其中在 `var(--x, #hex)` fallback 裡（**已經 token 化**） | 92 |
| 真正裸寫的 | 1,007 |
| 裸寫、且**對應得到現有生效 token** | **111** |
| 裸寫、**沒有 token 可對應** | ~564（其餘為 token 定義本身） |

所以機械替換只能處理約 **16%**。剩下那 ~564 個不是重構，是**設計決策**——
要先決定它們各自代表什麼，才能給它們 token。**那才是階段 3 換色真正的阻礙**，
因為沒有 token 的顏色不會跟著 token 變。

> 這一點改變了階段 3 的前提：換色不是「token 就位後改幾十行」，
> 而是「先替 564 個顏色決定語意」。要不要全部給 token、還是接受一部分保持硬寫，
> 是需要你決定的範圍問題。

### 兩個查證出來的陷阱

1. **token 的定義值不等於生效值。** `layout-integrity.css:6` 在 `:root` 重新定義了三個
   `--sf-*`，而它由 `ensureThemeOrder()` 排在 `ui-system.css` **之後**：

   | token | `ui-system.css` 寫的 | 實際生效 |
   | --- | --- | --- |
   | `--sf-primary` | `#4d8cc2` | **`#3975a7`** |
   | `--sf-primary-hover` | `#3975a7` | **`#2d5d85`** |
   | `--sf-danger` | `#bd6873` | **`#a14f5b`** |

   照定義值做對照會讓顏色真的改變。**唯一可信的來源是跑起來的瀏覽器**——
   用 `getComputedStyle(document.documentElement)` 讀出 44 個生效色彩 token 再對照。

2. **`var()` 的 fallback 不是硬寫色碼。** `color:var(--denim-800,#2d5d85)` 已經是 token 化的，
   統計時要扣掉，否則會高估工作量（這裡是 92 處）。

### 做法

- **做法**：把裸寫色碼換成**生效值相同**的 `--sf-*`。**`!important` 原封不動保留**——
  `color:#bd6873!important` 改成 `color:var(--sf-danger)!important` 一樣生效，token 化的目的就達到了。
- **不要做**：不要在這個階段順手清 `!important`。那是另一個問題，不在換色的關鍵路徑上，
  混在一起會讓「像素零差異」這個驗證條件失去意義——分不出差異是換值造成的還是移除造成的。
- **工具**：`node scripts/dead-declarations.mjs` 目前回報 **0 個可移除宣告**（已經清過了），
  所以這一階段沒有自動化捷徑，是人工對照。
- **切法**：原本建議「一個 PR 一個 domain 檔」是為 1,110 處設想的。實際只有 111 處，
  拆成 15 個 PR 的成本遠高於效益——改為依**基準截圖是否涵蓋**來分批：
  有截圖保護的一批一起做（零像素差異就是證明），沒有截圖保護的另外處理。
- **已完成**：有基準保護的 55 處（`theme` 21、`publishing` 14、`workspace-ux` 8、`ui-system` 7、
  `publishing-refinements` 3、`layout-integrity` 1、`works-library` 1）。
- **未做**：`mobile-visual`（19）、`global-search`（13）、`article-images`（9）、
  `project-source-mode`（4）、`chapter-management`（4）、`connection-status`（3）、
  `source-article-ux`（3）、`manual-chapter-edit`（1）——這些畫面**沒有基準截圖**，
  做的話只能靠人工驗收。
- **驗證**：`npm test` 全跑，視覺回歸必須零差異。有差異就是改錯了，不要更新基準。
- **注意**：0-3 之後這個保證涵蓋七張基準，但仍不是全部畫面——見「排序原則」第 3 點列出的缺口。

---

## 插曲 · `!important` 為什麼不是一個階段

`!important` 是這份 CSS 最刺眼的數字（動工時 2,905 個），但它**不擋任何一件事**，所以它不在上面的順序裡。
原因是它和「顏色硬寫」是兩個不同的問題，只是住在同一批檔案裡：

| 問題 | 數量 | 修法 | 是換色的前置嗎 |
| --- | --- | --- | --- |
| 硬寫色碼 | 1,110 處 / 422 種 | 值換成 `var(--sf-*)` | **是**。不做就換不了色 |
| `!important` | 2,905 個 | 移除宣告且不改變計算結果 | **否**。帶著 `!important` 的 `var()` 一樣生效 |

分布（實際出現次數，非行數；`git ls-files '*.css'` 逐檔 `grep -o '!important'`）：

| 檔案 | 動工時 | 2026-10-15 | 佔比（現在） |
| --- | --- | --- | --- |
| `styles/layers/ui-system.css` | 493 | 466 | 18% |
| `styles/domains/workspace-ux.css` | 283 | 242 | 9% |
| `styles/layers/layout-integrity.css` | 231 | 200 | 8% |
| `styles/domains/publishing.css` | 181 | 152 | 6% |
| `styles/layers/theme.css` | 162 | 136 | 5% |
| 其餘 | ~1,555 | 1,385 | 54% |
| **合計** | **2,905** | **2,581** | |

（「2026-10-15」欄是 B 類第一批**之前**量的；第一批之後 `ui-system.css` 221、`layout-integrity.css` 55，合計 2,191；A 類之後 `theme.css` 46，合計 2,101；B 類第二批之後 `ui-system.css` 210、`layout-integrity.css` 54，合計 2,089；移除舊來源按鈕列的整條規則之後 `theme.css` 39、`ui-system.css` 197、`layout-integrity.css` 52，合計 2,015；移除執行期不存在的元素的規則之後（2026-10-16，以載入的樣式表計 2,019 → 2,008，前者含 #128 新增的）`ui-system.css` 196。）

減少的部分不是專門清 `!important` 的結果，主要是兩次移除時一併帶走的：
#108（4-1／4-2，拆掉頁首連線膠囊等，−115）與 #122（移除不會生效的 CSS，−238）；
其間的介面 PR 有增有減，合計 +27。
**重新量的時候用 `grep -o … | wc -l`，不要用 `grep -c`**——後者算的是行數，
`theme.css` 這種一行塞多條規則的檔案會低估好幾倍（`grep -c` 得 22，實際 136）。

分成三類處理，都不排進主線：

### A. 原本預期換色後會自然消失的（`theme.css`，動工時 162 個，A 類處理前 136 個，處理後 46 個，現在 39 個）

原本的判斷：`theme.css` 的角色是「用 `!important` 一條一條蓋掉 `foundation.css` 的紫色底稿」，
階段 3 把正確的值寫進 token 之後，這些覆蓋就失去存在理由，整層可以大幅縮減，當成階段 3 的收尾。

**實際結果**：紫色底稿確實在 3-1 移除了（repo 裡已經找不到 `#6d4aff`），`theme.css` 也改寫成
紙墨色票的 token 定義；但檔案後段的元件覆蓋仍有 136 個 `!important`，預期的「大幅縮減」沒有發生。
階段 3 已經完成，所以這一類**不再有可以搭便車的收尾**，仍待處理；要清的話比照 B 逐批實驗、逐批驗證。

#### 處理結果（2026-10-15）：136 → 46

用 B 類第一批的同一套 computed-style 比對（做法見下方 B 段），目標換成 `theme.css`，移除 90 個。
`theme.css` 排在載入順序第 30，後面還有 9 個樣式表，所以留下的比例比 B 高。

量測狀態比 B 多了一組，專門補 B 第一批「沒測到」的畫面：章節來自 Google Docs（依來源分組的章節列）、
切篇偏好展開、讀稿畫面的 Markdown 引文與連結、部分發布與全部發布的狀態、設定頁 Google 已設定／已登入、
沒有任何平台的設定頁。這一組**真的抓到一個**：已登入 Google 的設定頁讓一條原本看似可刪的宣告現出差異。
最後一次以最終保留清單全部重跑：193 次量測零差異，要移除的 90 個**每一個**都至少在一個狀態裡套用到元素。

**留下的 46 個**：

- **34 個是真的在打仗**（移除後至少一個狀態的 computed style 會變）。
- **12 個沒有證據**：`.button.primary:disabled`（沒有量測狀態出現停用的主要按鈕）、
  `.project-source-diff-badge`（來源比對對話框，需要 Google Docs）、以及 `.source-panel-actions`
  底下的 `#refreshSourceBtn`／`#loadSourceBtn`。最後這組只在**啟動的頭幾個畫格**存在，
  量測時已經被移除——見 B 段第一批的補充。之後連同整條規則刪除（見 B 段「之後」），
  現在留在 `theme.css` 的沒有證據項只剩前兩組 5 個。

### B. 可以用實驗清掉的（`ui-system.css` + `layout-integrity.css`，動工時 724 個，第一批前 666 個，第二批前 276 個，第二批後 264 個，現在 248 個）

這兩個檔案由 `ensureThemeOrder()` 在 runtime 重新附加到很後面，所以它們的 `!important`
**多數可能是多餘的——它本來就贏**。這是可驗證的假設，不是推測：

> 移除一批 `!important` → 比對每個元素的 computed style → 零差異就代表原本就贏，可以刪。

（原本這裡寫的是「跑視覺回歸」。那不夠：階段 3 已經查證視覺回歸對顏色是全盲的，
而這兩個檔案的 `!important` 有一大半是顏色與字級。）

但 `ui-system.css` 並非真正最後：兩個 `ensureStyleLast()` 會把
`project-source-mode.css` 與 `source-article-ux.css` 移到它後面，而且那兩者的先後**在使用中會互換**
（見 `docs/UI_SYSTEM.md`）。所以逐批實驗、逐批驗證，不要整檔一次移除。

#### 第一批（2026-10-15）：666 → 276

`ui-system.css` 466 → 221、`layout-integrity.css` 200 → 55，共移除 390 個。

**做法**：用 Playwright 把 app 帶到約 40 個狀態——冷啟動與已連資料夾的空狀態、長文工作台
（含側欄收合、長章節列、列選單、編輯章節對話框）、讀稿與接縫、作品列表與管理章節、
發布佇列／展開／平台預覽／後記工具、圖文工作台與預覽、兩種內容並存、搜尋、設定、
手機（觸控、唯讀模式）、`prefers-reduced-motion`——每個狀態在 1440／900／700／390 各量一次。
工作台、作品、發布、設定與圖文另外用 DevTools Protocol 的 `CSS.forcePseudoState`
逐一強制 `:hover`、`:focus`＋`:focus-visible`、`:active`、`:focus-within` 再量。

每次量測在**同一頁、同一批元素**上進行：先讀每個元素（含 `::before`／`::after`）的完整
computed style，再把兩個 `<link>` 換成移除 `!important` 的版本（位置不變，cascade 順序因此不變），
重讀、比對。有差異的「元素 × 屬性」反查回可能造成它的宣告，那些宣告留著，重跑到 159 次量測全部零差異為止。
先用「什麼都不移除」空跑一次，確認比對本身沒有雜訊（存檔狀態的時鐘文字與 toast 計時器除外，已排除）。

**留下的 275 個**（另有 1 個是註解裡的字）分兩種，意義不同：

- **245 個是真的在打仗**：移除後至少一個狀態的 computed style 會變。它們不是多餘的，
  要再減只能改「誰擁有這個屬性」，那是設計決策，不是清理。
- **30 個是沒有證據**：沒有任何一個量測狀態套用到它們——主要是 Google Docs 來源面板
  （`.source-panel-actions`、`.source-change-status`、`.chapter-group-label`）、切篇偏好展開、
  設定頁的平台空狀態、`.publishing-project-badge`。不是證明需要，而是沒測到；
  要清的話先補上能走到那些畫面的狀態。
  （後來查清：其中來源按鈕列、`.publishing-project-badge>span`、`.smart-split-settings-label`、
  `.publish-platform-state` 這幾組**執行期就不可能套用**——元素不存在，或只存在於永遠
  `display:none` 的容器裡——不是量測沒走到。規則都已刪除，見下方「之後」兩段。）
  **補充（A 類處理時查證）**：其中多數不是哪個畫面沒走到，而是元素**只在啟動時短暫存在**，
  每一次量測的當下都已經不在——
  `#sourcePanelActions`／`#manualSourceSyncHint` 由 `source-flow.js`／`workspace-ux.js` 建立後，
  被 `project-source-sync.js` 的 `ensureModeUi()` 移除；`.publishing-project-badge>span`
  的內容被 `publishing-project-switcher.js` 整個換掉。在每個畫格與每次 DOM 變動上監看的結果：
  三者都只出現在每次載入的頭 4–5 個畫格，其中 `#sourcePanelActions` 有 2–3 格**真的有版面框**，
  另外兩者沒有。當時的結論是「不是死規則，只是量測時刻抓不到」；這只對 `#sourcePanelActions`
  那幾格成立，而那幾格本身就是不該出現的啟動閃動。`.publishing-project-badge>span` 存在的那一刻，
  它所在的徽章正被 `display:none` 藏住，規則從來沒有可畫的東西。
  真正從來不在 DOM 裡的是 `.smart-split-settings-label`（自 #120 起沒有程式建立它，
  `smart-split-ui.js` 只剩一行移除它的防禦程式）與
  `.publish-platform-state`（程式只產生 `publish-platform-state-line`），這兩條整條規則都失效。
  `dead-selectors.mjs` 當時看不出來：前者的名字出現在那行移除程式裡，後者是更長 class 名稱的
  一段——腳本把任何子字串都算成「有產生」。三組都已處理，見下方「之後（二）」。
  只是沒走到的是 `.source-change-status`（Google Docs 更新來源的對話框）。
  處理結果見下方「第二批」。
  另外 1 個在 `::-webkit-` 類 pseudo-element 上，
  computed style 讀不到，直接保留。

**驗證**：`test:static`、`test:palette`、`test:css`（沒有因此冒出新的失效宣告）、`test:assets` 全過；
瀏覽器測試除 `reading-view-read-1440` 外全過——那張在容器的 Chromium 1194 上
**`main` 本身就差 4%**，而移除前後同一畫面的截圖差異（21 px）小於同一版本連跑兩次的差異（45–50 px），
所以不是這一批造成的；CI 的 Chromium 才是那張基準的判準。

#### 第二批（2026-10-15）：第一批沒驗證的 30 個 → 拿掉 12、留 18

量測狀態再補兩樣：A 類處理時加的那組（Google Docs 來源、切篇偏好展開、已發布狀態、Google 設定頁、
無平台設定頁），以及「更新已連結來源」——走 app 真正的 `refreshActiveSource()`，
只把向 Google 取文件那一步換成假資料，`.source-change-status` 有變更／無變更兩種都量到。
另外在每個畫格與每次 DOM 變動上監看那幾個「量不到」的選擇器，分辨「沒走到」與「只短暫存在」。

- **拿掉 12 個**：10 個這次量到且零差異（`.chapter-group-label` 3、`.platform-settings-empty` 2、
  `.split-preferences-open #smartSplitMiniSettings` 1、`.source-change-status` 4）；
  2 個在整個過程中從未出現在 DOM（`.smart-split-settings-label`、`.publish-platform-state strong`），
  旗標不可能有作用。以最終清單全部重跑：197 次量測零差異。
- **留 18 個**：`.source-panel-actions` 一組 10 個——元素在每次載入的頭幾格**有版面框**，
  量測時刻抓不到，拿掉可能改變那幾格；`#manualSourceSyncHint` 5 個與 `.publishing-project-badge>span` 3 個——
  觀察到的畫格都沒有版面框，但與上一組同一個生命週期，時序上無法排除，一併保留。
  要再處理這 18 個，該做的是查清楚為什麼這些元素在啟動時被建立又移除（是否造成啟動閃動），而不是在 CSS 上動手。

#### 之後：查清楚那 18 個，連帶修掉啟動閃動

查下去發現閃的不只是按鈕列，而是**整個工作台**：`index.html` 裡寫的是工作台，首頁卻從 4-1 起是作品頁，
而切換要等 `app-loader.js` 寫入的 55 個模組跑完。每次載入都先畫出工作台（頁首、來源欄、切篇預覽），
旁邊的側欄卻已經標著「作品」——本機 14–16 格，在 GitHub Pages 上則是模組載入要多久就閃多久。
現在 `<html>` 以 `storyflow-booting` 開場，主欄先以 `visibility: hidden` 藏住（版面不位移），
`app-loader.js` 在 `DOMContentLoaded`（最後一個同步模組跑完、失敗的也算）時移除；
若 `app-loader.js` 根本沒載到，`foundation.css` 的動畫在 4 秒後自己把主欄顯示出來，不會留白。
兩個瀏覽器測試各自先在舊程式上失敗過。

按鈕列本身：`source-flow.js` 建它、`project-source-sync.js` 一渲染就把它移除，來源控制器早已用
「更新作品來源」與「復原上次來源更新」取代它。所以不再建立它，連同只為它存在的
`openSourceDialog()`、`undoLastSourceUpdate()`（本來就按不到）、提示文字與各處防禦路徑一起移除；
JS 不再產生這些名稱後，`dead-selectors.mjs --apply` 在 8 個樣式表裡刪掉 35 條整條規則——
18 個裡的 15 個（`.source-panel-actions` 10、`.manual-source-sync-hint` 5）隨之消失，
`theme.css` 的同組 7 個也是。全站 `!important` 2,089 → 2,015。

剩下 `.publishing-project-badge>span` 3 個：發布頁徽章整個被
`.publishing-page-head .publishing-project-badge{display:none!important}` 隱藏，這 3 個不影響任何畫面。
徽章（與裡面的作品切換器）該不該存在是發布頁的產品問題，沒有在這裡決定。處理結果見下一段。

#### 之後（二）：執行期不存在的元素的規則（2026-10-16）

用 MutationObserver 從文件開始就監看每一次 DOM 變動，走過冷啟動、已連資料夾、建立長文作品、
切篇偏好展開、確認切篇、發布頁「管理發布」與平台列、新增圖文作品、切換作品、重新載入，
每條路徑在 1440／900／700／390 各一次，另加觸控手機（唯讀安全模式）。同一支探測在 `main` 上跑作為對照：

- `#sourcePanelActions`、`.source-panel-actions`、`#manualSourceSyncHint`、`.manual-source-sync-hint`：
  兩邊都**一次也沒出現**（#127 已不再建立）。
- `.smart-split-settings-label`、`.publish-platform-state`：兩邊都一次也沒出現；
  同一段時間 `.publish-platform-state-line` 出現 21 次，探測確實看得到平台列。
- `.publishing-project-badge > span`：`main` 上每次載入出現一次（`publishing-flow.js` 寫入、
  `publishing-project-switcher.js` 隨即整個換掉，而且一直在 `display:none` 的徽章裡）；這個分支上零次。

處理：

- `publishing-flow.js` 不再在徽章裡寫入 `<span>目前作品</span>` 與 `#publishingProjectTitle`
  （切換器一跑就把它們換掉，更新標題的那兩行也隨之移除）；`ui-system.css` 的
  `.publishing-project-badge>span` 手動刪除——名稱都還有人產生，腳本判斷不了這種情況。
- `smart-split-ui.js` 移除那行 `.smart-split-settings-label` 的 `remove()`；之後
  `dead-selectors.mjs --apply` 在 3 個樣式表刪掉 8 個選擇器（6 條整條規則），
  包含 `ui-system.css` 的 `.publish-platform-state strong`。
- `dead-selectors.mjs` 改成比對**完整名稱**（前後不能接 `[\w-]`），執行期以前綴組字的判斷不變。
  `cascade-contract.spec.js` 用一個小 fixture 執行腳本，鎖住子字串、完整名稱、前綴組字與 `src/legacy/`
  四種情況；改回子字串比對時這個測試會失敗。新的比對在整個 repo 只多抓到 `.publish-platform-state` 一個，
  沒有誤報。

`!important`：`smart-split-ui.css` 少 8 個、`ui-system.css` 少 3 個。

這個方法有一個仍然看不到的情況：名稱只出現在**查詢或移除**它的程式裡（`querySelector`、`remove()`），
腳本仍會當成有產生。要分辨「建立」與「查詢」得讀懂程式，不是字串比對做得到的；遇到時以執行期監看為準。

### C. 其餘約 1,780 個（動工時約 1,900 個）

不排期。改到哪個檔案，順手清那個檔案的。硬排一個「清完 `!important`」的大 PR
沒有使用者可見價值，而且風險與工作量都不成比例。

---

## 階段 2 · 字型與字重（改善幅度最大，且獨立於配色）

- **2-1　CJK 字型堆疊　✅ 已完成**：`styles/layers/foundation.css` 原本只有
  `Inter` 加一串**西文** fallback，沒有任何中文字型。已換成西文在前、`PingFang TC` /
  `Noto Sans TC` / `Microsoft JhengHei` 在後的堆疊，並移除從未載入的 `Inter`。
  簡體字型刻意不列。**容器內無法驗證**：這台機器只有 DejaVu / FreeSans，沒有任何中文字型，
  中文一律落到 `sans-serif`。實際字面要在有中文字型的機器上看。
- **2-2　字重收斂　✅ 已完成**：原本 13 種字重（`800` 用 83 次、`850` 用 29 次）。中文沒有 800 字面，
  瀏覽器合成偽粗體，小字級下會糊。已收成 400 / 500 / 700 三種，**193 處、30 個檔案**。
  對應規則寫進 `docs/UI_SYSTEM.md` 的「Type weight」一節。
  映射：`850`·`820`·`800`·`780`·`750`·`720`·`700` → **700**；
  `650`·`600`·`560`·`550`·`500` → **500**；`450`·`400` → **400**。
  550–650 那一段**往下**收而不是往上：它們幾乎都是小字級的次要文字（`.stat-card>small`、
  `.format-summary-text`、`.manual-boundary-hint`、`.connection-chip-label`、
  `.field-label`、`.format-check`），把 11.5px 的灰色中文加粗正是這一階段要消除的糊。
  `styles/archive/` 未納入（`index.html` 沒有載入它）。
- **2-3　正文排版　✅ 已完成**：切篇預覽與發布預覽是最常看的畫面。已在
  `.sf-preview-rendered-root` 上一次寫定 **16px / 1.8 / 36em**，規則寫進
  `docs/UI_SYSTEM.md` 的「Reading measure」一節。
  **計畫原本寫「只有 `font-family:inherit`」，這句不精確**：三個介面各自在
  `preview-mode.css` 重複寫了 `15px/1.9`，真正缺的是**行寬**。量過才知道：
  1440px 下平台預覽一行 **53 個中文字**（中文舒適區約 30–40），而且會隨對話框變寬而變長。
  另外發現一個矛盾：`ui-system.css:251` 把容器設成 `16px!important`，
  但 `preview-mode.css` 更內層的規則把文字設成 `15px`——宣告 16 實際render 15。
  現在字級與行高只寫在真正承載文字的那個元素上，矛盾消失。
  行寬**靠左**不置中：預覽面板的標題、外框與對話框控制項共用同一條左邊界，
  置中會斷掉那條線，短段落還會看起來被推到右邊。原始 MD 模式刻意不套，
  它要呈現的就是實際會貼出去的那串字。
- **驗證（2-3 實際結果）**：4 張基準有差——`platform-preview-1440`（行寬收到 576px）與
  `workspace-long-1280/1440/1920`（行高 1.95 → 1.8）。逐張看過，已更新。
- **驗證（2-2 實際結果）**：容器內只有 Regular/Bold 兩種字面，所以 `550`–`650` → `500`
  （粗 → 常規）是**唯一**會改變畫面的一段；`700` 以上本來就全部落在 Bold，改了也不動。
  零容差比對後只有 4 張基準有差：`workspace-long-1280/1440/1920`（連線膠囊的標籤）與
  `settings-1440`（平台名稱欄位），都是預期中的次要文字降重，已更新。
  其餘 45 項測試在原本的 `maxDiffPixelRatio: 0.025` 下全數通過。
  **字面本身的效果仍待在有中文字型的機器上確認**——這裡看不到偽粗體，也就看不到它消失。

---

## 階段 3 · 配色與去框

token 就位後，這一步是改幾十行的事。

- **3-1　✅ 已完成**　換上紙墨色票與主色（黛 `#4B4557`）。
  - **實際規模比計畫寫的大很多。** 計畫寫「token 就位後，這一步是改幾十行的事」——
    那是假設 token 覆蓋了大部分顏色。實際上載入的 CSS 裡有 **942 處裸寫色碼、408 種不同的值**，
    token 只蓋到其中一小部分。
  - **但這 408 種其實只是幾個角色的近似重複。** 622 處（66%）是同一個藍（色相都在 200–210），
    差別只在明度：15 種「很淡的藍」當背景、12 種「淡藍」當框線、8 種當文字。
    所以做法不是 408 對 408 換值，而是**依角色收斂**——用（屬性類別、色相、飽和度、明度）
    分類成 表面／文字／線／陰影，各自對應到色票的固定階。
    結果：**1,064 處置換，408 種 → 33 種**。這同時完成了換色與去重。
  - **明度刻意保留。** 映射只改色相與飽和度，不動明度，所以版面的對比關係原封不動——
    沒有東西位移，只有顏色變了。
  - **側欄維持深色**（改成暖黑 `#2b2822`）。設計稿的側欄是淺色、只靠一條線分隔，
    但那牽涉 281 條 `.sidebar` 規則（白字、`rgba(255,255,255,.08)` 覆蓋層…），
    是**結構改動不是換值**。留給 4-2 一起處理，這一階段只換色相。
  - **無障礙修正三處**：色票草稿的第三階墨色 `#968f80` 在紙上只有 3.1:1（低於 AA），
    拆成可讀的 `--ink-3 #6f6759` 與只用於停用控制與髮絲線的 `--ink-faint #968f80`；
    深色側欄上的破壞性圖示 `--vermilion` 只有 2.5:1，側欄改用提亮的顏料；
    覆蓋選單裡的刪除文字原本被映射成提亮的朱色（3.0:1），改回 `--vermilion`（5.7:1）。
  - **新增 `npm run test:palette`**（`scripts/palette-contract.mjs`）——見下方「視覺回歸看不到顏色」。
- **3-2　✅ 已完成**　全平面：移除投影，改靠色階與細線分層。
  - 132 個 `box-shadow` 先分類再動手，因為它們做的事不一樣：51 個已經是 `none`、
    25 個是 ring／halo（`0 0 0 Npx`）、12 個是 inset 標記、8 個是 focus token——
    這些**都不是投影**，留著。真正的立體投影是 **42 個**。
  - 移除 **35 個**（面板、卡片、列、輸入框、統計、稿面），
    `--sf-shadow-card` / `--shadow-card` / `--shadow-pop` 三個 token 隨之沒有人用，一併刪掉。
  - **保留 7 個，全都是浮層**：覆蓋選單、篩選選單、章節列動作選單、復原對話框、toast、
    `dialog` 本身。它們浮在**同色的內容之上**，色階和細線都說不出「這個在前面」。
    計畫原本寫「移除對話框、浮層的投影」——那一句要修正：浮層是唯一還需要立體的地方，
    `--sf-shadow-pop` 是全 app 僅存的一個投影 token。
  - **順帶修掉 3-1 留下的 8 個缺陷**（見前一個 commit）：色票轉換把 `box-shadow` 當成一類東西，
    裡面的顏色一律給墨色。那對「投影」是對的，對「不透明的 ring」是錯的——
    淡紫的 focus 光暈變成純黑實心圈、9px 狀態點外面多了 4px 近黑光暈、
    側欄 active 的左側標記變成墨色壓墨色（看不見）。已逐一從改版前的值重新依「線」的規則映射，
    focus 指示器另外處理（它有自己的 3:1 要求）。`palette-contract` 加了一條規則擋這類錯誤。
- **3-3　✅ 已完成**　拆掉章節列、統計、作品列的卡片框，改用留白與細線。
  - **章節列**：按鈕不再是填色膠囊（去背景、去圓角）；分隔線與狀態改由**整列**承擔——
    只填按鈕會讓狀態在 `⋯` 前面就停住，看起來像半選取。列表 `gap` 收到 0，靠髮絲線分隔。
  - **作品列**：卡片變成列——去框、去圓角、去背景，只留一條下緣髮絲線；
    列表頂端一條 `--rule-2`。
  - **統計**：外框（邊框＋圓角＋底色）拿掉，改成一條底線加格線。
    原本「主要統計」用紙色填底把自己撐起來——那是在四格都是紙色時才成立的做法，
    格子變平之後它成了條上唯一還像卡片的東西，改成只靠既有的強調色標籤與全墨數字。
  - **每一列都預留 2px 的左側標記槽**（`border-left:2px solid transparent`），
    所以標記 active 是把已經存在的邊框上色，不會把其他列的文字往右推。
  - **兩個順帶修正**：
    1. 「目前作品」徽章原本和 active 列同一個色階，被自己標示的那一列吃掉了——
       徽章提到 `--paper-1`。這個徽章是那個狀態裡**不依賴顏色**的那一半，不能消失。
    2. `--rule-1` 是畫在紙上的線；作品列與統計條是畫在**頁面底色**上的，
       `--rule-1` 對它只有 1.1:1，等於沒有線。這兩處改用 `--rule-2`。
  - **測試夾具也修了一個**：`addVisualChapters()` 複製的是 active 那一列，
    所有複製品都帶著 `active`。以前狀態只是稍微不同的底色，不痛不癢；
    現在是左側強調色標記，基準截圖會變成「18 章全部選取」——那是 app 到不了的狀態，
    截圖也就不再是參考值。複製時移除 `active`。
- **驗證（3-3）**：4 張基準有差（`works-library-1440`、`workspace-long-1280/1440/1920`），
  逐張看過後更新。49 項測試全過。

- **驗證（3-1 實際結果）· 視覺回歸看不到顏色**

  預期是「視覺回歸全面變更」。實際上換完色之後，**49 項測試全數通過，一張基準都沒被判定為不同**。

  原因查清楚了：Playwright 用 pixelmatch 比對，它的 `threshold` 預設 **0.2**，
  是「感知距離」的門檻——差異小於這個距離的像素不算差異。而這套色票是**刻意保留明度**做的，
  所以把整個 app 重新上色改動了基準裡 **97% 的像素**，在預設門檻下仍然全部過。

  這件事有兩面：
  1. 它是「這次改動純粹是色相、沒有動到任何結構」的**強力證據**（零容差下 97% 像素有差，
     預設門檻下 0 張判定不同，只有明度幾乎不變才會這樣）。
  2. 它代表**視覺回歸對顏色是全盲的**——下一次不小心改壞顏色也會照樣通過。

  所以顏色改用靜態檢查：`scripts/palette-contract.mjs` 檢查每個載入的 stylesheet 裡
  每一個顏色字面都必須是色票裡的值，`npm test` 會跑它，`AGENTS.md` 的測試政策也已更新。
  **不要**去調低 `playwright.config.mjs` 的 `threshold` 來補——基準是在 Chromium 1194 產生、
  在 1234 驗證的，吸收那個差異的容差跟調緊門檻要吃掉的是同一份。

  另外三個 spec 原本寫死了舊色票的 `rgb()` 期望值（cascade-contract 13 處、storyflow 16 處），
  已依 `cascade-contract.spec.js` 自己的規定更新：確認新值是想要的，然後在同一個 commit 裡改期望值。

- **驗證（待做）**：`docs/CHROME_ACCEPTANCE.md` 的人工清單需要在真實機器上跑一次。

---

## 階段 4 · 版面與結構（各自獨立的小 PR）

彼此不相依，可以分開排程。

| # | 項目 | 主要檔案 | 備註 |
| --- | --- | --- | --- |
| 4-1 ✅ | 導覽順序改「作品 · 工作台 · 發布」，作品為預設落地頁 | `index.html`、`src/ui/navigation.js`、`connection-ui.js` | 已完成。順序改了之後**首次使用流程會斷**——原本扛著資料夾關卡的是工作台的空狀態，作品頁的空狀態只寫死「建立第一個作品」，而且冷啟動時根本不會 render。所以一併補了作品頁的空狀態（三種情況比照工作台），這是 4-6 的一小塊，被 4-1 逼出來的。UX_FLOW 的 G-01 與 Works 章節已同步 |
| 4-2 ✅ | 連線狀態移進導覽底部；搜尋與設定移出目的地清單 | `connection-ui.js`、`global-search.js`、`connection-status.css`、`layout-integrity.css` | 已完成。**設定的三個入口早就收斂過了**——`#settingsNav` 與 `#openSettingsBtn` 在桌機已被 CSS 隱藏，只有手機底部列還留著 `#settingsNav`（刻意的，手機沒有常駐工具列）。真正還沒做的是兩件：① 工作台頁首那兩個連線膠囊是側欄底部狀態的**第二份**，已移除（連同只為它們存在的 `ensureTopStatus()`、`setChip()`、`syncConnectionLabels()`）；② 搜尋還在目的地清單裡，已移到側欄工具列，手機維持底部列。側欄底部改成兩行，收合狀態下五個控制項以 `display:contents` 走兩欄流排 |
| 4-3 ✅ | 統計從橫跨右欄移進切篇預覽，改成一條進度線 | `index.html`、`workspace.css`、`core/app.js`、`source-article-ux.js` | 已完成。四個數字合成一行：一條進度條（已確認／總字數）加上三個數字，四個值一個都沒少。`.stats-grid` / `.stat-card` 的 **46 條 CSS 規則**隨之失效——注意其中 8 條是**跟別的元素共用選擇器**的（`.panel,.stat-card,...`），所以是逐一從選擇器清單裡拿掉，不是整條刪。`reframeWorkspaceHierarchy()` 原本會把統計條搬到欄位頂端，那個搬移現在是錯的，已移除，只留顯示與否的判斷 |
| 4-4 ✅ | 作品頁與發布頁共用「作品 › 章節 › 篇」清單元件 | 新增 `styles/domains/list-hierarchy.css`；`chapter-management.js`、`publishing-project-filter.js`、`publishing-flow.js` | 已完成，但**共用的是層級契約不是 renderer**——見下方說明。另外**刪掉了 `publishing-grouping.js`**（76 行，完全失效） |
| 4-5 ✅ | 發布篩選依語意分組；排序控制 | `publishing-flow.js`、`publishing-project-filter.js`、`projects.js`、`publishing.css` | 已完成。兩半一起做，因為它們動同一塊版面。GAPS 第 5 項**不需要資料模型變更**就結案了——長文的篇根本沒有時間戳記，所以「最近更新」做不到，改成「章節順序／最新在前」兩個方向。排序偏好是全域的，加進 `CARRIED_PREFERENCES`（那份清單原本在三個地方各寫一遍） |
| 4-6 ✅ | 空狀態與首次使用關卡 | `app-ux.js`、`works-library.css`（`quick-start.js` 沒有改動） | 已完成。**W-06 本身已經沒有違規**——4-1 補的作品頁空狀態就是最後那一個缺口，我用一份活的稽核把六個可達的空狀態全部量過（實心按鈕數、頁首有沒有競爭的實心鈕），全部通過。真正還沒做的是設計稿 First run 那一節裡的另外兩件事，見下 |

### 4-4 的範圍：共用契約，不是共用 renderer

計畫寫「兩頁共用同一組清單元件」。實作時我把它讀成**共用層級契約**，而不是把兩個 renderer 合成一個：

- **共用的**（`styles/domains/list-hierarchy.css`）：縮排一階 `16px`、列與列之間的髮絲線、
  最後一列不畫線、每一列預留 2px 的目前標記槽、層級標題行的排版、展開箭頭的方向。
  `cascade-contract.spec.js` 有一條測試把兩頁的量測值對起來比，不一致就紅。
- **沒有共用的**：兩頁的資料來源不同（作品頁走 `StoryFlowProjects.list()`，
  發布頁走 `renderParts()` 掃 `chapter.parts`），列裡面顯示什麼、有哪些動作也不同。
  合併成一個 renderer 是另一件大得多的事，而且計畫那一行要求的是
  「結構、縮排、分隔線、展開控制一致，只有顯示欄位與動作依頁面任務不同」——那正是契約做到的。
- **展開控制共用的是行為不是外觀**：兩邊都有 `aria-expanded`、都轉同一個箭頭，
  但作品列的展開鈕同時是一個具名動作（管理章節／收合章節），發布頁的章節群組不是。
  把作品列改成裸箭頭會違反 UI_SYSTEM 的「一個動作一個標籤」。

**順手刪掉 `publishing-grouping.js`**（76 行）。它用**抓畫面文字**的方式分章節群組
（同名章節會被併在一起），而且 `publishing-project-filter.js` 在它之後跑、
會把整個清單重建一次——它的產出從頭到尾都被丟掉。刪掉之後整套測試只有「模組數量 55 → 54」
這一條斷言變紅，那就是它已經死掉的證明。

### 4-6 的範圍：做了什麼、沒做什麼

先講**沒做**的：設計稿 First run 有三個空狀態，我只做了兩個半。

- **「瀏覽器不支援」那一格的「以唯讀模式繼續」沒有做。** 查證後：唯讀模式
  （`mobile-safe-mode.js`）是**手機自動進入**的狀態，沒有任何 `setReadOnly` 之類的 API 可以讓人
  主動進去。而且 Safari／Firefox 沒有 File System Access API，也就沒有資料夾內容可讀——
  那顆按鈕會把人帶到一個空的 app。要做它等於**發明一個新模式**，不是實作設計稿。
  維持 4-1 的處理：這一格不給動作，由文案說明真正的要求。
- **設計稿裡 01/02/03/04 的「關卡」條沒有做。** 它在那一節的說明文字裡、下面掛著
  「關卡順序 · …」的圖說，讀起來是在解釋流程順序，不是一個要蓋出來的常駐元件。

做的兩件，都是規則層級的缺口而不是偏好問題：

1. **頁首的「＋ 新增作品」沒有作品時改成保持顯示**（原本是 `hidden`）。它本來就是外框按鈕，
   W-06 擋的是**競爭的實心**按鈕，外框不算；藏起來反而把「不先讀空狀態就能建立作品」這條路拿掉了。
2. **停用時的理由變成看得見的文字**（「需要先連接資料夾」），不再只有 `title`。
   tooltip 在觸控上看不到，鍵盤使用者也碰不到一顆停用中、拿不到 focus 的按鈕。
   **而且順手抓到一個缺陷**：`works-library.css` 用 id 選擇器設了那顆按鈕的顏色，
   把 `.button:disabled` 的停用樣式蓋掉了——結果是一顆說明自己不能用、
   但看起來完全能用的按鈕（只有 hover 時的 `cursor: not-allowed` 透露）。
   這跟 4-4 那條「接手一個屬性就要連它的狀態一起接手」是同一個形狀。

---

## 階段 5 · 功能性重構（風險最高，最後做）　✅ 全部完成

### 5-1　讀稿檢視 + 接縫檢視合併，移除 `reviewDialog`　✅ 已完成

計畫這一行寫的是「合併」，實際上不是：**讀稿檢視原本並不存在**。
`readingMode|讀稿|focusMode|immersive` 在 `src/` 全域搜不到任何東西，
所以這一項不是把兩個既有畫面接起來，而是新建一個頁面級的閱讀介面，
再把接縫（原本的 `reviewDialog` + `手動微調` 模式）併進去。
設計稿主張兩者該整併的依據是「底部操作完全相同」，這點成立，
而且程式裡早就留下了證據：`.manual-boundary-active` 會把「上一篇」那一欄整個隱藏，
因為章節全文已經涵蓋它。

做出來的樣子：

- `#readingView` 是 `#workspaceView` 裡的一個 `<section>`，不是 `<dialog>`。
  打開時兩側欄位收掉，章節取代它們的位置——用對話框蓋住工作區來顯示同一份工作區，
  那層蓋子本身沒有作用。
- 三欄改成**單一連續文字流**，已確認／這一篇／尚未處理以墨色深淺（`--ink-3`／`--ink-1`／`--ink-2`）
  加上 `這一篇開始／結束` 標記區分。「上一篇」就是 start 之前那幾段，不需要複製到第二欄才能比對。
- `接縫` 是檢視，不是模式。`手動微調` 這顆切換鍵、`.manual-boundary-active` 整組規則、
  `reviewDialog` 本體與三欄的 CSS 全部移除。
- 標題、提示、內文、底部操作共用一個欄寬與同一條左邊界。欄寬是**長度**（`--sf-reading-column`），
  不是 `em`——這些子元素從 12px 到 21px 都有，用 `em` 會讓每一個各自算出不同的欄寬，
  第一版就是這樣讓提示文字掉出左邊界的。

動到：`index.html`、`src/ui/workspace-interactions.js`、`src/split/boundary-engine.js`、
`src/split/smart-split-ui.js`、`src/ui/preview-mode.js`、`src/ui/workspace-ux.js`、
`src/ui/app-ux.js`、`src/publishing/publishing-flow.js`、`src/split/smart-split-title.js`、
`src/projects/workspace-project-ux.js`、`src/persistence/settings-sync.js`、
`src/publishing/platform-lock.js`、`src/settings/platform-settings.js`，
以及 `styles/domains/workspace-ux.css`、`styles/layers/{legacy-patches,ui-system,theme}.css`、
`preview-mode.css`、`smart-split-ui.css`、`app-ux.css`。
新增兩張基準：`reading-view-read-1440.png`、`reading-view-seam-1440.png`。

### 5-2　管理發布改成兩欄　✅ 已完成

`管理發布` 展開後是兩欄：左邊稿，右邊平台軌。點右邊的項目，左欄就原地換成那個版本，
不再疊一層對話框在已經展開的那一列上——跟 5-1 是同一個形狀的問題。

做出來的樣子：

- `#platformPreviewDialog` 移除。原本的對話框內容原封不動搬進 `.publish-preview-panel`，
  由 `buildPublishPreviewPanel()` 建、`renderPublishPreview()` 填；`previewPublish()`
  現在只是「選擇」——設定 `selectedPartKey` 與 `selectedPlatformKey` 後重繪。
  因為同時只有一列展開，面板裡的 id 在文件中仍然唯一。
- **平台軌的第一項是「StoryFlow 預設」**。沒有平台設定也是一個版本，把它做成一個項目，
  所有版本就用同一種方式抵達；列上的「預覽」變成選中它，而不是開任何東西。
- 作用在所選版本上的動作——`記錄發布／發布紀錄`、已發布切換、`複製內容`——
  全部集中在左欄底部、緊鄰它們作用的內容，平台軌不再重複一份。
- 複製選項屬於「一篇 × 一個平台」這個配對，不屬於面板元素：任何 `renderParts()`
  都會重建面板，所以那些選項放在模組狀態裡；離開平台再回來則是新的決定，會重設。

順手修掉兩條**從來沒生效過**的手機版規則：`.platform-preview-extra-copy` 與
`.platform-preview-visual-extras-head` 的 `@media(max-width:680px)` 覆寫寫在同檔案的
基礎規則**之前**，媒體查詢不增加優先序，所以後面那條一直贏。之前在對話框的寬度下看不出來，
搬進比較窄的面板之後就變成「尚未設定」四個字直排。

同時刪掉 `src/ui/workspace-interactions.js` 裡另一個同名的 `#platformPreviewDialog`：
它掛在 `.part-row` 上，而 `publishing-flow.js` 早就整個換掉了 `window.renderParts`，
所以那條路徑永遠不會被觸發。留著會和新面板 id 相撞。

動到：`src/publishing/publishing-flow.js`、`src/ui/workspace-interactions.js`、
`src/ui/preview-mode.js`，以及 `styles/domains/publishing.css`、
`styles/domains/publishing-refinements.css`、`styles/layers/{controls,ui-system,legacy-patches,theme}.css`。
新增一張基準 `platform-preview-platform-1440.png`（選了平台之後的左欄）。
### 5-3　圖片依 `placement` 分組顯示　✅ 已完成

圖片管理器改成依 placement 分成三組（正文前／正文後、後記前／後記後），各自帶標題與張數，
空的組不畫。**預覽本來就已經是分組的**，管理器卻是一串平的清單——兩邊對同一份資料說了不同的話。

- 「上移／下移」改成在**組內**移動：輸出先依 placement 分組、組內才用陣列順序，
  所以跨組的順序本來就沒有意義。原本的實作會把一張圖移過另一張落在完全不同位置的圖。
  到組的兩端就停用。
- 列改用 `data-image-id` 辨識。同一個檔案匯入兩次會共用一個 `originalName`，
  畫面上顯示的檔名認不出是哪一列——測試就是在這裡撞上的。
- 「圖片不會隨『複製內容』送出」改成**常駐**在管理器抬頭，一張圖都還沒有的時候就說。
  原本只有預覽在有圖時才提；人是先設定圖片、後來才發現複製不帶圖的。

### 5-4　圖文編輯器去框，摘要移回編輯器　✅ 已完成

**去框**：`.visual-editor-panel` 不再是 `.panel`。工作區的格線已經把左邊的圖文列和右邊的
編輯器分開了，編輯器自己的欄位也已經有結構，再加一層卡片只是把同一條界線畫兩次。
長文工作台**維持**面板框——那裡的框分隔的是三個不同的工具，不是圍住同一件東西。
圖文列同時套用和章節列、作品列一樣的列契約：分隔線、hover 底色、2px 目前標記由**列**承擔，
裡面的按鈕一個都不帶。

**摘要移回編輯器**：`part.summary` 原本有兩個編輯入口——發布預覽的 extras 與
`摘要與 Hashtags` 工具——而圖文編輯器一個都沒有。摘要是寫關於這則圖文的東西，
所以它現在寫在圖文編輯器裡，和標題、正文同一套自動儲存。發布預覽只剩下唯讀的點擊複製列，
`#platformPreviewSummaryEditor` 與 `savePublishingSummary()` 一併移除。
Hashtags **不跟著搬**：平台可以覆寫它，所以它留在發布那一側。
長文的 `part.summary` 沒有自己的編輯器，維持在 `摘要與 Hashtags` 工具裡。

順手修掉一個：`#visualImageGrid` 的空狀態是一句話，卻被當成一格 155px 的縮圖，
句子在中間斷行。改成跨整列。

動到：`src/publishing/article-images.js`、`src/projects/visual-workspace.js`、
`src/publishing/publishing-flow.js`，以及 `styles/domains/{article-images,visual-workspace}.css`。
`visual-workspace-1440.png` 基準更新。

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
