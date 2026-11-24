# 世界空氣品質觀測站

作者：郭柏華

以 Flask 和 Open-Meteo 空氣品質 API 查詢全球十座城市。點選地圖標記、城市卡片或選單可查看 US AQI、四項污染物與近 24 小時趨勢。時間以選定城市的時區顯示，趨勢也提供逐時表格。

## 課程繳交資料

[作業繳交入口](https://world-air-watch.vercel.app/submission) · [Vercel 正式網站](https://world-air-watch.vercel.app/)

- [API 規格卡與欄位對照](api-spec.md)
- [成功與失敗處理的驗證證據](verification.md)
- [三段提示詞與學習反思](submission.md)

## 本機安裝與啟動

需要 Python 3.12。在含有 `app.py` 的資料夾內執行。

### Windows PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m flask --app app run --port 5000
```

測試：` .\.venv\Scripts\python.exe -m unittest discover -s tests -v `。

### macOS 或 Linux

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m flask --app app run --port 5000
```

測試：` .venv/bin/python -m unittest discover -s tests -v `。

啟動後開啟 [本機首頁](http://127.0.0.1:5000/)、[健康檢查](http://127.0.0.1:5000/api/health)、[台北空品 API](http://127.0.0.1:5000/api/air-quality?city=taipei) 和 [繳交資料](http://127.0.0.1:5000/submission)。

## 資料流

```text
瀏覽器的選單、地圖標記或城市卡片
    → 同來源 GET /api/air-quality?city=taipei
    → Flask 驗證城市代號並查表取得固定座標
    → requests 呼叫 Open-Meteo 的固定 HTTPS 端點
    → Flask 驗證欄位、分類 AQI 並回傳 JSON
    → 瀏覽器以 textContent 和 Canvas 更新內容
```

`GET /api/cities` 批次查詢地圖與城市卡片上的 AQI。`GET /api/health` 確認 Flask 路由可用，不依賴上游服務。每個城市的 AQI 依美國分級，濃度單位是 µg/m³。資料來自 CAMS 空氣品質模型的網格估算。

## Vercel 設定

| 項目 | 設定 |
| --- | --- |
| Git 生產分支 | `main` |
| Root Directory | 儲存庫根目錄 |
| Framework Preset | Flask |
| Build Command / Output Directory | 框架預設 |
| Python 版本 | 根目錄 `.python-version` 指定 3.12 |
| 環境變數 | 無 |

本次以 GitHub 上的版本直接部署至 Vercel。若要讓推送自動觸發部署，Vercel 的 GitHub 整合須具有此儲存庫的存取權。

Vercel 匯入根目錄 `app.py` 中的 `app` 物件。Flask 本機使用 `public/` 提供靜態檔案，Vercel 以相同的根路徑提供這些資產。Vercel Functions 有運行時間和包體限制。此專題只傳送精簡 JSON，由每次請求觸發查詢，無需常駐工作或本地持久儲存。

資料及底圖來源：[Open-Meteo 空品文件](https://open-meteo.com/en/docs/air-quality-api) · [CAMS](https://atmosphere.copernicus.eu/) · [Natural Earth](https://www.naturalearthdata.com/) · [Vercel Flask 部署](https://vercel.com/docs/frameworks/backend/flask)。
