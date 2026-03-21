"""
lemon_video.py

Generates a Lemon AI Dating video: a 3×2 grid of agent pairs on their dates.
Each cell animates from dark → reveal with the two robot avatars + date scene.
The final video loops through all date templates with smooth transitions.

Output: lemon_dates_video.mp4 (1920×1080, 30fps, ~15 seconds)
"""

import os
import math
import subprocess
import shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ─── Config ───────────────────────────────────────────────────────────────────

W, H       = 1920, 1080      # video frame size
FPS        = 30
COLS, ROWS = 3, 2
DURATION   = 15              # seconds total
FRAMES     = FPS * DURATION

OUT_DIR    = "/tmp/lemon_frames"
OUT_VIDEO  = "/Users/MAC/Desktop/lemon/lemon_dates_video.mp4"

# ─── Lemon colour palette ─────────────────────────────────────────────────────

BG_DARK    = (8,   10,  18)        # near-black deep navy
BG_CARD    = (14,  17,  32)        # card background
GOLD_LIGHT = (255, 220, 80)        # lemon yellow
GOLD_MID   = (230, 170, 40)        # warm gold
GOLD_DARK  = (160, 100, 20)        # deep amber
WHITE      = (255, 255, 255)
GREY       = (140, 140, 160)
TEAL       = (80,  200, 180)       # accent

# ─── Date templates ───────────────────────────────────────────────────────────

DATE_TEMPLATES = [
    {
        "name": "Coffee Date",
        "emoji": "☕",
        "tag": "COFFEE",
        "scene_color": (60,  35,  18),    # warm brown
        "accent":      (210, 130, 50),
        "icon_color":  (230, 170, 80),
        "agents": ("Zara", "Leo"),
        "detail": "Cozy café · First impressions",
    },
    {
        "name": "Beach Date",
        "emoji": "🏖",
        "tag": "BEACH",
        "scene_color": (15,  45,  90),
        "accent":      (80,  180, 230),
        "icon_color":  (100, 200, 255),
        "agents": ("Nova", "Kai"),
        "detail": "Golden hour · Barefoot vibes",
    },
    {
        "name": "Work Date",
        "emoji": "💻",
        "tag": "WORK",
        "scene_color": (20,  30,  55),
        "accent":      (100, 130, 210),
        "icon_color":  (140, 160, 255),
        "agents": ("Sage", "River"),
        "detail": "Co-working · Building together",
    },
    {
        "name": "Rooftop Dinner",
        "emoji": "🌆",
        "tag": "ROOFTOP",
        "scene_color": (50,  15,  40),
        "accent":      (200, 80,  140),
        "icon_color":  (255, 120, 180),
        "agents": ("Luna", "Orion"),
        "detail": "Sunset skyline · Candlelight",
    },
    {
        "name": "Gallery Walk",
        "emoji": "🎨",
        "tag": "GALLERY",
        "scene_color": (30,  25,  45),
        "accent":      (160, 100, 220),
        "icon_color":  (200, 150, 255),
        "agents": ("Mia", "Eli"),
        "detail": "Art & conversation · Soulful",
    },
    {
        "name": "Lemon Dates",
        "emoji": "🍋",
        "tag": "POWERED BY AI",
        "scene_color": (18,  22,  40),
        "accent":      (255, 220, 80),
        "icon_color":  (255, 240, 120),
        "agents": ("AI Agent A", "AI Agent B"),
        "detail": "Autonomous dating on Celo",
    },
]

# ─── Font helpers ─────────────────────────────────────────────────────────────

def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Geneva.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()

# ─── Drawing primitives ───────────────────────────────────────────────────────

def draw_rounded_rect(draw: ImageDraw.Draw, xy, radius: int, fill, outline=None, outline_width=1):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill,
                           outline=outline, width=outline_width)

def lerp(a, b, t):
    return a + (b - a) * t

def lerp_color(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))

def ease_out_cubic(t):
    return 1 - (1 - t) ** 3

def ease_in_out(t):
    return t * t * (3 - 2 * t)

# ─── Robot avatar drawing ─────────────────────────────────────────────────────

