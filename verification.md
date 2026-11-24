# 驗證證據｜世界空氣品質觀測站

## 實際呼叫上游的本機驗收

以 Python 3.12.14、Flask 測試用戶端執行。日期為 2026-11-24（台北時間）。這是當次查詢結果，AQI 會隨上游資料更新。

| 請求 | HTTP | 實際回應摘要 |
| --- | --- | --- |
| `GET /` | 200 | 首頁 HTML |
| `GET /api/health` | 200 | `{"ok":true}` |
| `GET /api/air-quality?city=taipei` | 200 | US AQI 73（普通），PM2.5 16.7 µg/m³，25 筆趨勢資料 |
| `GET /api/cities` | 200 | 10 座城市都有 AQI |
| `GET /api/air-quality?city=invalid` | 400 | `{"ok":false,"code":"unknown_city","message":"請選擇本站支援的城市。"}` |

## 模擬上游異常

指令 `python -m unittest discover -s tests -v`。14 項測試通過。上游異常由測試模擬，適用於重複驗收。

| 模擬結果 | 觀察到的 HTTP / JSON code |
| --- | --- |
| 上游逾時 | 504 / `upstream_timeout` |
| 連線錯誤 | 502 / `upstream_network_error` |
| 上游 HTTP 429 | 503 / `upstream_rate_limit` |
| 上游 HTTP 500 | 502 / `upstream_http_error` |
| 無效 JSON | 502 / `upstream_invalid_json` |
| 缺少污染物欄位或逐時資料格式錯誤 | 502 / `upstream_missing_fields` |
| 空結果 / 所有趨勢值皆為 null | 502 / `no_data`、`no_history` |

測試另驗證了健康檢查、首頁與繳交資料頁、台北 API 成功、未知城市不會呼叫上游，以及城市總覽能處理單一城市缺值。[測試原始碼](tests/test_app.py)

## 瀏覽器試跑

以 Chromium 開啟本機 Flask 網站並操作首頁。

| 操作 | 實際結果 |
| --- | --- |
| 開啟首頁 | 台北顯示 US AQI 73，逐時表包含 25 筆資料 |
| 用選單改查倫敦 | 詳情切換到倫敦，顯示 US AQI 52 |
| 手機尺寸版面 | 可視內容寬度 375 px，頁面內容同寬，沒有水平捲動 |
| 模擬東京首次請求逾時 | 顯示「等待空品資料逾時，請再試一次。」與重試按鈕，詳細數值隱藏 |
| 對重試按鈕按 Enter | 改用真實 API 成功回傳東京資料，顯示 US AQI 73，重試按鈕收起 |

手機驗收在本機模擬一次 HTTP 504，模擬只用於測試。

## Vercel 正式站驗收

2026-11-24 約上午 11:02（台北時間），用無登入工作階段開啟正式站。Vercel 回報 Flask、Production、Ready，部署檔案來自 GitHub 版本 [a9d6351](https://github.com/kuoh04867-bot/world-air-watch/commit/a9d6351dc446bf7231153b065140855a4576e2bc)。

| 正式站路徑 | HTTP | 當次回應摘要 |
| --- | --- | --- |
| `/` 與 `/submission` | 200 | 首頁與繳交資料頁，皆顯示作者 |
| `/style.css`、`/dashboard.js`、`/world-coastlines.json` | 200 | 樣式、程式與底圖皆可載入 |
| `/api/health` | 200 | `{"ok":true}` |
| `/api/cities` | 200 | 十座城市均有 AQI |
| `/api/air-quality?city=taipei` | 200 | US AQI 74，25 筆逐時資料 |
| `/api/air-quality?city=london` | 200 | US AQI 53，25 筆逐時資料 |
| `/api/air-quality?city=invalid` | 400 | `unknown_city` 與繁體中文提示 |

使用瀏覽器開啟正式首頁，也確認地圖標記、台北四項污染物、AQI 與走勢均已呈現。[Vercel 正式網站](https://world-air-watch.vercel.app/)。
