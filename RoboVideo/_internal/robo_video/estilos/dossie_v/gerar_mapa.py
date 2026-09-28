"""Gera pecas/mapa-mundo.png (mapa em traco claro do Dossie validado).

Sem dados externos: os continentes vem do contorno simplificado desenhado a mao
(`estilos/broadcast/comum/mundo.js`, lido so na geracao) e as "fronteiras" sao uma
aproximacao: celulas de Voronoi dos centros aproximados dos paises (lista abaixo),
com ruido suave para o traco parecer organico, recortadas pela terra. Serve como
textura de fundo (mapa de referencia), nao como cartografia.

    .venv\\Scripts\\python robo_video\\estilos\\dossie_v\\gerar_mapa.py

Projecao equiretangular: ESCALA px/grau (em 1920x1080), lon 0 em X0, lat LAT_N no topo.
As pecas (mapa-mundi.html) usam as MESMAS constantes (MAPA_* em _comum.js).
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = Path(__file__).resolve().parent
FONTE = AQUI.parent / "broadcast" / "comum" / "mundo.js"
SAIDA = AQUI / "pecas" / "mapa-mundo.png"

ESCALA = 4.6          # px (tela 1920) por grau
LAT_N, LAT_S = 84.0, -58.0
SS = 2                # supersample da textura (a peca exibe em 1x)
W = int(round(360 * ESCALA))
H = int(round((LAT_N - LAT_S) * ESCALA))

# centros aproximados (lat, lon) -- so para as celulas das fronteiras
PAISES = [
    # Americas
    (64, -150), (60, -135), (58, -110), (55, -95), (52, -72), (47, -84), (44, -120), (39, -105), (37, -95), (34, -85),
    (41, -76), (31, -99), (23.6, -102.5), (15.5, -90.3), (13.8, -88.9), (14.7, -86.6), (12.9, -85.2), (9.8, -84),
    (8.6, -80.1), (21.5, -79), (18.9, -72.5), (18.7, -70.2), (4.6, -74.1), (7, -66), (4.9, -58.9), (4, -56), (4, -53),
    (-1.8, -78.2), (-9.2, -75), (-16.3, -64.6), (-23.4, -58.4), (-32.5, -55.8), (-35, -71.3), (-24, -69.5),
    (-38.4, -63.6), (-47, -69), (-3, -62), (-10, -52), (-6, -42), (-15, -47), (-22, -45), (-28, -52), (-12, -38),
    (72, -40), (65, -18.5),
    # Europa
    (39.4, -8.2), (40.4, -3.7), (46.2, 2.2), (52.5, -1.5), (56.8, -4.2), (53.2, -8), (50.6, 4.6), (52.2, 5.6),
    (51.2, 10.4), (47.5, 14.6), (46.8, 8.2), (42.8, 12.6), (39.3, 16.2), (52, 19.4), (49.8, 15.5), (48.7, 19.7),
    (47.2, 19.5), (45.9, 25), (42.7, 25.5), (44, 21), (45.1, 15.2), (43.9, 17.7), (41.1, 20.2), (41.6, 21.7),
    (39.1, 21.8), (56, 9.5), (61.5, 9), (67, 15), (60.5, 15), (64.5, 18), (62, 26), (66.5, 27), (58.6, 25),
    (56.9, 24.6), (55.2, 23.9), (53.7, 27.9), (49, 31.4), (47, 28.5), (39.9, 32.9), (37.5, 40), (42, 43.5),
    (40.2, 45), (40.3, 47.6),
    # Russia/Asia central
    (56, 38), (62, 48), (58, 60), (64, 75), (60, 90), (66, 105), (58, 118), (65, 135), (62, 150), (66, 170),
    (55, 105), (50, 130), (48, 67), (46, 52), (41.4, 64.6), (39, 59.5), (38.9, 71.3), (41.2, 74.8), (46.9, 103.8),
    # Oriente Medio / Sul da Asia
    (33.2, 43.7), (35, 38.5), (31.2, 36.3), (33.9, 35.9), (23.9, 45.1), (26, 40), (15.5, 48.5), (21.5, 56),
    (23.9, 54.3), (32.4, 53.7), (29, 58), (33.9, 67.7), (30.4, 69.3), (26, 64), (20.6, 78.96), (27, 80), (23, 72),
    (15, 76), (22, 86), (28.4, 84.1), (27.5, 90.4), (23.7, 90.4), (7.9, 80.8), (21.9, 95.9), (15.9, 101),
    (19.8, 102.5), (12.6, 104.9), (14.1, 108.3), (21, 105.5), (4.2, 101.98), (2.5, 113), (-0.6, 101.3),
    (-2.5, 118), (-7.5, 110), (-4, 138), (-6.3, 143.9), (12.9, 121.8), (8, 125),
    # China, Coreia, Japao
    (35.9, 104.2), (31, 88), (41, 85), (43, 125), (40, 116), (30, 112), (25, 105), (28, 118), (23, 113),
    (35.9, 127.8), (40.3, 127.5), (36.2, 138.3), (43.5, 142.5), (23.7, 121),
    # Africa
    (28, 2.6), (34, 9.5), (27, 17), (26.8, 30.8), (15.6, 30.2), (7.9, 30), (15.2, 39.8), (9.1, 40.5), (5.2, 46.2),
    (31.8, -7.1), (24.2, -12.9), (20, -10.5), (17.6, -3.9), (17.6, 8.1), (15.4, 18.7), (14.5, -14.5),
    (11.8, -15.2), (9.9, -9.7), (8.5, -11.8), (6.4, -9.4), (7.5, -5.5), (12.2, -1.6), (7.9, -1.0), (8.6, 0.8),
    (9.3, 2.3), (9.1, 8.7), (7.4, 12.4), (6.6, 20.9), (1.6, 10.3), (-0.8, 11.6), (-0.2, 15.8), (-2.9, 23.7),
    (-8, 26), (1.4, 32.3), (-0.02, 37.9), (-6.4, 34.9), (-1.9, 29.9), (-11.2, 17.9), (-13.1, 27.8), (-13.3, 34.3),
    (-18.7, 35.5), (-19, 29.2), (-22.3, 24.7), (-22.9, 18.5), (-30.6, 22.9), (-26.5, 31.5), (-18.8, 47),
    # Oceania
    (-25, 122), (-20, 134), (-22, 145), (-32, 146), (-33, 135), (-42, 146.5), (-41, 174),
]


def ler_poligonos(js: str) -> tuple[list, list]:
    blocos = js.split("window.MUNDO_AGUA")
    def polys(txt):
        out = []
        for m in re.finditer(r"P\(`([^`]*)`\)", txt):
            pts = [tuple(map(float, par.split(","))) for par in m.group(1).split()]
            out.append(pts)
        return out
    return polys(blocos[0]), polys(blocos[1]) if len(blocos) > 1 else []


def xy(lon, lat):
    return ((lon + 180) * ESCALA * SS, (LAT_N - lat) * ESCALA * SS)


def ruido_suave(h, w, cel, seed):
    rng = np.random.default_rng(seed)
    gy, gx = h // cel + 2, w // cel + 2
    g = rng.random((gy, gx)) * 2 - 1
    ys, xs = np.arange(h) / cel, np.arange(w) / cel
    y0, x0 = ys.astype(int), xs.astype(int)
    ty, tx = ys - y0, xs - x0
    ty, tx = ty * ty * (3 - 2 * ty), tx * tx * (3 - 2 * tx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    top = a + (b - a) * tx[None, :]
    bot = c + (d - c) * tx[None, :]
    return top + (bot - top) * ty[:, None]


def main():
    terra, agua = ler_poligonos(FONTE.read_text(encoding="utf-8"))
    WW, HH = W * SS, H * SS
    mask = Image.new("L", (WW, HH), 0)
    dm = ImageDraw.Draw(mask)
    for p in terra:
        dm.polygon([xy(lo, la) for lo, la in p], fill=255)
    for p in agua:
        dm.polygon([xy(lo, la) for lo, la in p], fill=0)
    terra_m = np.array(mask) > 127

    # rotulo (pais mais proximo) por pixel, com ruido suave nas coordenadas
    ys, xs = np.mgrid[0:HH, 0:WW].astype(np.float32)
    lon = xs / (ESCALA * SS) - 180
    lat = LAT_N - ys / (ESCALA * SS)
    lon = lon + 1.6 * ruido_suave(HH, WW, 90, 1) + 0.5 * ruido_suave(HH, WW, 23, 2)
    lat = lat + 1.2 * ruido_suave(HH, WW, 90, 3) + 0.4 * ruido_suave(HH, WW, 23, 4)
    coslat = np.cos(np.radians(np.clip(lat, -80, 80)))
    melhor = np.full((HH, WW), np.inf, dtype=np.float32)
    rot = np.zeros((HH, WW), dtype=np.int16)
    for i, (pla, plo) in enumerate(PAISES):
        dx = (lon - plo) * coslat
        dy = lat - pla
        dd = dx * dx + dy * dy
        m = dd < melhor
        melhor[m] = dd[m]
        rot[m] = i
    borda = np.zeros_like(terra_m)
    borda[:, 1:] |= (rot[:, 1:] != rot[:, :-1]) & terra_m[:, 1:] & terra_m[:, :-1]
    borda[1:, :] |= (rot[1:, :] != rot[:-1, :]) & terra_m[1:, :] & terra_m[:-1, :]

    linhas = Image.fromarray((borda * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    costa = Image.new("L", (WW, HH), 0)
    dc = ImageDraw.Draw(costa)
    for p in terra + agua:
        pts = [xy(lo, la) for lo, la in p]
        dc.line(pts + [pts[0]], fill=255, width=3, joint="curve")
    a = np.maximum(np.array(linhas).astype(np.float32) * 0.7, np.array(costa).astype(np.float32) * 0.8)
    img = Image.new("RGBA", (WW, HH), (236, 228, 208, 0))
    img.putalpha(Image.fromarray(a.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)))
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    img.save(SAIDA, optimize=True)
    print(SAIDA, img.size)


if __name__ == "__main__":
    main()