def draw_robot(draw: ImageDraw.Draw, cx: int, cy: int, size: int,
               color: tuple, facing_right: bool = True, label: str = ""):
    """Draw a cute minimal robot avatar."""
    s = size / 60           # scale factor (design at 60px baseline)
    flip = 1 if facing_right else -1

    head_w = int(28 * s)
    head_h = int(24 * s)
    head_x = cx - head_w // 2
    head_y = cy - int(40 * s)

    # Shadow
    shadow_color = (0, 0, 0, 80)
    draw.ellipse([cx - int(18*s), cy + int(20*s),
                  cx + int(18*s), cy + int(24*s)], fill=(0,0,0,60))

    # Body
    body_w = int(24 * s)
    body_h = int(28 * s)
    body_x = cx - body_w // 2
    body_y = cy - int(14 * s)
    draw.rounded_rectangle([body_x, body_y, body_x+body_w, body_y+body_h],
                            radius=int(6*s), fill=color)

    # Chest light
    light_r = int(4 * s)
    draw.ellipse([cx - light_r, body_y + int(8*s) - light_r,
                  cx + light_r, body_y + int(8*s) + light_r],
                 fill=GOLD_LIGHT)

    # Arms
    arm_w = int(6 * s)
    arm_h = int(18 * s)
    draw.rounded_rectangle([body_x - arm_w - int(2*s), body_y + int(2*s),
                             body_x - int(2*s),         body_y + arm_h],
                            radius=int(3*s), fill=color)
    draw.rounded_rectangle([body_x + body_w + int(2*s), body_y + int(2*s),
                             body_x + body_w + arm_w + int(2*s), body_y + arm_h],
                            radius=int(3*s), fill=color)

    # Legs
    leg_w = int(8 * s)
    leg_h = int(14 * s)
    gap   = int(3 * s)
    draw.rounded_rectangle([cx - leg_w - gap, body_y + body_h,
                             cx - gap,         body_y + body_h + leg_h],
                            radius=int(3*s), fill=color)
    draw.rounded_rectangle([cx + gap,         body_y + body_h,
                             cx + leg_w + gap, body_y + body_h + leg_h],
                            radius=int(3*s), fill=color)

    # Head
    draw.rounded_rectangle([head_x, head_y, head_x+head_w, head_y+head_h],
                            radius=int(6*s), fill=color)

    # Antenna
    ant_x = cx + int(flip * 4 * s)
    draw.line([ant_x, head_y, ant_x, head_y - int(10*s)],
              fill=GOLD_LIGHT, width=max(1, int(2*s)))
    draw.ellipse([ant_x - int(3*s), head_y - int(13*s),
                  ant_x + int(3*s), head_y - int(7*s)],
                 fill=GOLD_LIGHT)

    # Eyes
    eye_y = head_y + int(8*s)
    eye_r = int(4*s)
    eye_gap = int(6*s)
    # left eye
    draw.ellipse([cx - eye_gap - eye_r, eye_y - eye_r,
                  cx - eye_gap + eye_r, eye_y + eye_r], fill=WHITE)
    draw.ellipse([cx - eye_gap - int(1.5*s), eye_y - int(1.5*s),
                  cx - eye_gap + int(1.5*s), eye_y + int(1.5*s)],
                 fill=BG_DARK)
    # right eye
    draw.ellipse([cx + eye_gap - eye_r, eye_y - eye_r,
                  cx + eye_gap + eye_r, eye_y + eye_r], fill=WHITE)
    draw.ellipse([cx + eye_gap - int(1.5*s), eye_y - int(1.5*s),
                  cx + eye_gap + int(1.5*s), eye_y + int(1.5*s)],
                 fill=BG_DARK)

    # Smile
    smile_y = head_y + int(16*s)
    draw.arc([cx - int(6*s), smile_y - int(3*s),
              cx + int(6*s), smile_y + int(3*s)],
             start=0, end=180, fill=WHITE, width=max(1, int(2*s)))

    # Name tag
    if label:
        font = get_font(max(10, int(11*s)))
        bbox = font.getbbox(label)
        tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
        tag_pad = int(4*s)
        tag_x = cx - tw//2 - tag_pad
        tag_y = body_y + body_h + leg_h + int(4*s)
        draw.rounded_rectangle([tag_x, tag_y, tag_x+tw+tag_pad*2, tag_y+th+tag_pad],
                                radius=int(3*s), fill=GOLD_DARK)
        draw.text((cx - tw//2, tag_y + tag_pad//2), label,
                  font=font, fill=GOLD_LIGHT)

# ─── Date scene background for one card ──────────────────────────────────────

def draw_scene_bg(img: Image.Image, x0: int, y0: int, w: int, h: int,
                  template: dict, t: float):
    """Draws scene-specific background elements for a card."""
    draw = ImageDraw.Draw(img)
    sc   = template["scene_color"]
    acc  = template["accent"]
    tag  = template["tag"]

    # Gradient fill (top lighter → bottom darker)
    for row in range(h):
        frac  = row / h
        color = lerp_color(
            tuple(min(255, c + 30) for c in sc),
            tuple(max(0,   c - 20) for c in sc),
            frac
        )
        draw.line([(x0, y0+row), (x0+w, y0+row)], fill=color)

    # Ambient orb top-right
    orb_cx = x0 + int(w * 0.8)
    orb_cy = y0 + int(h * 0.2)
    orb_r  = int(w * 0.35)
    for r in range(orb_r, 0, -2):
        alpha = int(18 * (1 - r/orb_r) * min(1, t*2))
        color = acc + (max(0, min(255, alpha)),)
        # Draw using a temp RGBA layer
        overlay = Image.new("RGBA", img.size, (0,0,0,0))
        od = ImageDraw.Draw(overlay)
        od.ellipse([orb_cx-r, orb_cy-r, orb_cx+r, orb_cy+r], fill=color)
        img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"),
                  (0,0))

    # Template-specific scene decoration
    draw = ImageDraw.Draw(img)
    if tag == "COFFEE":
        # Steam lines
        for i, sx in enumerate([x0+w//2-20, x0+w//2, x0+w//2+20]):
            phase = (t * 2 + i * 0.4) % 1
            sy0   = y0 + h - int(h*0.35) - int(phase * h * 0.15)
            sy1   = sy0 - int(h * 0.12)
            alpha = int(120 * (1 - abs(phase - 0.5)*2))
            draw.line([(sx, sy0), (sx + 6, sy1)],
                      fill=tuple(list(acc) + [alpha])[:3], width=2)

    elif tag == "BEACH":
        # Waves at bottom
        wave_y = y0 + h - int(h * 0.25)
        for i in range(4):
            phase = (t * 0.5 + i * 0.15) % 1
            for px in range(x0, x0+w, 3):
                wy = wave_y + int(8 * math.sin((px-x0)/w * math.pi*4 + phase*math.pi*2)) + i*10
                draw.point((px, wy), fill=acc)

    elif tag == "WORK":
        # Grid lines (screen-like)
        for gx in range(x0+20, x0+w, 40):
            draw.line([(gx, y0+h//3), (gx, y0+h-20)],
                      fill=tuple(list(acc)+[30])[:3], width=1)
        for gy in range(y0+h//3, y0+h, 30):
            draw.line([(x0+20, gy), (x0+w-20, gy)],
                      fill=tuple(list(acc)+[30])[:3], width=1)

    elif tag == "ROOFTOP":
        # City skyline silhouette
        buildings = [
            (0.05, 0.45, 0.12, 0.85), (0.15, 0.30, 0.22, 0.85),
            (0.25, 0.50, 0.30, 0.85), (0.35, 0.25, 0.45, 0.85),
            (0.48, 0.40, 0.55, 0.85), (0.58, 0.35, 0.67, 0.85),
            (0.70, 0.20, 0.78, 0.85), (0.82, 0.45, 0.90, 0.85),
            (0.92, 0.38, 0.99, 0.85),
        ]
        bldg_color = tuple(max(0, c-20) for c in sc)
        for bx0, by0, bx1, by1 in buildings:
            draw.rectangle([x0+int(bx0*w), y0+int(by0*h),
                            x0+int(bx1*w), y0+int(by1*h)], fill=bldg_color)
        # Windows
        for bx0, by0, bx1, by1 in buildings:
            for wx in range(x0+int(bx0*w)+4, x0+int(bx1*w)-2, 8):
                for wy in range(y0+int(by0*h)+6, y0+int(by1*h)-4, 10):
                    lit = (int(wx+wy) % 3 != 0)
                    wc  = acc if lit else (40, 40, 60)
                    draw.rectangle([wx, wy, wx+4, wy+5], fill=wc)

    elif tag == "GALLERY":
        # Art frames on wall
        frames = [
            (0.05, 0.15, 0.22, 0.45), (0.28, 0.10, 0.48, 0.48),
            (0.54, 0.18, 0.68, 0.42), (0.74, 0.12, 0.95, 0.50),
        ]
        colors = [acc, GOLD_MID, TEAL, acc]
        for (fx0, fy0, fx1, fy1), fc in zip(frames, colors):
            fx, fy = x0+int(fx0*w), y0+int(fy0*h)
            fw, fh = int((fx1-fx0)*w), int((fy1-fy0)*h)
            draw.rectangle([fx, fy, fx+fw, fy+fh], fill=(30,25,40), outline=fc, width=3)
            # Abstract art inside
            draw.ellipse([fx+6, fy+6, fx+fw-6, fy+fh-6],
                         fill=tuple(max(0,c-30) for c in fc))

    elif tag == "POWERED BY AI":
        # Lemon shapes
        lemon_positions = [
            (x0+int(w*0.15), y0+int(h*0.2), 30),
            (x0+int(w*0.82), y0+int(h*0.15), 22),
            (x0+int(w*0.08), y0+int(h*0.7),  18),
            (x0+int(w*0.90), y0+int(h*0.75), 25),
        ]
        for lx, ly, lr in lemon_positions:
            alpha = int(80 * min(1, t*3))
            draw.ellipse([lx-lr, ly-int(lr*0.65), lx+lr, ly+int(lr*0.65)],
                         fill=GOLD_MID, outline=GOLD_LIGHT, width=2)
            draw.point((lx - lr + 3, ly), fill=GOLD_DARK)
            draw.point((lx + lr - 3, ly), fill=GOLD_DARK)


# ─── Draw one date card ───────────────────────────────────────────────────────

def draw_card(img: Image.Image, x0: int, y0: int, w: int, h: int,
              template: dict, t: float, global_t: float):
    """
    Draws a single date card into img.
    t        : per-card reveal progress 0→1
    global_t : overall video time 0→1 (for continuous animations)
    """
    draw = ImageDraw.Draw(img)

    # Clip region for the card
    t_ease = ease_out_cubic(min(1.0, t))

    # Card base
    pad   = 6
    draw_rounded_rect(draw, [x0+pad, y0+pad, x0+w-pad, y0+h-pad],
                      radius=18, fill=template["scene_color"],
                      outline=template["accent"], outline_width=2)

    # Scene background
    draw_scene_bg(img, x0+pad, y0+pad, w-pad*2, h-pad*2, template, global_t)

    draw = ImageDraw.Draw(img)   # re-acquire after paste ops

    # Header bar
    header_h = int(h * 0.14)
    draw.rectangle([x0+pad, y0+pad, x0+w-pad, y0+pad+header_h],
                   fill=tuple(max(0, c-10) for c in template["scene_color"]))

    # Template name
    name_font  = get_font(int(h * 0.068), bold=True)
    emoji_font = get_font(int(h * 0.072))
    name_text  = template["name"]
    draw.text((x0 + pad + 14, y0 + pad + 10),
              template["emoji"] + "  " + name_text,
              font=name_font, fill=GOLD_LIGHT)

    # "AI Date" badge
    badge_font = get_font(int(h * 0.040))
    badge_text = "AI Date • Celo"
    bb = badge_font.getbbox(badge_text)
    bw, bh = bb[2]-bb[0]+12, bb[3]-bb[1]+6
    bx = x0 + w - pad - bw - 10
    by = y0 + pad + 8
    draw_rounded_rect(draw, [bx, by, bx+bw, by+bh],
                      radius=8, fill=(*template["accent"][:3], 180),
                      outline=GOLD_LIGHT, outline_width=1)
    draw.text((bx+6, by+3), badge_text, font=badge_font, fill=BG_DARK)

    # ── Agents ──────────────────────────────────────────────────────────────
    # Position: two robots side by side, slightly offset
    card_cx  = x0 + w // 2
    card_cy  = y0 + pad + header_h + (h - header_h) // 2 - int(h * 0.04)
    bot_size = int(min(w, h) * 0.55)

    # Agent A (left, facing right)
    ax = card_cx - int(bot_size * 0.36)
    ay = card_cy + int(bot_size * 0.10)
    draw_robot(draw, ax, ay, bot_size, template["icon_color"],
               facing_right=True, label=template["agents"][0])

    # Agent B (right, facing left)
    bx = card_cx + int(bot_size * 0.36)
    by = card_cy + int(bot_size * 0.10)
    robot_b_color = lerp_color(template["icon_color"], template["accent"], 0.45)
    draw_robot(draw, bx, by, bot_size, robot_b_color,
               facing_right=False, label=template["agents"][1])

    # Heart between them (pulsing)
    pulse = 0.85 + 0.15 * math.sin(global_t * math.pi * 4)
    heart_size = int(h * 0.04 * pulse)
    hx, hy = card_cx, card_cy - int(bot_size * 0.32)
    draw.text((hx - heart_size//2, hy - heart_size//2), "♥",
              font=get_font(heart_size*2), fill=GOLD_LIGHT)

    # ── Footer ───────────────────────────────────────────────────────────────
    detail_font = get_font(int(h * 0.042))
    draw.text((x0 + pad + 14, y0 + h - pad - int(h*0.085)),
              template["detail"],
              font=detail_font, fill=(*GREY,))

    # Reveal vignette (cards slide up from darkness on entry)
    if t_ease < 0.99:
        veil_alpha = int(255 * (1 - t_ease))
        veil = Image.new("RGBA", (w - pad*2, h - pad*2), (0, 0, 0, veil_alpha))
        img.paste(veil, (x0+pad, y0+pad), veil)


# ─── Global Lemon header ──────────────────────────────────────────────────────

def draw_header(img: Image.Image, t_global: float):
    draw  = ImageDraw.Draw(img)
    pulse = 0.93 + 0.07 * math.sin(t_global * math.pi * 2)

    # Logo "🍋 LEMON" top-center
    logo_font = get_font(52, bold=True)
    sub_font  = get_font(22)

    logo_text = "🍋  LEMON"
    sub_text  = "AI Dating Agents · Autonomous Dates on Celo"

    lbb  = logo_font.getbbox(logo_text)
    lw   = lbb[2] - lbb[0]
    logo_x = W // 2 - lw // 2
    draw.text((logo_x, 18), logo_text, font=logo_font, fill=GOLD_LIGHT)

    sbb  = sub_font.getbbox(sub_text)
    sw   = sbb[2] - sbb[0]
    draw.text((W//2 - sw//2, 76), sub_text, font=sub_font, fill=GREY)

    # Divider
    for dx in range(W//2 - 350, W//2 + 350):
        alpha = int(100 * math.sin((dx - (W//2-350)) / 700 * math.pi))
        draw.point((dx, 106), fill=(*GOLD_MID, alpha)[:3])


# ─── Assemble one frame ───────────────────────────────────────────────────────

HEADER_H = 112          # px reserved for top header
GRID_Y0  = HEADER_H + 8

def render_frame(frame_idx: int) -> Image.Image:
    global_t = frame_idx / FRAMES           # 0 → 1 over full video
    global_t_loop = (global_t * 1.5) % 1   # faster loop for animations

    img = Image.new("RGB", (W, H), BG_DARK)
    draw_header(img, global_t_loop)

    cell_w = W // COLS
    cell_h = (H - GRID_Y0) // ROWS

    for idx, template in enumerate(DATE_TEMPLATES):
        col = idx % COLS
        row = idx // COLS
        x0  = col * cell_w
        y0  = GRID_Y0 + row * cell_h

        # Staggered reveal: each card enters 0.3s apart
        reveal_start = (idx * 0.08)                # stagger start
        reveal_dur   = 0.30                         # duration of card entry
        raw_t        = (global_t - reveal_start) / reveal_dur
        card_t       = max(0.0, min(1.0, raw_t))

        draw_card(img, x0, y0, cell_w, cell_h, template,
                  t=card_t, global_t=global_t_loop)

    # Global subtle vignette
    vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    for r in range(min(W, H) // 2, 0, -4):
        alpha = int(60 * (1 - r / (min(W, H) // 2)) ** 2)
        vd.ellipse([W//2 - r, H//2 - r, W//2 + r, H//2 + r],
                   fill=(0, 0, 0, 0), outline=(0, 0, 0, alpha), width=4)
    img = Image.alpha_composite(img.convert("RGBA"), vignette).convert("RGB")

    return img


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"🍋  Lemon Date Video Generator")
    print(f"    {W}×{H} · {FPS}fps · {DURATION}s · {FRAMES} frames\n")

    # Clean/create frame dir
    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)

    # Render frames
    for i in range(FRAMES):
        frame = render_frame(i)
        frame.save(f"{OUT_DIR}/frame_{i:05d}.png")
        if i % 30 == 0:
            pct = i / FRAMES * 100
            bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
            print(f"  [{bar}] {pct:5.1f}%  frame {i}/{FRAMES}", end="\r")

    print(f"\n\n  ✓ {FRAMES} frames rendered. Encoding video…\n")

    # Encode with ffmpeg
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", f"{OUT_DIR}/frame_%05d.png",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        OUT_VIDEO,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("  ❌  ffmpeg error:")
        print(result.stderr)
        return

    size_mb = os.path.getsize(OUT_VIDEO) / 1024 / 1024
    print(f"  ✅  Video saved: {OUT_VIDEO}")
    print(f"      Size: {size_mb:.1f} MB\n")

    # Cleanup frames
    shutil.rmtree(OUT_DIR)


if __name__ == "__main__":
    main()
