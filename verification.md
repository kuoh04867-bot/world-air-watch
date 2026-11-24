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
