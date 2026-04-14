"""
Generic App - Locust Load Generator
====================================
Simulates real user sessions navigating through the web UI.
Each session: login -> navigate 10 random tabs -> logout.
Each tab fires the specific API calls the browser would make.

AGENT: Update endpoints, payloads, and user profiles to match industry.yaml.

Dynatrace RUM Integration:
- Real browser User-Agent strings for accurate Dynatrace detection
- Referer headers chain correctly for user-action detection
- X-Session-Id header for server-side session grouping
- X-Forwarded-For for geo-location simulation
"""

import os
import random
import time
import uuid
from locust import HttpUser, task, between, TaskSet

# --- Demo Users (from industry.yaml demo_users) ---
# AGENT: Update to match industry.yaml demo_users
DEMO_USERNAMES = [
    "admin_user", "manager_north", "manager_south",
    "operator_1", "operator_2", "operator_3", "operator_4", "operator_5",
    "viewer_1", "viewer_2", "viewer_3", "viewer_4", "viewer_5", "viewer_6", "viewer_7",
]
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "changeme2026")
APP_BASE_URL = os.getenv("LOCUST_HOST", "http://api-gateway:3000")
MAX_NAVIGATIONS = 10

# AGENT: Update search terms for the target industry
SEARCH_TERMS = [
    "incident", "critical", "failure", "maintenance", "upgrade",
    "region-1", "region-2", "threshold", "anomaly", "forecast",
]

# Real browser User-Agent strings for Dynatrace detection
BROWSER_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
]

# Simulated client IPs for Dynatrace geo-location
CLIENT_IPS = [
    "73.162.45.112", "68.134.201.88", "24.101.55.200", "71.178.92.44",
    "98.169.118.33", "72.83.145.77", "50.206.71.129", "75.144.58.201",
]


def think(low=1, high=4):
    """Simulate user reading/thinking time between actions."""
    time.sleep(random.uniform(low, high))


