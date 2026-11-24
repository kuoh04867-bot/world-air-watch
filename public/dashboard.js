"use strict";

const get = (id) => document.getElementById(id);
const cities = JSON.parse(get("city-data").textContent);
const cityById = new Map(cities.map((city) => [city.id, city]));
const cards = new Map([...document.querySelectorAll(".city-card")].map((button) => [button.dataset.city, button]));
const pins = new Map();
const readings = new Map();
const levels = ["good", "moderate", "sensitive", "unhealthy", "very-unhealthy", "hazardous"];
const limits = [0, 50, 100, 150, 200, 300, 500];
let selected = cities[0].id;
let loading = false;
let overviewLoading = false;
let coastline = [];
let hourly = [];

function showCityInfo(city) {
  get("city-name").textContent = city.name;
  get("city-region").textContent = city.region + " · " + city.country;
  const lat = Math.abs(city.lat).toFixed(2) + "°" + (city.lat < 0 ? "S" : "N");
  const lon = Math.abs(city.lon).toFixed(2) + "°" + (city.lon < 0 ? "W" : "E");
  get("city-coords").textContent = lat + " · " + lon;
  get("city-select").value = city.id;
  for (const [id, button] of [...cards, ...pins]) {
    button.setAttribute("aria-pressed", String(id === city.id));
  }
}

function setSummary(id, reading) {
  const current = readings.get(id);
  if (current && (!reading || current.time > reading.time)) return;
  readings.set(id, reading);
  const label = reading ? "美國 AQI " + reading.aqi + "，" + reading.category.label : "暫無資料";
  const city = cityById.get(id);
  const card = cards.get(id);
  const pin = pins.get(id);
  for (const button of [card, pin]) {
    button.classList.remove(...levels);
    if (reading) button.classList.add(reading.category.key);
    button.setAttribute("aria-label", city.name + "，" + label);
  }
  card.querySelector(".city-value b").textContent = reading?.aqi ?? "—";
}

async function api(path) {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "無法取得空品資料，請稍後再試。");
  }
  return data;
}

function cityTime(time, city, options) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: city.timezone, hourCycle: "h23", ...options,
  }).format(new Date(time));
}

