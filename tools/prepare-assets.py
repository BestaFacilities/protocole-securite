#!/usr/bin/env python3
"""
Prépare les images utilisées par le formulaire web à partir des documents sources.

  - assets/pages/page-1..4.jpg : aperçu des 4 pages du protocole (lecture sur mobile)
  - assets/icons/*.png         : pictogrammes découpés dans le PDF officiel et dans l'affiche

À relancer uniquement si le PDF du protocole ou l'affiche changent :
    pip install pymupdf pillow
    python3 tools/prepare-assets.py
"""
import io
import os

import pymupdf
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, "assets", "protocole-securite.pdf")
AFFICHE = os.path.join(ROOT, "docs", "affiche-gare-issy.png")
OUT_PAGES = os.path.join(ROOT, "assets", "pages")
OUT_ICONS = os.path.join(ROOT, "assets", "icons")

os.makedirs(OUT_PAGES, exist_ok=True)
os.makedirs(OUT_ICONS, exist_ok=True)

doc = pymupdf.open(PDF)

# ---------------------------------------------------------------- pages
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=125)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    img.save(os.path.join(OUT_PAGES, f"page-{i + 1}.jpg"), "JPEG", quality=66, optimize=True, progressive=True)

# ---------------------------------------------------------------- pictogrammes du PDF
SCALE = 4  # 288 dpi
renders = {}


def page_img(n):
    if n not in renders:
        pix = doc[n].get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE))
        renders[n] = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    return renders[n]


def crop_pdf(name, page, x0, y0, x1, y1, size=None, erode=True):
    img = page_img(page).crop((int(x0 * SCALE), int(y0 * SCALE), int(x1 * SCALE), int(y1 * SCALE)))
    img = trim(img, erode=erode)
    if size:
        img.thumbnail((size, size), Image.LANCZOS)
    save_icon(name, img)


def trim(img, pad=6, erode=True):
    """Retire les marges blanches autour du pictogramme (en ignorant les filets fins du tableau)."""
    gray = img.convert("L").point(lambda v: 255 if v < 235 else 0)
    if erode:
        gray = gray.filter(ImageFilter.MinFilter(11)).filter(ImageFilter.MaxFilter(11))
    box = gray.getbbox()
    if not box:
        return img
    x0, y0, x1, y1 = box
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


def save_icon(name, img):
    img = img.convert("RGB")
    q = img.quantize(colors=64, method=Image.Quantize.MEDIANCUT)
    q.save(os.path.join(OUT_ICONS, name + ".png"), optimize=True)


# Pictogrammes de danger (page 1) : à droite de chaque case ☐
ghs = ["explosif", "inflammable", "comburant", "gaz", "nocif", "corrosif", "toxique", "sante", "environnement"]
ghs_x = [48.0, 105.0, 161.5, 217.9, 274.3, 330.8, 387.8, 444.5, 501.0]
for i, code in enumerate(ghs):
    x0 = ghs_x[i] + 11
    crop_pdf("ghs-" + code, 0, x0, 549.5, x0 + 40, 588, 160, erode=False)

# Conditionnement (page 1)
cond_top = {"colis": 88.6, "palette": 187.6, "panier": 290.4, "rack": 389.8, "caisse_palette": 495.6}
for code, cx in cond_top.items():
    crop_pdf("cond-" + code, 0, cx - 40, 611, cx + 40, 645, 200)
cond_bottom = {"big_bag": 88.6, "bidon": 187.7, "benne": 290.6, "container": 389.8}
for code, cx in cond_bottom.items():
    crop_pdf("cond-" + code, 0, cx - 40, 659, cx + 40, 694, 200)

# Type de véhicule (page 2)
veh = {"moins_3t5": 106.1, "plus_3t5": 231.8, "hauteur": 355.4, "longueur": 487.4}
for code, cx in veh.items():
    crop_pdf("veh-" + code, 1, cx - 60, 46, cx + 60, 104, 220)

# Caractéristiques du véhicule (page 2)
car1 = {"articule": 106.3, "toupie": 233.6, "citerne": 360.8, "benne": 488.4}
for code, cx in car1.items():
    crop_pdf("car-" + code, 1, cx - 62, 144, cx + 62, 199, 220)
car2 = {"plateau": 106.1, "bache_sol": 233.5, "porte_engin": 360.9}
for code, cx in car2.items():
    crop_pdf("car-" + code, 1, cx - 62, 214, cx + 62, 269, 220)

# Équipements de manutention (page 2)
man = {"grue_aux": 82.5, "hayon": 171.6, "benne_basc": 264.5, "transpalette": 347.5, "diable": 413.7, "elingues": 502.2}
for code, cx in man.items():
    crop_pdf("man-" + code, 1, cx - 36, 469, cx + 36, 521, 200)

# ---------------------------------------------------------------- EPI (affiche du chantier)
if os.path.exists(AFFICHE):
    aff = Image.open(AFFICHE).convert("RGB")
    k = aff.width / 1545  # coordonnées relevées sur une version 1545 px de large
    epi = {
        "casque": (895, 635, 1075, 775),
        "gants": (1105, 625, 1305, 795),
        "veste": (848, 790, 1015, 1025),
        "gilet": (1082, 815, 1235, 1000),
        "pantalon": (1390, 700, 1485, 930),
        "chaussures": (1250, 940, 1420, 1075),
    }
    for code, box in epi.items():
        img = trim(aff.crop(tuple(int(v * k) for v in box)))
        img.thumbnail((220, 220), Image.LANCZOS)
        save_icon("epi-" + code, img)

print("OK :", len(os.listdir(OUT_ICONS)), "pictogrammes,", len(os.listdir(OUT_PAGES)), "pages")
