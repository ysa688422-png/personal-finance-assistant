from pathlib import Path
from math import cos, exp, pi, sin

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SIZE = (300, 360)
FRAME_COUNT = 16
STATES = ("idle", "waving", "jumping", "review", "running")

SOURCES = {
    "桃绘": ROOT / "品牌资产" / "角色立绘" / "桃绘.png",
    "星澄": ROOT / "品牌资产" / "角色立绘" / "星澄.png",
    "樱露": ROOT / "品牌资产" / "角色立绘" / "樱露.png",
}


def ensure_yinglu_source():
    path = SOURCES["樱露"]
    if path.exists():
        return
    source = Image.open(ROOT / "品牌资产" / "角色动图" / "樱露" / "idle.gif")
    source.seek(0)
    path.parent.mkdir(parents=True, exist_ok=True)
    source.convert("RGBA").save(path)


def fitted_layer(source_path):
    source = Image.open(source_path).convert("RGBA")
    scale = min((SIZE[0] - 12) / source.width, (SIZE[1] - 12) / source.height)
    target = (max(1, round(source.width * scale)), max(1, round(source.height * scale)))
    return source.resize(target, Image.Resampling.LANCZOS)


def mesh_warp(image, mapper, cells=18):
    width, height = image.size
    mesh = []
    for row in range(cells):
        y0 = round(row * height / cells)
        y1 = round((row + 1) * height / cells)
        for column in range(cells):
            x0 = round(column * width / cells)
            x1 = round((column + 1) * width / cells)
            corners = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
            source_quad = []
            for x, y in corners:
                sx, sy = mapper(x / width, y / height)
                source_quad.extend((sx * width, sy * height))
            mesh.append(((x0, y0, x1, y1), tuple(source_quad)))
    return image.transform(
        image.size,
        Image.Transform.MESH,
        mesh,
        resample=Image.Resampling.BICUBIC,
    )


def taohui_frame(layer, phase, state):
    wave = sin(phase * 2 * pi)
    breath = (1 - cos(phase * 2 * pi)) / 2
    energy = {"idle": 0.55, "waving": 0.75, "jumping": 0.9, "review": 0.65, "running": 1.0}[state]

    def mapper(x, y):
        # Localized torso expansion: the upper body breathes while the waist stays anchored.
        chest = exp(-(((x - 0.50) / 0.19) ** 2 + ((y - 0.275) / 0.105) ** 2))
        chest_scale_x = 0.105 * breath * energy
        chest_scale_y = 0.078 * breath * energy
        sx = x - (x - 0.50) * chest_scale_x * chest
        sy = y - (y - 0.275) * chest_scale_y * chest

        # Hair tips and the receipt react a little later than the torso.
        hair = exp(-(((x - 0.50) / 0.36) ** 2 + ((y - 0.135) / 0.17) ** 2))
        receipt = exp(-(((x - 0.73) / 0.18) ** 2 + ((y - 0.30) / 0.25) ** 2))
        sx -= sin(phase * 2 * pi + y * 7) * (0.014 * hair + 0.018 * receipt) * energy

        # Hip counter-motion gives the pose weight instead of moving the whole picture.
        hips = 1 / (1 + exp(-(y - 0.43) * 22))
        if state in {"waving", "running"}:
            sx -= wave * 0.008 * hips * energy
        return sx, sy

    frame = mesh_warp(layer, mapper)
    y = -round(abs(sin(phase * pi)) * 10) if state == "jumping" else 0
    angle = wave * (1.2 if state in {"waving", "running"} else 0.35)
    if angle:
        frame = frame.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    return frame, 0, y


def xingcheng_frame(layer, phase, state):
    wave = sin(phase * 2 * pi)
    energy = {"idle": 0.45, "waving": 0.7, "jumping": 0.85, "review": 0.55, "running": 1.0}[state]

    def mapper(x, y):
        # Silver hair moves in two delayed waves around the shoulders and hips.
        side_hair = (exp(-((x - 0.23) / 0.20) ** 2) + exp(-((x - 0.77) / 0.20) ** 2))
        hair_length = exp(-((y - 0.34) / 0.34) ** 2)
        hair_shift = sin(phase * 2 * pi + y * 10) * 0.038 * side_hair * hair_length * energy

        # Long legs change load subtly from one side to the other.
        lower_body = 1 / (1 + exp(-(y - 0.53) * 24))
        leg_shift = wave * 0.018 * lower_body * energy
        skirt = exp(-(((x - 0.52) / 0.30) ** 2 + ((y - 0.49) / 0.10) ** 2))
        skirt_shift = sin(phase * 2 * pi + 0.8) * 0.024 * skirt * energy
        return x - hair_shift - leg_shift - skirt_shift, y

    frame = mesh_warp(layer, mapper)
    y = -round(abs(sin(phase * pi)) * 11) if state == "jumping" else 0
    angle = wave * (0.9 if state in {"waving", "running"} else 0.25)
    if angle:
        frame = frame.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    return frame, 0, y


