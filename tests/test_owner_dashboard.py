import unittest
import os
import re
from html.parser import HTMLParser

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class TagCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.ids = set()
        self.classes = set()
        self.data_attrs = set()

    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        for name, value in attrs:
            if name == "id" and value:
                self.ids.add(value)
            elif name == "class" and value:
                for c in value.split():
                    self.classes.add(c)
            elif name.startswith("data-"):
                self.data_attrs.add(name)

class TestOwnerDashboardHTML(unittest.TestCase):
    def setUp(self):
        html_path = os.path.join(ROOT_DIR, "web", "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            self.html = f.read()
        self.parser = TagCollector()
        self.parser.feed(self.html)

    def test_all_owner_screens_present(self):
        expected_screens = [
            "ownerScreenOverview",
            "ownerScreenMap",
            "ownerScreenVehicles",
            "ownerScreenDrivers",
            "ownerScreenEarnings",
            "ownerScreenBilling"
        ]
        for screen in expected_screens:
            self.assertIn(screen, self.parser.ids, f"Missing screen: {screen}")

    def test_navigation_tabs_present(self):
        tabs = ["overview", "map", "vehicles", "drivers", "earnings", "billing"]
        for tab in tabs:
            self.assertIn(f'data-owner-tab="{tab}"', self.html, f"Missing nav button for {tab}")

    def test_essential_metrics_and_spotlight_present(self):
        # Overview KPIs & Spotlight
        for el_id in ["oTakings", "oActive", "oPax", "oDigital", "oTrips",
                      "topVehicleCard", "bottomVehicleCard", "fleetList"]:
            self.assertIn(el_id, self.parser.ids, f"Missing element: {el_id}")

    def test_vehicle_detail_and_map_present(self):
        for el_id in ["ownerMap", "mapVehicleList", "vehicleDetailView",
                      "vdPlate", "vdCashBar", "vdDigitalBar", "vd7dChart"]:
            self.assertIn(el_id, self.parser.ids, f"Missing element: {el_id}")

    def test_drivers_and_earnings_present(self):
        for el_id in ["driverTable", "drTotal", "drAvgPerHour",
                      "btnEarn7d", "btnEarn30d", "fleetEarningsChart", "earningsVehicleTable"]:
            self.assertIn(el_id, self.parser.ids, f"Missing element: {el_id}")

    def test_billing_section_present(self):
        for el_id in ["billFleetSize", "billMonthlyTotal", "btnUpdatePayment"]:
            self.assertIn(el_id, self.parser.ids, f"Missing element: {el_id}")
        self.assertIn("TransSport Fleet Pilot", self.html)
        self.assertIn("₦10,000", self.html)

class TestOwnerDashboardCSS(unittest.TestCase):
    def setUp(self):
        css_path = os.path.join(ROOT_DIR, "web", "styles.css")
        with open(css_path, "r", encoding="utf-8") as f:
            self.css = f.read()

    def test_design_tokens(self):
        for token in ["--bg:", "--text:", "--muted:", "--line:", "--ok:", "--warn:", "--bad:"]:
            self.assertIn(token, self.css, f"Missing design token: {token}")

    def test_stale_and_ratio_styling(self):
        self.assertIn(".bus.stale", self.css)
        self.assertIn(".momo-ratio-bar", self.css)
        self.assertIn(".status-badge", self.css)

    def test_responsive_media_queries(self):
        self.assertIn("min-width: 900px", self.css, "Missing laptop responsive media query")
        self.assertIn(".app.owner-mode", self.css, "Missing desktop expansion for owner mode")

if __name__ == "__main__":
    unittest.main()