function renderReading(data) {
  const { city, current, pollutants } = data;
  get("aqi-number").textContent = current.aqi;
  get("category").textContent = current.category.label;
  get("category").className = "level-pill " + current.category.key;
  const segment = levels.indexOf(current.category.key);
  const ratio = (current.aqi - limits[segment]) / (limits[segment + 1] - limits[segment]);
  get("scale-marker").style.left = Math.min(100, (segment + ratio) * (100 / 6)) + "%";
  for (const [name, value] of Object.entries(pollutants)) {
    get(name).textContent = value === null ? "—" : value.toFixed(1);
  }
  const displayTime = cityTime(current.time, city, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  get("time").textContent = displayTime + " · 城市當地時間";
  get("reading-data").hidden = false;
  get("feedback").hidden = true;
  setSummary(city.id, current);
  hourly = data.hourly;
  renderTrend(city);
}

async function loadCity(id, { scroll = false, refreshOverview = false } = {}) {
  if (loading) return;
  const city = cityById.get(id);
  loading = true;
  selected = id;
  showCityInfo(city);
  if (scroll) get("overview").scrollIntoView({ block: "start" });
  get("refresh").disabled = true;
  get("city-select").disabled = true;
  for (const button of [...pins.values(), ...cards.values()]) button.disabled = true;
  get("reading").setAttribute("aria-busy", "true");
  get("reading-data").hidden = true;
  get("retry").hidden = true;
  get("time").textContent = "US AQI";
  get("feedback").classList.remove("error");
  get("feedback").textContent = "載入空氣品質資料中…";
  get("feedback").hidden = false;
  get("request-status").textContent = "正在載入" + city.name + "的空品資料。";
  get("chart-wrap").hidden = true;
  get("hourly-details").hidden = true;
  get("trend-status").hidden = false;
  get("trend-status").textContent = "載入趨勢中…";
  get("trend-caption").textContent = "依城市當地時間顯示";
  hourly = [];

  if (refreshOverview) loadOverview();
  try {
    const data = await api("/api/air-quality?city=" + encodeURIComponent(id));
    renderReading(data);
    get("request-status").textContent = city.name + "資料已更新，美國 AQI " + data.current.aqi + "。";
  } catch (error) {
    const message = error.name === "Error" ? error.message : "無法取得空品資料，請稍後再試。";
    get("feedback").textContent = message;
    get("feedback").classList.add("error");
    get("feedback").hidden = false;
    get("retry").hidden = false;
    get("trend-status").textContent = "取得空品資料後即可查看趨勢。";
    get("request-status").textContent = city.name + "。" + message;
  } finally {
    get("reading").setAttribute("aria-busy", "false");
    get("refresh").disabled = false;
    get("city-select").disabled = false;
    for (const button of [...pins.values(), ...cards.values()]) button.disabled = false;
    loading = false;
  }
}

async function loadOverview() {
  if (overviewLoading) return;
  overviewLoading = true;
  const status = get("overview-status");
  const retry = get("overview-retry");
  retry.hidden = true;
  status.textContent = "載入城市資料中…";
  try {
    const data = await api("/api/cities");
    for (const { id, current } of data.cities) setSummary(id, current);
    const count = data.cities.filter((city) => city.current).length;
    status.textContent = count < cities.length ? "部分城市暫無 AQI，可逐一查詢。" : "";
  } catch (error) {
    readings.clear();
    for (const city of cities) setSummary(city.id, null);
    status.textContent = "城市總覽暫時無法取得資料，仍可查詢單一城市。";
    retry.hidden = false;
  } finally {
    overviewLoading = false;
  }
}

function canvasContext(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const pen = canvas.getContext("2d");
  pen.scale(ratio, ratio);
  return { pen, width, height };
}

function drawMap() {
  const canvas = get("map");
  const { pen, width, height } = canvasContext(canvas);
  const mapWidth = Math.min(width - 22, (height - 8) * 2.75);
  const mapHeight = Math.min(height - 10, mapWidth / 2.62);
  const left = (width - mapWidth) / 2;
  const top = (height - mapHeight) / 2;
  const x = (lon) => left + (lon + 180) / 360 * mapWidth;
  const y = (lat) => top + (85 - lat) / 145 * mapHeight;

  pen.lineWidth = 1;
  pen.strokeStyle = "#382b53";
  pen.beginPath();
  for (let lon = -180; lon <= 180; lon += 30) {
    pen.moveTo(x(lon), top);
    pen.lineTo(x(lon), top + mapHeight);
  }
  for (let lat = -60; lat <= 80; lat += 20) {
    pen.moveTo(left, y(lat));
    pen.lineTo(left + mapWidth, y(lat));
  }
  pen.stroke();

  pen.fillStyle = "#443460";
  pen.strokeStyle = "#6b558b";
  for (const ring of coastline) {
    pen.beginPath();
    ring.forEach(([lon, lat], index) => {
      if (index === 0) pen.moveTo(x(lon), y(lat));
      else pen.lineTo(x(lon), y(lat));
    });
    pen.closePath();
    pen.fill();
    pen.stroke();
  }

  for (const city of cities) {
    const pin = pins.get(city.id);
    pin.style.left = x(city.lon) + "px";
    pin.style.top = y(city.lat) + "px";
    pin.classList.toggle("east", city.lon > 65);
  }
}

function addPin(city) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pin";
  button.setAttribute("aria-label", city.name);
  button.setAttribute("aria-pressed", "false");
  const mark = document.createElement("span");
  mark.className = "pin-mark";
  mark.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "pin-label";
  label.setAttribute("aria-hidden", "true");
  label.textContent = city.name;
  button.append(mark, label);
  button.addEventListener("click", () => loadCity(city.id));
  get("map-pins").append(button);
  pins.set(city.id, button);
}