def star_points(cx, cy, outer, inner, rotation):
    points = []
    for index in range(10):
        radius = outer if index % 2 == 0 else inner
        angle = rotation + index * pi / 5
        points.append((cx + cos(angle) * radius, cy + sin(angle) * radius))
    return points


def add_yinglu_magic(canvas, phase, state):
    overlay = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    pulse = 0.75 + 0.25 * sin(phase * 2 * pi)
    cx, cy = 224, 152
    radius = 24 + round(3 * pulse)
    alpha = round(155 + 80 * pulse)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(122, 229, 255, alpha), width=3)
    draw.arc((cx - radius + 7, cy - radius + 7, cx + radius - 7, cy + radius - 7),
             start=phase * 360, end=phase * 360 + 230, fill=(255, 224, 93, 240), width=3)
    draw.polygon(star_points(cx, cy, 10, 4, phase * 2 * pi), fill=(255, 241, 154, 245))

    # A second thought spark above the pointed finger sells the clever, spell-casting pose.
    sx, sy = 198, 72
    draw.polygon(star_points(sx, sy, 8 + pulse * 3, 3, -phase * 2 * pi), fill=(255, 255, 225, 245))
    if state == "review":
        for index in range(3):
            x = 92 + index * 18
            height = 16 + index * 9
            draw.rounded_rectangle((x, 255 - height, x + 10, 255), 3, fill=(114, 222, 255, 220))

    glow = overlay.filter(ImageFilter.GaussianBlur(7))
    canvas.alpha_composite(glow)
    canvas.alpha_composite(overlay)


def yinglu_frame(layer, phase, state):
    wave = sin(phase * 2 * pi)

    def mapper(x, y):
        # The right arm/finger points outward while the ears and cape lag behind.
        hand = exp(-(((x - 0.73) / 0.22) ** 2 + ((y - 0.47) / 0.19) ** 2))
        ear_cape = exp(-(((x - 0.50) / 0.48) ** 2 + ((y - 0.36) / 0.30) ** 2))
        sx = x - wave * 0.035 * hand
        sy = y + cos(phase * 2 * pi) * 0.022 * hand
        sx -= sin(phase * 2 * pi + y * 8) * 0.006 * ear_cape
        return sx, sy

    frame = mesh_warp(layer, mapper, cells=14)
    y = -round(abs(sin(phase * pi)) * 13) if state == "jumping" else round(wave * 2)
    return frame, 0, y


def make_canvas(layer, transformed, offset_x, offset_y, character, phase, state):
    corner = layer.getpixel((0, 0))
    canvas = Image.new("RGBA", SIZE, corner)
    left = (SIZE[0] - transformed.width) // 2 + offset_x
    top = (SIZE[1] - transformed.height) // 2 + offset_y
    canvas.alpha_composite(transformed, (left, top))
    if character == "樱露":
        add_yinglu_magic(canvas, phase, state)
    if state == "review":
        canvas = ImageEnhance.Brightness(canvas).enhance(1.02 + 0.02 * sin(phase * 2 * pi))
    return canvas


def build_character(character, source_path):
    layer = fitted_layer(source_path)
    output_dir = ROOT / "品牌资产" / "角色动图" / character
    output_dir.mkdir(parents=True, exist_ok=True)
    frame_builder = {
        "桃绘": taohui_frame,
        "星澄": xingcheng_frame,
        "樱露": yinglu_frame,
    }[character]

    for state in STATES:
        rgba_frames = []
        for index in range(FRAME_COUNT):
            phase = index / FRAME_COUNT
            transformed, x, y = frame_builder(layer, phase, state)
            rgba_frames.append(make_canvas(layer, transformed, x, y, character, phase, state))

        frames = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=255) for frame in rgba_frames]
        frames[0].save(
            output_dir / f"{state}.gif",
            save_all=True,
            append_images=frames[1:],
            duration=78,
            loop=0,
            disposal=2,
            optimize=True,
        )


ensure_yinglu_source()
for name, path in SOURCES.items():
    build_character(name, path)