class UISession(TaskSet):
    """
    Simulates a user session: login -> navigate 10 random pages -> logout.
    Each navigation fires the specific API calls the browser would make.
    """

    def on_start(self):
        self.session_id = str(uuid.uuid4())
        self.username = random.choice(DEMO_USERNAMES)
        self.current_page = "/login"
        self.nav_count = 0
        self.token = ""

        with self.client.post("/api/auth/login", json={
            "username": self.username,
            "password": DEMO_PASSWORD
        }, headers=self._browser_headers(),
           name="[Login] POST /api/auth/login", catch_response=True) as resp:
            if resp.status_code == 200:
                try:
                    self.token = resp.json().get("token", "")
                    resp.success()
                except Exception:
                    self.token = ""
                    resp.failure("Bad login response")
            else:
                self.token = ""
                resp.failure(f"Login HTTP {resp.status_code}")
        think(1, 2)

    @task
    def navigate_page(self):
        if self.nav_count >= MAX_NAVIGATIONS:
            if self.token:
                self.client.post("/api/auth/logout",
                                 headers=self._browser_headers(),
                                 name="[Logout] POST /api/auth/logout")
            self.interrupt()
            return

        handler = random.choice([
            self._nav_dashboard, self._nav_incidents, self._nav_readings,
            self._nav_telemetry, self._nav_topology, self._nav_analytics,
            self._nav_forecasts, self._nav_dispatch, self._nav_notifications,
            self._nav_external, self._nav_aggregation, self._nav_pricing,
            self._nav_work_orders, self._nav_correlation, self._nav_audit,
            self._nav_users, self._nav_search, self._nav_health,
        ])
        handler()
        self.nav_count += 1

    # ---- Tab navigation methods ----
    # AGENT: Update API paths to match renamed services

    def _nav_dashboard(self):
        h = self._browser_headers()
        self.client.get("/api/dashboard", headers=h, name="[Dashboard] GET /api/dashboard")
        self.client.get("/api/incidents/active", headers=h, name="[Dashboard] GET /api/incidents/active")
        self.client.get("/api/telemetry/alerts", headers=h, name="[Dashboard] GET /api/telemetry/alerts")
        self.client.get("/api/external/conditions", headers=h, name="[Dashboard] GET /api/external/conditions")
        self.client.get("/api/dispatch/teams", headers=h, name="[Dashboard] GET /api/dispatch/teams")
        self.client.get("/api/dispatch/active", headers=h, name="[Dashboard] GET /api/dispatch/active")
        self.current_page = "/dashboard"

    def _nav_incidents(self):
        h = self._browser_headers()
        self.client.get("/api/incidents/stats/summary", headers=h, name="[Incidents] GET /api/incidents/stats/summary")
        resp = self.client.get("/api/incidents", headers=h, name="[Incidents] GET /api/incidents")
        self.current_page = "/incidents"
        if resp.status_code == 200:
            try:
                incidents = resp.json()
                items = incidents if isinstance(incidents, list) else incidents.get("incidents", [])
                if items:
                    iid = random.choice(items).get("id", "INC-001")
                    self.client.get(f"/api/incidents/{iid}",
                                    headers=self._browser_headers(),
                                    name="[Incidents] GET /api/incidents/[id]")
            except Exception:
                pass

    def _nav_readings(self):
        h = self._browser_headers()
        self.client.get("/api/readings/summary", headers=h, name="[Readings] GET /api/readings/summary")
        self.client.get("/api/readings", headers=h, name="[Readings] GET /api/readings")
        self.current_page = "/readings"

    def _nav_telemetry(self):
        h = self._browser_headers()
        self.client.get("/api/telemetry/summary", headers=h, name="[Telemetry] GET /api/telemetry/summary")
        self.client.get("/api/telemetry/latest", headers=h, name="[Telemetry] GET /api/telemetry/latest")
        self.client.get("/api/telemetry/alerts?limit=30", headers=h, name="[Telemetry] GET /api/telemetry/alerts")
        self.current_page = "/telemetry"

    def _nav_topology(self):
        h = self._browser_headers()
        self.client.get("/api/topology/stats", headers=h, name="[Topology] GET /api/topology/stats")
        self.client.get("/api/topology/hierarchy", headers=h, name="[Topology] GET /api/topology/hierarchy")
        self.current_page = "/topology"

    def _nav_analytics(self):
        h = self._browser_headers()
        self.client.get("/api/analytics/indices", headers=h, name="[Analytics] GET /api/analytics/indices")
        self.client.get("/api/analytics/history", headers=h, name="[Analytics] GET /api/analytics/history")
        self.current_page = "/analytics"

    def _nav_forecasts(self):
        h = self._browser_headers()
        self.client.get("/api/forecasts/summary", headers=h, name="[Forecasts] GET /api/forecasts/summary")
        self.client.get("/api/forecasts/current", headers=h, name="[Forecasts] GET /api/forecasts/current")
        self.client.get("/api/forecasts/regions", headers=h, name="[Forecasts] GET /api/forecasts/regions")
        self.current_page = "/forecasts"

    def _nav_dispatch(self):
        h = self._browser_headers()
        self.client.get("/api/dispatch/stats", headers=h, name="[Dispatch] GET /api/dispatch/stats")
        self.client.get("/api/dispatch/teams", headers=h, name="[Dispatch] GET /api/dispatch/teams")
        self.client.get("/api/dispatch/active", headers=h, name="[Dispatch] GET /api/dispatch/active")
        self.client.get("/api/dispatch", headers=h, name="[Dispatch] GET /api/dispatch")
        self.current_page = "/dispatch"

    def _nav_notifications(self):
        h = self._browser_headers()
        self.client.get("/api/notifications/stats", headers=h, name="[Notifications] GET /api/notifications/stats")
        self.client.get("/api/notifications/log?limit=50", headers=h, name="[Notifications] GET /api/notifications/log")
        self.current_page = "/notifications"

    def _nav_external(self):
        h = self._browser_headers()
        self.client.get("/api/external/summary", headers=h, name="[External] GET /api/external/summary")
        self.client.get("/api/external/conditions", headers=h, name="[External] GET /api/external/conditions")
        self.client.get("/api/external/forecast", headers=h, name="[External] GET /api/external/forecast")
        self.client.get("/api/external/alerts?limit=30", headers=h, name="[External] GET /api/external/alerts")
        self.client.get("/api/external/correlations", headers=h, name="[External] GET /api/external/correlations")
        self.current_page = "/external"

    def _nav_aggregation(self):
        h = self._browser_headers()
        self.client.get("/api/aggregation/dashboard", headers=h, name="[Aggregation] GET /api/aggregation/dashboard")
        self.client.get("/api/aggregation/operations", headers=h, name="[Aggregation] GET /api/aggregation/operations")
        self.current_page = "/aggregation"

    def _nav_pricing(self):
        h = self._browser_headers()
        self.client.get("/api/pricing/current", headers=h, name="[Pricing] GET /api/pricing/current")
        self.client.get("/api/pricing/rates", headers=h, name="[Pricing] GET /api/pricing/rates")
        self.client.get("/api/pricing/regions", headers=h, name="[Pricing] GET /api/pricing/regions")
        self.current_page = "/pricing"
        # Simulate a pricing calculation
        region = random.choice(["region-1", "region-2", "region-3", "region-4", "region-5"])
        self.client.get(f"/api/pricing/calculate?region={region}&quantity={random.randint(100, 5000)}",
                        headers=self._browser_headers(),
                        name="[Pricing] GET /api/pricing/calculate")

    def _nav_work_orders(self):
        h = self._browser_headers()
        page = random.randint(1, 5)
        self.client.get(f"/api/work-orders?page={page}&limit=20", headers=h,
                        name="[WorkOrders] GET /api/work-orders")
        self.client.get("/api/work-orders/stats", headers=h,
                        name="[WorkOrders] GET /api/work-orders/stats")
        self.current_page = "/work-orders"

    def _nav_correlation(self):
        h = self._browser_headers()
        self.client.get("/api/correlation/correlated?limit=30", headers=h,
                        name="[Correlation] GET /api/correlation/correlated")
        self.client.get("/api/correlation/stats", headers=h,
                        name="[Correlation] GET /api/correlation/stats")
        self.current_page = "/correlation"

    def _nav_audit(self):
        h = self._browser_headers()
        page = random.randint(1, 5)
        self.client.get(f"/api/audit/log?page={page}&limit=30", headers=h,
                        name="[Audit] GET /api/audit/log")
        self.client.get("/api/audit/stats", headers=h,
                        name="[Audit] GET /api/audit/stats")
        self.current_page = "/audit"

    def _nav_users(self):
        h = self._browser_headers()
        self.client.get("/api/auth/users", headers=h, name="[Users] GET /api/auth/users")
        self.current_page = "/users"

    def _nav_search(self):
        h = self._browser_headers()
        term = random.choice(SEARCH_TERMS)
        self.client.get(f"/api/search?q={term}", headers=h,
                        name="[Search] GET /api/search")

    def _nav_health(self):
        h = self._browser_headers()
        self.client.get("/api/health", headers=h, name="[Health] GET /api/health")
        self.current_page = "/health"

    def _browser_headers(self, accept="application/json, text/plain, */*"):
        h = {
            "User-Agent": self.user.ua,
            "Accept": accept,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": f"{APP_BASE_URL}{self.current_page}",
            "Origin": APP_BASE_URL,
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "X-Requested-With": "XMLHttpRequest",
            "X-Session-Id": self.session_id,
            "X-Username": self.username,
            "X-Forwarded-For": self.user.client_ip,
        }
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h


# ============================================================
# User Classes — different browsing speeds
# Each user gets a persistent browser UA + client IP.
# wait_time controls pause between page navigations.
# ============================================================

class CasualBrowser(HttpUser):
    """Casual user — browses slowly, longer pauses between pages."""
    wait_time = between(3, 8)
    weight = 5
    tasks = {UISession: 1}

    def on_start(self):
        self.ua = random.choice(BROWSER_USER_AGENTS)
        self.client_ip = random.choice(CLIENT_IPS)


class ActiveOperator(HttpUser):
    """Active operator — moderate pace, creates some data."""
    wait_time = between(2, 5)
    weight = 3
    tasks = {UISession: 1}

    def on_start(self):
        self.ua = random.choice(BROWSER_USER_AGENTS)
        self.client_ip = random.choice(CLIENT_IPS)


class PowerUser(HttpUser):
    """Power user — rapid navigation through pages."""
    wait_time = between(1, 3)
    weight = 2
    tasks = {UISession: 1}

    def on_start(self):
        self.ua = random.choice(BROWSER_USER_AGENTS)
        self.client_ip = random.choice(CLIENT_IPS)
