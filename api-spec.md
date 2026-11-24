# API 規格卡｜Open-Meteo Air Quality API

作者：郭柏華。從 [public-apis 目錄](https://github.com/public-apis/public-apis) 找到 Open-Meteo，並以供應商的空品文件確認使用方式。

| 項目 | 規格 |
| --- | --- |
| 基本網址 | `https://air-quality-api.open-meteo.com` |
| 端點及方法 | `GET /v1/air-quality`，HTTPS |
| 認證 | 免費公開端點免金鑰 |
| 必要參數 | `latitude`、`longitude`，單點數字或成對的逗號分隔列表 |
| 詳情參數 | `current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide`、`hourly=us_aqi`、`past_hours=24`、`forecast_hours=1`、`timezone=GMT` |
| 總覽參數 | `current=us_aqi`、`forecast_days=1`、`timezone=GMT` |
| 回應 | 單點為 JSON 物件，多點為同順序的 JSON 物件陣列 |
| 資料性質 | CAMS 大氣成分模型的城市座標網格估算。本站整理欄位、轉換時間與套用 US AQI 分級 |
| 免費條件 | 非商業用途。依官方條款每分鐘少於 600、每小時少於 5,000、每日少於 10,000 次；共用雲端 IP 可能較早限流 |
| 授權和標示 | CC BY 4.0。網站標示 Open-Meteo 與 CAMS，並說明資料經欄位整理與分級 |
| 可用性 | 免費服務無上線時間保證；每一批請求的實際扣量未實測 |
| CORS | 網頁呼叫同來源路由，由 Flask 呼叫上游；不需開放跨來源讀取 |

官方資料：[Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) · [服務條款](https://open-meteo.com/en/terms) · [方案與授權](https://open-meteo.com/en/pricing) · [AirNow AQI 分級](https://www.airnow.gov/aqi/aqi-basics/)。

## 最小請求與實際回應

```bash
curl --max-time 12 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=25.03&longitude=121.56&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&hourly=us_aqi&past_hours=24&forecast_hours=1&timezone=GMT'
```

2026-11-24 實際請求回傳 HTTP 200 與 JSON。下方摘錄當時的模型資料。網站上的數值會依每次上游回應變動。

```json
{
  "current": {
    "time": "2026-11-24T02:00",
    "interval": 3600,
    "us_aqi": 73,
    "pm2_5": 16.7,
    "pm10": 19.3,
    "ozone": 67.0,
    "nitrogen_dioxide": 18.9
  }
}
```

同次回應的 `hourly.time` 和 `hourly.us_aqi` 各有 25 筆，包含區間起點和當前小時。`current_units` 顯示 AQI 以 USAQI 表示，四項污染物以 µg/m³ 表示。

## 欄位對照

| Open-Meteo JSON | Flask JSON | 網頁顯示 |
| --- | --- | --- |
| 請求的固定城市座標 | `city` | 城市名、地區、經緯度及地圖標記 |
| `current.us_aqi` | `current.aqi`、`current.category` | AQI、大字等級和色帶 |
| `current.time` | `current.time`，UTC ISO 8601，帶 Z | 依城市時區顯示資料時間 |
| `current.pm2_5`、`pm10`、`ozone`、`nitrogen_dioxide` | `pollutants` 下對應的欄位 | 四項濃度；null 顯示為「—」 |
| `hourly.time[]` 與 `hourly.us_aqi[]` | `hourly[]` 逐小時物件 | 折線圖與逐時表格；缺值中斷折線 |

## 錯誤回應

後端使用連線 3 秒、讀取 7 秒的逾時設定，固定 API 主機並關閉重新導向。

| 狀態 | 參數或上游情況 | Flask `code` |
| --- | --- | --- |
| 400 | 未支援的城市代號 | `unknown_city` |
| 502 | 上游 HTTP 錯誤、連線異常 | `upstream_http_error`、`upstream_network_error` |
| 502 | 非 JSON、欄位缺少或格式錯誤 | `upstream_invalid_json`、`upstream_missing_fields` |
| 502 | 空資料或空趨勢 | `no_data`、`no_history` |
| 503 | 上游 HTTP 429 | `upstream_rate_limit` |
| 504 | 連線或讀取逾時 | `upstream_timeout` |

錯誤 JSON 包含 `ok: false`、`code` 與繁體中文 `message`。網站在資料取得失敗時顯示原因與「再試一次」。
