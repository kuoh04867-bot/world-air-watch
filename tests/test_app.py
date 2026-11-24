import unittest
from unittest.mock import Mock, patch

import requests

from app import CITIES, ENDPOINT, app


def valid_data(aqi=64):
    return {
        "current": {
            "time": "2026-11-24T02:00",
            "us_aqi": aqi,
            "pm2_5": 13.0,
            "pm10": 18.5,
            "ozone": 48.2,
            "nitrogen_dioxide": 16.0,
        },
        "hourly": {
            "time": ["2026-11-24T00:00", "2026-11-24T01:00", "2026-11-24T02:00"],
            "us_aqi": [61, None, aqi],
        },
    }


def upstream(data=None, status=200):
    return Mock(status_code=status, **{"json.return_value": data})


class AirQualityTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.url = "/api/air-quality?city=taipei"

    def assert_error(self, path, status, code):
        response = self.client.get(path)
        self.assertEqual(response.status_code, status)
        self.assertEqual(response.json["code"], code)
        self.assertIs(response.json["ok"], False)
        self.assertTrue(response.json["message"])

    def test_home_and_submission(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("世界空氣品質".encode(), response.data)
        self.assertIn("郭柏華".encode(), response.data)
        self.assertEqual(self.client.get("/submission").status_code, 200)
        with self.client.get("/dashboard.js") as js:
            self.assertEqual(js.status_code, 200)

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"ok": True})

    @patch("app.requests.get", return_value=upstream(valid_data()))
    def test_air_quality_success(self, fetch):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["city"]["name"], "台北")
        self.assertEqual(response.json["current"]["category"]["key"], "moderate")
        self.assertEqual(response.json["current"]["time"], "2026-11-24T02:00:00Z")
        self.assertEqual(response.json["hourly"][1]["aqi"], None)
        self.assertEqual(response.json["pollutants"]["pm2_5"], 13)
        self.assertEqual(fetch.call_args.args, (ENDPOINT,))
        self.assertEqual(fetch.call_args.kwargs["timeout"], (3, 7))
        self.assertFalse(fetch.call_args.kwargs["allow_redirects"])

    @patch("app.requests.get")
    def test_unknown_city_no_upstream_call(self, fetch):
        self.assert_error("/api/air-quality?city=invalid", 400, "unknown_city")
        fetch.assert_not_called()

    @patch("app.requests.get", side_effect=requests.Timeout)
    def test_timeout(self, fetch):
        self.assert_error(self.url, 504, "upstream_timeout")

    @patch("app.requests.get", side_effect=requests.ConnectionError)
    def test_network_error(self, fetch):
        self.assert_error(self.url, 502, "upstream_network_error")

    @patch("app.requests.get", return_value=upstream(status=429))
    def test_rate_limit(self, fetch):
        self.assert_error(self.url, 503, "upstream_rate_limit")

    @patch("app.requests.get", return_value=upstream(status=500))
    def test_upstream_http_error(self, fetch):
        self.assert_error(self.url, 502, "upstream_http_error")

    @patch("app.requests.get", return_value=Mock(status_code=200, **{"json.side_effect": ValueError}))
    def test_invalid_json(self, fetch):
        self.assert_error(self.url, 502, "upstream_invalid_json")

    @patch("app.requests.get", return_value=upstream(valid_data()))
    def test_missing_pollutant(self, fetch):
        del fetch.return_value.json.return_value["current"]["pm2_5"]
        self.assert_error(self.url, 502, "upstream_missing_fields")

    @patch("app.requests.get", return_value=upstream(valid_data()))
    def test_invalid_hourly_shape(self, fetch):
        fetch.return_value.json.return_value["hourly"]["time"] = []
        self.assert_error(self.url, 502, "upstream_missing_fields")

    @patch("app.requests.get", return_value=upstream([]))
    def test_empty_result(self, fetch):
        self.assert_error(self.url, 502, "no_data")

    @patch("app.requests.get", return_value=upstream(valid_data()))
    def test_history_empty(self, fetch):
        fetch.return_value.json.return_value["hourly"]["us_aqi"] = [None, None, None]
        self.assert_error(self.url, 502, "no_history")

    @patch("app.requests.get")
    def test_overview_with_single_missing_city(self, fetch):
        entries = [valid_data(35 + index) for index in range(len(CITIES))]
        entries[0]["current"]["us_aqi"] = None
        fetch.return_value = upstream(entries)
        response = self.client.get("/api/cities")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json["cities"]), len(CITIES))
        self.assertEqual(response.json["cities"][0], {"current": None, "id": "taipei"})
        self.assertEqual(response.json["cities"][1]["current"]["aqi"], 36)
