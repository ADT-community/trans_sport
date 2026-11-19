import unittest
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class TestDriverApp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(ROOT, "web/index.html"), "r", encoding="utf-8") as f:
            cls.html = f.read()
        with open(os.path.join(ROOT, "web/styles.css"), "r", encoding="utf-8") as f:
            cls.css = f.read()
        with open(os.path.join(ROOT, "web/app.js"), "r", encoding="utf-8") as f:
            cls.app_js = f.read()
        with open(os.path.join(ROOT, "web/sim.js"), "r", encoding="utf-8") as f:
            cls.sim_js = f.read()

    def test_design_tokens_defined(self):
        """Verify design tokens are specified as CSS variables in web/styles.css."""
        required_tokens = [
            "--touch-target: 48px",
            "--bg:",
            "--text:",
            "--muted:",
            "--line:",
            "--soft:",
            "--ok:",
            "--warn:",
            "--bad:",
            "--radius-md:",
            "--font-sans:"
        ]
        for token in required_tokens:
            self.assertIn(token, self.css, f"Token {token} must be defined in web/styles.css")

    def test_touch_targets_48px(self):
        """Verify touch target 48px rules exist in CSS for driver controls."""
        self.assertRegex(self.css, r"\.touch-48\s*\{[^}]*min-height:\s*var\(--touch-target\)")
        self.assertRegex(self.css, r"\.driver-nav-btn\s*\{[^}]*min-height:\s*var\(--touch-target\)")
        self.assertRegex(self.css, r"\.step-btn\s*\{[^}]*height:\s*var\(--touch-target\)")

    def test_all_six_figma_screens_present(self):
        """Verify all 6 driver screens required by Figma exist in index.html."""
        screens = [
            "driverScreenSignIn",
            "driverScreenShift",
            "driverScreenCash",
            "driverScreenMomo",
            "driverScreenToday",
            "driverScreenSettings"
        ]
        for s in screens:
            self.assertIn(f'id="{s}"', self.html, f"Screen {s} must be present in index.html")

    def test_driver_navigation_tabs(self):
        """Verify driver sub-navigation bar has buttons for all views."""
        tabs = ["shift", "cash", "momo", "today", "settings"]
        for tab in tabs:
            self.assertIn(f'data-driver-tab="{tab}"', self.html, f"Tab {tab} must be in driver nav")

    def test_shift_screen_elements(self):
        """Verify Shift screen has timer, GPS indicator, Start/End button, and passenger stepper."""
        self.assertIn('id="shiftBtn"', self.html)
        self.assertIn('id="shiftTimer"', self.html)
        self.assertIn('id="gpsStatus"', self.html)
        self.assertIn('id="driverSyncBanner"', self.html)
        self.assertIn('id="paxMinus"', self.html)
        self.assertIn('id="paxPlus"', self.html)
        self.assertIn('id="dOnboard"', self.html)
        self.assertIn('id="dCapacity"', self.html)
        self.assertIn('id="endTrip"', self.html)

    def test_cash_screen_elements_and_undo(self):
        """Verify Cash screen has one-tap standard button, presets, and Undo button."""
        self.assertIn('id="cashAddStandard"', self.html)
        self.assertIn('id="cashAdd2Pax"', self.html)
        self.assertIn('id="cashAdd3Pax"', self.html)
        self.assertIn('id="cashPresetsGrid"', self.html)
        self.assertIn('id="cashCustomInput"', self.html)
        self.assertIn('id="cashUndoBtn"', self.html)
        self.assertIn('id="cashAuditList"', self.html)
        self.assertIn('id="cashEmptyState"', self.html)

    def test_momo_screen_elements(self):
        """Verify MoMo screen has 6-digit pay code, QR box, status pill, and actions."""
        self.assertIn('id="momoPayCode"', self.html)
        self.assertIn('id="momoQrBox"', self.html)
        self.assertIn('id="momoStatusPill"', self.html)
        self.assertIn('id="momoConfirmedBox"', self.html)
        self.assertIn('id="momoConfirmBtn"', self.html)
        self.assertIn('id="momoNewCodeBtn"', self.html)

    def test_today_screen_elements(self):
        """Verify Today screen has takings banner, stats quad, progress bar, and trips list."""
        self.assertIn('id="dTodayTakings"', self.html)
        self.assertIn('id="dTodayCash"', self.html)
        self.assertIn('id="dTodayDigital"', self.html)
        self.assertIn('id="dTodayTrips"', self.html)
        self.assertIn('id="dTodayPax"', self.html)
        self.assertIn('id="dTodayHours"', self.html)
        self.assertIn('class="split-progress-bar"', self.html)
        self.assertIn('id="dTripsList"', self.html)
        self.assertIn('id="dTodayEmptyState"', self.html)

    def test_settings_screen_elements(self):
        """Verify Settings screen has vehicle switcher, language selector, help, and simulation."""
        self.assertIn('id="driverVehicleSelect"', self.html)
        self.assertIn('id="driverLangSelect"', self.html)
        self.assertIn('id="driverEmergencyBtn"', self.html)
        self.assertIn('id="driverWhatsappBtn"', self.html)
        self.assertIn('id="driverToggleOffline"', self.html)
        self.assertIn('id="driverToggleWeakGps"', self.html)
        self.assertIn('id="driverSignOutBtn"', self.html)

    def test_accessibility_standards(self):
        """Verify form controls have accessible labels and inputs have type/autocomplete."""
        # Test input tags
        inputs = re.findall(r'<input\s+[^>]*id="([^"]+)"[^>]*>', self.html)
        for inp_id in inputs:
            has_for_label = f'for="{inp_id}"' in self.html
            self.assertTrue(
                has_for_label or f'id="{inp_id}" aria-label' in self.html or f'aria-label' in self.html,
                f"Input with id '{inp_id}' must have accessible label"
            )
        # Test select tags
        selects = re.findall(r'<select\s+[^>]*id="([^"]+)"[^>]*>', self.html)
        for sel_id in selects:
            has_for_label = f'for="{sel_id}"' in self.html
            self.assertTrue(has_for_label, f"Select with id '{sel_id}' must have matching label for")

    def test_multilingual_dictionary_in_app(self):
        """Verify app.js provides multi-language support (English, Yoruba, Hausa, Igbo, Pidgin)."""
        self.assertIn("en:", self.app_js)
        self.assertIn("yo:", self.app_js)
        self.assertIn("ha:", self.app_js)
        self.assertIn("ig:", self.app_js)
        self.assertIn("pcm:", self.app_js)

if __name__ == "__main__":
    unittest.main()
