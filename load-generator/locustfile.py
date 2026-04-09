"""
Generic App - Locust Load Generator
====================================
Simulates real user navigation through the web UI.
AGENT: Update endpoints, payloads, and user profiles to match industry.yaml.
"""

import os
import random
import time
from locust import HttpUser, SequentialTaskSet, task, between

# --- Demo Users (from industry.yaml demo_users) ---
# AGENT: Update to match industry.yaml demo_users
DEMO_USERNAMES = [
    "admin_user", "manager_north", "manager_south",
    "operator_1", "operator_2", "operator_3", "operator_4", "operator_5",
    "viewer_1", "viewer_2", "viewer_3", "viewer_4", "viewer_5", "viewer_6", "viewer_7",
]
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "changeme2026")

# --- Tab endpoints (from industry.yaml ui_tabs) ---
# AGENT: Update to match industry.yaml ui_tabs endpoints
TAB_ENDPOINTS = [
    "/api/analytics/dashboard",
    "/api/incidents",
    "/api/readings",
    "/api/telemetry",
    "/api/topology",
    "/api/analytics/trends",
    "/api/forecasts",
    "/api/dispatch",
    "/api/notifications",
    "/api/external",
    "/api/aggregation",
    "/api/pricing",
    "/api/work-orders",
    "/api/correlation",
    "/api/audit",
    "/api/auth/users",
]


def think(min_s=1, max_s=5):
    """Simulate user reading/thinking time."""
    time.sleep(random.uniform(min_s, max_s))


class UISession(SequentialTaskSet):
    """Emulates a user session: login -> navigate tabs -> logout."""

    def on_start(self):
        self.username = random.choice(DEMO_USERNAMES)
        # Login
        resp = self.client.post("/api/auth/login", json={
            "username": self.username,
            "password": DEMO_PASSWORD,
        }, name="POST /api/auth/login")
        if resp.status_code == 200:
            data = resp.json()
            if not data.get("success"):
                self.interrupt()
        else:
            self.interrupt()
        think(1, 2)

    # Load the main page
    @task
    def load_page(self):
        self.client.get("/", name="GET / (main page)")
        think(0.5, 1)

    # Visit dashboard first (always)
    @task
    def visit_dashboard(self):
        self.client.get("/api/analytics/dashboard", name="GET /api/analytics/dashboard")
        think(2, 5)

    # Navigate through random selection of tabs
    @task
    def browse_tabs(self):
        # Pick 5-10 random tabs to visit
        tabs_to_visit = random.sample(TAB_ENDPOINTS[1:], k=random.randint(5, min(10, len(TAB_ENDPOINTS)-1)))
        for endpoint in tabs_to_visit:
            self.client.get(endpoint, name=f"GET {endpoint}")
            think(self.user.think_min, self.user.think_max)

    # Occasionally create data
    @task
    def create_data(self):
        if random.random() < 0.3:
            # AGENT: Update POST payloads to match industry entities
            self.client.post("/api/incidents", json={
                "title": f"Incident from {self.username}",
                "region": random.choice(["region-1", "region-2", "region-3", "region-4", "region-5"]),
                "severity": random.choice(["low", "medium", "high", "critical"]),
                "affected_count": random.randint(1, 5000),
            }, name="POST /api/incidents")
            think(1, 3)

        if random.random() < 0.2:
            self.client.post("/api/work-orders", json={
                "title": f"Work Order from {self.username}",
                "assignee": random.choice(DEMO_USERNAMES),
                "priority": random.choice(["low", "medium", "high", "urgent"]),
            }, name="POST /api/work-orders")
            think(1, 2)

    # Return to dashboard
    @task
    def return_dashboard(self):
        self.client.get("/api/analytics/dashboard", name="GET /api/analytics/dashboard")
        think(2, 4)

    # Logout
    @task
    def logout(self):
        think(0.5, 1)
        self.interrupt()  # End session, Locust will restart


class CasualBrowser(HttpUser):
    """Casual user - browses slowly, mostly views data."""
    tasks = [UISession]
    weight = 5
    wait_time = between(5, 15)
    think_min = 3
    think_max = 8


class ActiveOperator(HttpUser):
    """Active operator - moderate speed, creates some data."""
    tasks = [UISession]
    weight = 3
    wait_time = between(2, 6)
    think_min = 2
    think_max = 5


class PowerUser(HttpUser):
    """Power user - fast navigation, creates data frequently."""
    tasks = [UISession]
    weight = 2
    wait_time = between(1, 3)
    think_min = 1
    think_max = 3