function renderTrend(city) {
  get("trend-status").hidden = true;
  get("trend-caption").textContent = city.name + " · 城市當地時間";
  const rows = get("hourly-rows");
  rows.replaceChildren();
  for (const point of hourly) {
    const row = rows.insertRow();
    row.insertCell().textContent = cityTime(point.time, city, {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    row.insertCell().textContent = point.aqi ?? "缺值";
  }
  get("chart-wrap").hidden = false;
  get("hourly-details").hidden = false;
  drawChart();
}

function drawChart() {
  if (!hourly.length) return;
  const { pen, width, height } = canvasContext(get("chart"));
  const city = cityById.get(selected);
  const step = Math.max(10, Math.ceil(Math.max(...hourly.map((point) => point.aqi ?? 0)) / 40) * 10);
  const maximum = step * 4;
  const left = 38;
  const right = width - 15;
  const bottom = height - 25;
  const top = 13;
  const x = (index) => left + index / Math.max(1, hourly.length - 1) * (right - left);
  const y = (value) => bottom - value / maximum * (bottom - top);

  pen.font = '12px "DM Sans", sans-serif';
  pen.fillStyle = "#625878";
  pen.strokeStyle = "#eae5f2";
  pen.textAlign = "right";
  for (let value = 0; value <= maximum; value += step) {
    const position = y(value);
    pen.fillText(value, left - 8, position + 4);
    pen.beginPath();
    pen.moveTo(left, position);
    pen.lineTo(right, position);
    pen.stroke();
  }

  pen.textAlign = "center";
  const tickCount = width < 510 ? 4 : 6;
  const indices = new Set(Array.from({ length: tickCount }, (_, index) =>
    Math.round(index * (hourly.length - 1) / (tickCount - 1))));
  for (const index of indices) {
    const label = cityTime(hourly[index].time, city, { hour: "2-digit", minute: "2-digit" });
    pen.fillText(label, Math.min(width - 18, x(index)), height - 5);
  }

  const segments = [];
  let segment = [];
  hourly.forEach((point, index) => {
    if (point.aqi === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push([x(index), y(point.aqi)]);
  });
  if (segment.length) segments.push(segment);
  const gradient = pen.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, "#d9c7ff");
  gradient.addColorStop(1, "#efe8fb");
  for (const points of segments) {
    pen.beginPath();
    pen.moveTo(points[0][0], bottom);
    for (const [px, py] of points) pen.lineTo(px, py);
    pen.lineTo(points.at(-1)[0], bottom);
    pen.closePath();
    pen.fillStyle = gradient;
    pen.fill();

    pen.beginPath();
    points.forEach(([px, py], index) => {
      if (index === 0) pen.moveTo(px, py);
      else pen.lineTo(px, py);
    });
    pen.lineWidth = 2.5;
    pen.lineJoin = "round";
    pen.strokeStyle = "#7351c7";
    pen.stroke();
    if (points.length === 1 || points === segments.at(-1)) {
      const [px, py] = points.at(-1);
      pen.beginPath();
      pen.arc(px, py, 4, 0, Math.PI * 2);
      pen.fillStyle = "#7351c7";
      pen.fill();
    }
  }
}

for (const city of cities) {
  addPin(city);
  cards.get(city.id).addEventListener("click", () => loadCity(city.id, { scroll: true }));
}
new ResizeObserver(drawMap).observe(get("map"));
new ResizeObserver(drawChart).observe(get("chart-wrap"));
fetch("/world-coastlines.json")
  .then((response) => {
    if (!response.ok) throw new Error("Map unavailable");
    return response.json();
  })
  .then((data) => { coastline = data; drawMap(); })
  .catch(() => { get("map-message").hidden = false; });

get("city-form").addEventListener("submit", (event) => {
  event.preventDefault();
  loadCity(get("city-select").value, { refreshOverview: true });
});
get("city-select").addEventListener("change", (event) => loadCity(event.target.value));
get("retry").addEventListener("click", () => loadCity(selected));
get("overview-retry").addEventListener("click", loadOverview);
loadCity(selected);
loadOverview();
