#!/usr/bin/env python3
"""
Generate 360px mobile width screenshots for each of the 6 driver screens
matching the Figma specifications.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "screenshots")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

def get_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

f_title = get_font(FONT_BOLD, 18)
f_sub = get_font(FONT_SANS, 12)
f_body = get_font(FONT_SANS, 13)
f_body_b = get_font(FONT_BOLD, 13)
f_h2 = get_font(FONT_BOLD, 16)
f_btn = get_font(FONT_BOLD, 14)
f_big = get_font(FONT_BOLD, 22)
f_mono = get_font(FONT_MONO, 24)
f_nav = get_font(FONT_BOLD, 10)

BG = (255, 255, 255)
TEXT = (17, 17, 17)
MUTED = (89, 89, 89)
LINE = (226, 232, 240)
SOFT = (248, 250, 252)
OK = (21, 128, 61)
WARN = (180, 83, 9)
BAD = (185, 28, 28)
BLUE = (37, 99, 235)

def draw_header_and_nav(draw, active_tab="shift"):
    # Status bar
    draw.text((16, 8), "9:41", fill=TEXT, font=f_sub)
    draw.text((310, 8), "100%", fill=TEXT, font=f_sub)

    # Brand row
    draw.text((16, 32), "trans_sport", fill=TEXT, font=f_title)
    # Profile pill
    draw.rounded_rectangle([200, 26, 344, 52], radius=13, fill=SOFT, outline=LINE)
    draw.text((212, 34), "Tunde · LND 482", fill=TEXT, font=f_sub)

    # Sub-nav (5 tabs)
    tabs = [
        ("shift", "Shift"),
        ("cash", "Cash"),
        ("momo", "MoMo"),
        ("today", "Today"),
        ("settings", "Settings")
    ]
    tab_w = 64
    for i, (k, label) in enumerate(tabs):
        x = 16 + i * 66
        y = 62
        is_act = (k == active_tab)
        bg_col = SOFT if is_act else (255, 255, 255)
        border_col = LINE if is_act else (255, 255, 255)
        text_col = TEXT if is_act else MUTED
        draw.rounded_rectangle([x, y, x + tab_w, y + 44], radius=8, fill=bg_col, outline=border_col)
        draw.text((x + 12, y + 14), label, fill=text_col, font=f_nav)

    draw.line([0, 114, 360, 114], fill=LINE, width=1)

def draw_bottom_tabs(draw, active_view="drive"):
    draw.line([0, 680, 360, 680], fill=LINE, width=1)
    draw.rectangle([0, 681, 360, 740], fill=BG)
    tabs = ["Ride", "Drive", "Owner"]
    for i, t in enumerate(tabs):
        x = 40 + i * 110
        col = TEXT if t.lower() == active_view else MUTED
        draw.text((x, 696), t, fill=col, font=f_body_b)

def make_screenshot(name, render_content, active_tab="shift"):
    img = Image.new("RGB", (360, 740), BG)
    draw = ImageDraw.Draw(img)
    draw_header_and_nav(draw, active_tab=active_tab)
    render_content(draw)
    draw_bottom_tabs(draw, active_view="drive")
    img.save(os.path.join(OUT_DIR, name))
    print(f"Generated {name}")

# Screen 1: Sign in
def render_signin(draw):
    draw.rounded_rectangle([20, 130, 340, 660], radius=12, fill=BG, outline=LINE)
    draw.ellipse([155, 150, 205, 200], fill=SOFT, outline=LINE)
    draw.text((120, 215), "Driver Sign In", fill=TEXT, font=f_h2)
    draw.text((40, 245), "Enter mobile number to share live GPS.", fill=MUTED, font=f_sub)

    # Phone input
    draw.text((40, 285), "Mobile Phone Number", fill=TEXT, font=f_sub)
    draw.rounded_rectangle([40, 305, 320, 353], radius=8, fill=BG, outline=LINE)
    draw.rectangle([40, 305, 95, 353], fill=SOFT)
    draw.text((50, 320), "+234", fill=MUTED, font=f_body_b)
    draw.text((110, 320), "080 1234 5678", fill=TEXT, font=f_body)

    # Button
    draw.rounded_rectangle([40, 365, 320, 415], radius=8, fill=TEXT)
    draw.text((85, 382), "Send One-Time Code", fill=BG, font=f_btn)

    # Demo quick accounts
    draw.line([40, 440, 320, 440], fill=LINE, width=1)
    draw.text((40, 455), "Quick test with demo driver:", fill=MUTED, font=f_sub)
    draw.rounded_rectangle([40, 480, 320, 525], radius=8, fill=SOFT, outline=LINE)
    draw.text((55, 495), "Tunde Bakare (LND 482 XA)", fill=TEXT, font=f_body_b)
    draw.rounded_rectangle([40, 535, 320, 580], radius=8, fill=SOFT, outline=LINE)
    draw.text((55, 550), "Chinedu Okafor (KJA 117 EP)", fill=TEXT, font=f_body_b)

# Screen 2: Shift / Home
def render_shift(draw):
    # Online banner
    draw.rounded_rectangle([16, 126, 344, 160], radius=8, fill=SOFT, outline=LINE)
    draw.ellipse([26, 139, 34, 147], fill=OK)
    draw.text((42, 137), "Online · Fleet GPS Synced", fill=TEXT, font=f_sub)

    # Vehicle card
    draw.rounded_rectangle([16, 168, 344, 238], radius=10, fill=BG, outline=LINE)
    draw.text((28, 178), "Your vehicle", fill=MUTED, font=f_sub)
    draw.text((28, 194), "LND 482 XA", fill=TEXT, font=f_h2)
    draw.text((28, 214), "Ikeja → Oshodi → Mile 2", fill=MUTED, font=f_sub)
    draw.rounded_rectangle([290, 182, 330, 222], radius=8, fill=WARN)
    draw.text((304, 192), "A", fill=BG, font=f_big)

    # Shift timer & GPS status
    draw.rounded_rectangle([16, 246, 174, 306], radius=10, fill=BG, outline=LINE)
    draw.text((24, 254), "Shift Duration", fill=MUTED, font=f_sub)
    draw.text((24, 274), "02:45:18", fill=TEXT, font=f_mono)

    draw.rounded_rectangle([186, 246, 344, 306], radius=10, fill=BG, outline=LINE)
    draw.text((194, 254), "GPS Status", fill=MUTED, font=f_sub)
    draw.ellipse([196, 282, 204, 290], fill=OK)
    draw.text((210, 278), "GPS Live (8m)", fill=OK, font=f_sub)

    # Big Shift Button
    draw.rounded_rectangle([16, 314, 344, 368], radius=10, fill=BAD)
    draw.text((135, 332), "End shift", fill=BG, font=f_btn)

    # Stats Quad
    draw.rounded_rectangle([16, 376, 344, 452], radius=10, fill=BG, outline=LINE)
    draw.line([180, 376, 180, 452], fill=LINE, width=1)
    draw.line([16, 414, 344, 414], fill=LINE, width=1)
    draw.text((26, 384), "Trips", fill=MUTED, font=f_sub)
    draw.text((26, 396), "5", fill=TEXT, font=f_h2)
    draw.text((190, 384), "Passengers", fill=MUTED, font=f_sub)
    draw.text((190, 396), "36", fill=TEXT, font=f_h2)
    draw.text((26, 420), "Cash", fill=MUTED, font=f_sub)
    draw.text((26, 432), "₦10,500", fill=TEXT, font=f_h2)
    draw.text((190, 420), "Mobile money", fill=MUTED, font=f_sub)
    draw.text((190, 432), "₦4,000", fill=TEXT, font=f_h2)

    # Seats on board
    draw.rounded_rectangle([16, 460, 344, 514], radius=10, fill=BG, outline=LINE)
    draw.text((28, 472), "Passengers on board", fill=TEXT, font=f_body_b)
    draw.text((28, 492), "9 / 14 seats taken (5 free)", fill=MUTED, font=f_sub)
    draw.ellipse([240, 468, 278, 506], fill=SOFT, outline=LINE)
    draw.text((254, 476), "−", fill=TEXT, font=f_h2)
    draw.text((290, 478), "9", fill=TEXT, font=f_h2)
    draw.ellipse([302, 468, 340, 506], fill=SOFT, outline=LINE)
    draw.text((316, 476), "+", fill=TEXT, font=f_h2)

    # Quick action buttons
    draw.rounded_rectangle([16, 524, 174, 574], radius=10, fill=BG, outline=LINE)
    draw.text((32, 536), "+ Cash fare", fill=TEXT, font=f_btn)
    draw.text((32, 554), "₦500", fill=MUTED, font=f_sub)

    draw.rounded_rectangle([186, 524, 344, 574], radius=10, fill=TEXT)
    draw.text((198, 536), "Request MoMo", fill=BG, font=f_btn)
    draw.text((198, 554), "₦500", fill=(200, 200, 200), font=f_sub)

    # Finish trip
    draw.rounded_rectangle([16, 584, 344, 630], radius=8, fill=SOFT, outline=LINE)
    draw.text((55, 600), "🏁 Finish trip (reached end of route)", fill=TEXT, font=f_body_b)

# Screen 3: Cash Fare
def render_cash(draw):
    draw.text((16, 126), "Record Cash Fare", fill=TEXT, font=f_h2)
    draw.text((16, 146), "One tap per passenger. Tap Undo if recorded by mistake.", fill=MUTED, font=f_sub)

    # Giant one-tap standard button
    draw.rounded_rectangle([16, 168, 344, 236], radius=10, fill=TEXT)
    draw.text((32, 185), "💵", fill=BG, font=f_big)
    draw.text((80, 185), "+1 Cash Fare", fill=BG, font=f_btn)
    draw.text((80, 207), "₦500", fill=(220, 220, 220), font=f_big)

    # Multi-pax
    draw.rounded_rectangle([16, 246, 174, 296], radius=10, fill=SOFT, outline=LINE)
    draw.text((32, 262), "+2 Pax (₦1,000)", fill=TEXT, font=f_btn)
    draw.rounded_rectangle([186, 246, 344, 296], radius=10, fill=SOFT, outline=LINE)
    draw.text((202, 262), "+3 Pax (₦1,500)", fill=TEXT, font=f_btn)

    # Presets grid (3x2)
    draw.text((16, 308), "Common Presets", fill=TEXT, font=f_sub)
    presets = ["₦200", "₦300", "₦400", "₦500", "₦700", "₦1,000"]
    for i, p in enumerate(presets):
        row = i // 3
        col = i % 3
        x = 16 + col * 112
        y = 326 + row * 52
        draw.rounded_rectangle([x, y, x + 104, y + 44], radius=8, fill=SOFT, outline=LINE)
        draw.text((x + 28, y + 14), p, fill=TEXT, font=f_body_b)

    # Undo Container
    draw.rounded_rectangle([16, 442, 344, 510], radius=10, fill=(254, 242, 242), outline=BAD)
    draw.text((105, 456), "↩️ Undo Last Fare", fill=BAD, font=f_btn)
    draw.text((70, 484), "Last: ₦500 (1 pax) at 09:32 AM", fill=MUTED, font=f_sub)

    # Recent Audit
    draw.text((16, 525), "Recent Cash Fares", fill=TEXT, font=f_sub)
    draw.rounded_rectangle([16, 545, 344, 585], radius=8, fill=BG, outline=LINE)
    draw.text((28, 557), "₦500 Cash · 1 passenger", fill=TEXT, font=f_body_b)
    draw.text((280, 557), "09:32 AM", fill=MUTED, font=f_sub)
    draw.rounded_rectangle([16, 593, 344, 633], radius=8, fill=BG, outline=LINE)
    draw.text((28, 605), "₦1,000 Cash · 2 passengers", fill=TEXT, font=f_body_b)
    draw.text((280, 605), "09:15 AM", fill=MUTED, font=f_sub)

# Screen 4: MoMo
def render_momo(draw):
    draw.text((16, 126), "Request Mobile Money", fill=TEXT, font=f_h2)
    draw.text((16, 146), "Show pay code or QR code to passenger to pay digitally.", fill=MUTED, font=f_sub)

    # Amount bar
    draw.text((16, 172), "Fare Amount:", fill=MUTED, font=f_sub)
    amts = ["₦500", "₦400", "₦700", "₦1,000"]
    for i, a in enumerate(amts):
        x = 16 + i * 84
        bg_c = TEXT if i == 0 else SOFT
        fg_c = BG if i == 0 else TEXT
        draw.rounded_rectangle([x, 192, x + 76, 232], radius=8, fill=bg_c, outline=LINE)
        draw.text((x + 18, 204), a, fill=fg_c, font=f_body_b)

    # Pay code card
    draw.rounded_rectangle([16, 244, 344, 490], radius=12, fill=BG, outline=LINE)
    draw.text((65, 258), "Tell Passenger to Enter Code:", fill=MUTED, font=f_sub)
    draw.rounded_rectangle([55, 278, 305, 334], radius=8, fill=SOFT, outline=LINE)
    draw.text((95, 292), "482 109", fill=TEXT, font=f_mono)

    # Mock QR
    draw.rounded_rectangle([120, 346, 240, 466], radius=8, fill=(255, 255, 255), outline=LINE)
    draw.rectangle([132, 358, 156, 382], fill=TEXT)
    draw.rectangle([204, 358, 228, 382], fill=TEXT)
    draw.rectangle([132, 430, 156, 454], fill=TEXT)
    draw.rectangle([170, 396, 190, 416], fill=TEXT)
    draw.text((110, 472), "Or passenger can scan to pay", fill=MUTED, font=f_sub)

    # Status pill
    draw.rounded_rectangle([16, 502, 344, 552], radius=10, fill=(236, 253, 245), outline=OK)
    draw.text((70, 520), "✓ ₦500 Received · Verified", fill=OK, font=f_btn)

    # Actions
    draw.rounded_rectangle([16, 564, 174, 614], radius=10, fill=TEXT)
    draw.text((30, 580), "Confirm Payment", fill=BG, font=f_body_b)
    draw.rounded_rectangle([186, 564, 344, 614], radius=10, fill=SOFT, outline=LINE)
    draw.text((205, 580), "Generate New Code", fill=TEXT, font=f_body_b)

# Screen 5: Today
def render_today(draw):
    draw.text((16, 126), "Today's Summary", fill=TEXT, font=f_h2)
    draw.text((16, 146), "Total shift earnings, trips completed, and fare types.", fill=MUTED, font=f_sub)

    # Big takings banner
    draw.rounded_rectangle([16, 170, 344, 240], radius=10, fill=SOFT, outline=LINE)
    draw.text((115, 182), "Total Takings Today", fill=MUTED, font=f_sub)
    draw.text((105, 202), "₦14,500", fill=TEXT, font=f_mono)

    # Stats Quad
    draw.rounded_rectangle([16, 250, 344, 370], radius=10, fill=BG, outline=LINE)
    draw.line([180, 250, 180, 370], fill=LINE, width=1)
    draw.line([16, 290, 344, 290], fill=LINE, width=1)
    draw.line([16, 330, 344, 330], fill=LINE, width=1)
    draw.text((26, 258), "Cash Fares", fill=MUTED, font=f_sub)
    draw.text((26, 270), "₦10,500", fill=TEXT, font=f_body_b)
    draw.text((190, 258), "Mobile Money", fill=MUTED, font=f_sub)
    draw.text((190, 270), "₦4,000", fill=TEXT, font=f_body_b)
    draw.text((26, 298), "Trips Done", fill=MUTED, font=f_sub)
    draw.text((26, 310), "5", fill=TEXT, font=f_body_b)
    draw.text((190, 298), "Passengers", fill=MUTED, font=f_sub)
    draw.text((190, 310), "36", fill=TEXT, font=f_body_b)
    draw.text((26, 338), "Shift Hours", fill=MUTED, font=f_sub)
    draw.text((26, 350), "4.2h", fill=TEXT, font=f_body_b)
    draw.text((190, 338), "Digital Share", fill=MUTED, font=f_sub)
    draw.text((190, 350), "28%", fill=TEXT, font=f_body_b)

    # Split bar
    draw.rounded_rectangle([16, 380, 344, 430], radius=10, fill=BG, outline=LINE)
    draw.text((28, 390), "Payment Split", fill=MUTED, font=f_sub)
    draw.text((220, 390), "Cash 72% · MoMo 28%", fill=MUTED, font=f_sub)
    draw.rounded_rectangle([28, 408, 332, 420], radius=6, fill=LINE)
    draw.rounded_rectangle([28, 408, 246, 420], radius=6, fill=TEXT)
    draw.rounded_rectangle([246, 408, 332, 420], radius=6, fill=OK)

    # Trips history
    draw.text((16, 445), "Completed Trips Today", fill=TEXT, font=f_sub)
    draw.rounded_rectangle([16, 465, 344, 515], radius=8, fill=BG, outline=LINE)
    draw.text((28, 475), "Trip #5: Ikeja Along → Mile 2", fill=TEXT, font=f_body_b)
    draw.text((28, 495), "8 passengers onboard", fill=MUTED, font=f_sub)
    draw.text((280, 480), "₦4,000", fill=TEXT, font=f_body_b)

    draw.rounded_rectangle([16, 525, 344, 575], radius=8, fill=BG, outline=LINE)
    draw.text((28, 535), "Trip #4: Mile 2 → Ikeja Along", fill=TEXT, font=f_body_b)
    draw.text((28, 555), "7 passengers onboard", fill=MUTED, font=f_sub)
    draw.text((280, 540), "₦3,500", fill=TEXT, font=f_body_b)

# Screen 6: Settings
def render_settings(draw):
    draw.text((16, 126), "Settings & Help", fill=TEXT, font=f_h2)
    draw.text((16, 146), "Vehicle assignment, language, and emergency support.", fill=MUTED, font=f_sub)

    # Assigned vehicle
    draw.rounded_rectangle([16, 170, 344, 240], radius=10, fill=BG, outline=LINE)
    draw.text((28, 180), "Assigned Minibus", fill=TEXT, font=f_body_b)
    draw.rounded_rectangle([28, 200, 332, 232], radius=6, fill=SOFT, outline=LINE)
    draw.text((38, 210), "LND 482 XA (Tunde Bakare · Route A)", fill=TEXT, font=f_sub)

    # Language
    draw.rounded_rectangle([16, 250, 344, 320], radius=10, fill=BG, outline=LINE)
    draw.text((28, 260), "Language / Èdè / Harshe / Asụsụ", fill=TEXT, font=f_body_b)
    draw.rounded_rectangle([28, 280, 332, 312], radius=6, fill=SOFT, outline=LINE)
    draw.text((38, 290), "English (Default)", fill=TEXT, font=f_sub)

    # Emergency buttons
    draw.rounded_rectangle([16, 330, 344, 420], radius=10, fill=BG, outline=LINE)
    draw.text((28, 340), "Emergency & Support", fill=TEXT, font=f_body_b)
    draw.rounded_rectangle([28, 362, 170, 408], radius=8, fill=(254, 242, 242), outline=BAD)
    draw.text((36, 378), "🚨 Call Dispatch", fill=BAD, font=f_sub)
    draw.rounded_rectangle([180, 362, 332, 408], radius=8, fill=(236, 253, 245), outline=OK)
    draw.text((192, 378), "💬 WhatsApp Owner", fill=OK, font=f_sub)

    # Simulation controls
    draw.rounded_rectangle([16, 430, 344, 530], radius=10, fill=BG, outline=LINE)
    draw.text((28, 440), "Simulation Controls", fill=TEXT, font=f_body_b)
    draw.text((28, 464), "Offline Network Simulation", fill=MUTED, font=f_sub)
    draw.rounded_rectangle([230, 458, 332, 484], radius=6, fill=SOFT, outline=LINE)
    draw.text((248, 466), "Offline: OFF", fill=TEXT, font=f_sub)
    draw.text((28, 498), "Weak GPS Signal Simulation", fill=MUTED, font=f_sub)
    draw.rounded_rectangle([230, 492, 332, 518], radius=6, fill=SOFT, outline=LINE)
    draw.text((240, 500), "Weak GPS: OFF", fill=TEXT, font=f_sub)

    # Sign out
    draw.rounded_rectangle([16, 545, 344, 595], radius=10, fill=SOFT, outline=LINE)
    draw.text((95, 563), "🚪 Sign Out / Switch Driver", fill=BAD, font=f_btn)

if __name__ == "__main__":
    make_screenshot("01_signin_screen.png", render_signin, active_tab="shift")
    make_screenshot("02_shift_screen.png", render_shift, active_tab="shift")
    make_screenshot("03_cash_screen.png", render_cash, active_tab="cash")
    make_screenshot("04_momo_screen.png", render_momo, active_tab="momo")
    make_screenshot("05_today_screen.png", render_today, active_tab="today")
    make_screenshot("06_settings_screen.png", render_settings, active_tab="settings")
    print("All screenshots generated successfully.")
