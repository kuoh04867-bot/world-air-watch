from datetime import datetime, timezone
from math import isfinite

from flask import Flask, jsonify, render_template, request
import requests

app = Flask(__name__, static_folder="public", static_url_path="")
app.json.ensure_ascii = False

ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality"
SOURCE = "Open-Meteo / CAMS"
AUTHOR = "郭柏華"
POLLUTANTS = ("pm2_5", "pm10", "ozone", "nitrogen_dioxide")
CITY_ROWS = [
    ("taipei", "台北", "Taipei", "台灣", "亞洲", 25.0330, 121.5654, "Asia/Taipei"),
    ("tokyo", "東京", "Tokyo", "日本", "亞洲", 35.6762, 139.6503, "Asia/Tokyo"),
    ("singapore", "新加坡", "Singapore", "新加坡", "亞洲", 1.3521, 103.8198, "Asia/Singapore"),
    ("delhi", "新德里", "New Delhi", "印度", "亞洲", 28.6139, 77.2090, "Asia/Kolkata"),
    ("london", "倫敦", "London", "英國", "歐洲", 51.5072, -0.1276, "Europe/London"),
    ("new-york", "紐約", "New York", "美國", "北美洲", 40.7128, -74.0060, "America/New_York"),
    ("los-angeles", "洛杉磯", "Los Angeles", "美國", "北美洲", 34.0522, -118.2437, "America/Los_Angeles"),
    ("sao-paulo", "聖保羅", "São Paulo", "巴西", "南美洲", -23.5505, -46.6333, "America/Sao_Paulo"),
    ("cape-town", "開普敦", "Cape Town", "南非", "非洲", -33.9249, 18.4241, "Africa/Johannesburg"),
    ("sydney", "雪梨", "Sydney", "澳洲", "大洋洲", -33.8688, 151.2093, "Australia/Sydney"),
]
CITY_FIELDS = ("id", "name", "english", "country", "region", "lat", "lon", "timezone")
CITIES = {row[0]: dict(zip(CITY_FIELDS, row)) for row in CITY_ROWS}
LEVELS = [
    (50, "good", "良好"),
    (100, "moderate", "普通"),
    (150, "sensitive", "敏感族群不健康"),
    (200, "unhealthy", "不健康"),
    (300, "very-unhealthy", "非常不健康"),
    (None, "hazardous", "危害"),
]


class AirQualityError(Exception):
    def __init__(self, code, message, status):
        super().__init__(message)
        self.code = code
        self.status = status


def get_upstream(**params):
    try:
        response = requests.get(
            ENDPOINT,
            params=params,
            timeout=(3, 7),
            allow_redirects=False,
            headers={"Accept": "application/json"},
        )
        if response.status_code == 429:
            raise AirQualityError("upstream_rate_limit", "資料服務目前請求過多，請稍後再試。", 503)
        if not 200 <= response.status_code < 300:
            raise AirQualityError("upstream_http_error", "資料服務暫時無法使用，請稍後再試。", 502)
    except requests.Timeout as exc:
        raise AirQualityError("upstream_timeout", "等待空品資料逾時，請再試一次。", 504) from exc
    except requests.RequestException as exc:
        raise AirQualityError("upstream_network_error", "無法連線至空品資料服務，請稍後再試。", 502) from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise AirQualityError("upstream_invalid_json", "資料服務回傳的格式有誤，請稍後再試。", 502) from exc

    if data is None or data in ({}, []):
        raise AirQualityError("no_data", "目前沒有可顯示的空品資料。", 502)
    if isinstance(data, dict) and data.get("error"):
        raise AirQualityError("upstream_error", "資料服務暫時無法提供結果，請稍後再試。", 502)
    return data


def number(value):
    if type(value) not in (int, float) or not 0 <= value <= 100_000 or not isfinite(value):
        raise ValueError("Invalid numeric value")
    return value


def timestamp(value):
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is not None:
        raise ValueError("Expected GMT since the request fixes the source timezone")
    return parsed.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def current_reading(data):
    current = data["current"]
    if not current or current.get("us_aqi") is None:
        raise AirQualityError("no_data", "這個城市目前沒有空品指數，請稍後再試。", 502)

    aqi = number(current["us_aqi"])
    _, key, label = next(level for level in LEVELS if level[0] is None or aqi <= level[0])
    return current, {
        "time": timestamp(current["time"]),
        "aqi": aqi,
        "category": {"key": key, "label": label},
    }


def hourly_readings(hourly, data_time):
    times = hourly["time"]
    values = hourly["us_aqi"]
    if not isinstance(times, list) or not isinstance(values, list) or len(times) != len(values):
        raise ValueError("Invalid hourly data")
    points = [
        {"time": timestamp(time), "aqi": None if value is None else number(value)}
        for time, value in zip(times, values)
    ]
    points = [point for point in points if point["time"] <= data_time][-25:]
    if not any(point["aqi"] is not None for point in points):
        raise AirQualityError("no_history", "這個城市目前沒有可顯示的 AQI 趨勢。", 502)
    return points


@app.errorhandler(AirQualityError)
def api_error(error):
    return jsonify(ok=False, code=error.code, message=str(error)), error.status


@app.get("/")
def home():
    return render_template("index.html", cities=list(CITIES.values()), author=AUTHOR)


@app.get("/api/health")
def health():
    return jsonify(ok=True)


@app.get("/api/air-quality")
def air_quality():
    city = CITIES.get(request.args.get("city", "taipei"))
    if city is None:
        raise AirQualityError("unknown_city", "請選擇本站支援的城市。", 400)

    data = get_upstream(
        latitude=city["lat"],
        longitude=city["lon"],
        current=",".join(("us_aqi", *POLLUTANTS)),
        hourly="us_aqi",
        past_hours=24,
        forecast_hours=1,
        timezone="GMT",
    )
    try:
        current, reading = current_reading(data)
        pollutants = {
            key: None if current[key] is None else number(current[key])
            for key in POLLUTANTS
        }
        hourly = hourly_readings(data["hourly"], reading["time"])
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise AirQualityError("upstream_missing_fields", "空品資料的必要欄位不完整或格式有誤。", 502) from exc

    return jsonify(
        ok=True, city=city, current=reading, pollutants=pollutants, hourly=hourly, source=SOURCE
    )


@app.get("/api/cities")
def city_overview():
    cities = list(CITIES.values())
    entries = get_upstream(
        latitude=",".join(str(city["lat"]) for city in cities),
        longitude=",".join(str(city["lon"]) for city in cities),
        current="us_aqi",
        forecast_days=1,
        timezone="GMT",
    )
    if not isinstance(entries, list) or len(entries) != len(cities):
        raise AirQualityError("upstream_missing_fields", "城市總覽的資料不完整。", 502)

    results = []
    for city, entry in zip(cities, entries):
        try:
            _, reading = current_reading(entry)
        except (AirQualityError, KeyError, TypeError, ValueError, AttributeError):
            reading = None
        results.append({"id": city["id"], "current": reading})
    if not any(result["current"] for result in results):
        raise AirQualityError("no_data", "目前沒有可顯示的城市資料。", 502)
    return jsonify(ok=True, cities=results, source=SOURCE)


@app.get("/submission")
def submission():
    return render_template("submission.html", author=AUTHOR)
