#!/usr/bin/env python3
"""Test d'intégration : vérifie une vraie boutique PrestaShop en fonctionnement.

    python3 tests/integration/smoke.py [adresse]      (défaut : http://localhost:8080)

Attend que la boutique réponde (l'installation prend quelques minutes au premier
démarrage), puis contrôle la page d'accueil, ses en-têtes de sécurité, l'API et
un parcours panier complet. N'utilise que la bibliothèque standard de Python.
"""
import html
import http.cookiejar
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
WAIT_SECONDS = int(sys.argv[2]) if len(sys.argv) > 2 else 900

# Un visiteur = un pot de cookies : le panier est lié à la session.
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
checks = 0


def request(url, data=None):
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"Accept": "application/json"})
    try:
        with opener.open(req, timeout=60) as response:
            return response.status, response.headers, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read().decode("utf-8", "replace")


def check(condition, label):
    global checks
    if not condition:
        print(f"ÉCHEC  {label}")
        sys.exit(1)
    checks += 1
    print(f"ok     {label}")


def wait_for_shop():
    deadline = time.time() + WAIT_SECONDS
    while True:
        try:
            status, _, body = request(BASE + "/")
            if status == 200 and "data-slimroom" in body:
                return
            state = f"HTTP {status}"
        except OSError as error:
            state = type(error).__name__
        if time.time() > deadline:
            print(f"ÉCHEC  la boutique ne répond pas après {WAIT_SECONDS} s ({state})")
            sys.exit(1)
        print(f"…      en attente de la boutique ({state})", flush=True)
        time.sleep(10)


wait_for_shop()

# ----- Page d'accueil -----
status, headers, page = request(BASE + "/")
check(status == 200, "la page d'accueil répond")
check(page.lstrip().lower().startswith("<!doctype html>"), "elle commence par le doctype (pas de mode « quirks »)")
check("<script>" not in page, "elle ne contient aucun script en ligne")
match = re.search(r'data-slimroom="([^"]*)"', page)
check(match is not None, "elle porte la configuration du front")
config = json.loads(html.unescape(match.group(1)))
check(set(config) == {"apiUrl", "cartUrl", "token"}, "la configuration contient l'API, le panier et le jeton")

csp = headers.get("Content-Security-Policy", "")
check("default-src 'self'" in csp and "object-src 'none'" in csp, "politique de sécurité de contenu présente")
script_src = next((part for part in csp.split(";") if part.strip().startswith("script-src")), "")
check("unsafe" not in script_src, "aucun script en ligne ni eval autorisé")
check(headers.get("X-Content-Type-Options") == "nosniff", "en-tête X-Content-Type-Options")
check(headers.get("X-Frame-Options") == "SAMEORIGIN", "en-tête X-Frame-Options")
check(bool(headers.get("Referrer-Policy")), "en-tête Referrer-Policy")

for kind, pattern in (("JavaScript", r'src="([^"]+room\.js[^"]*)"'), ("CSS", r'href="([^"]+room\.css[^"]*)"')):
    asset = re.search(pattern, page)
    check(asset is not None, f"la page référence le {kind} du front")
    asset_status, _, content = request(urllib.parse.urljoin(BASE + "/", html.unescape(asset.group(1))))
    check(asset_status == 200 and len(content) > 1000, f"le {kind} du front est servi")

# ----- API -----
status, headers, body = request(config["apiUrl"])
check(status == 200 and "application/json" in headers.get("Content-Type", ""), "l'API répond en JSON")
check("no-store" in headers.get("Cache-Control", ""), "l'API n'est pas mise en cache")
data = json.loads(body)
by_slug = {category["slug"]: category for category in data["categories"]}
for slug in ("cds", "vetements", "posters"):
    check(slug in by_slug, f"catégorie « {slug} » présente (attendue par config.ts)")
check(len(by_slug["cds"]["products"]) > 0, "la catégorie CDs contient des produits")
product = by_slug["cds"]["products"][0]
check({"id", "attributeId", "name", "price", "image"} <= set(product), "un produit a tous ses champs")
check(data["cart"]["count"] == 0, "le panier d'un nouveau visiteur est vide")


def cart():
    return json.loads(request(config["apiUrl"] + ("&" if "?" in config["apiUrl"] else "?") + "only=cart")[2])


def change(**params):
    fields = {
        "token": config["token"],
        "id_product": product["id"],
        "id_product_attribute": product["attributeId"],
        "id_customization": 0,
        "action": "update",
        "ajax": 1,
        **params,
    }
    status, _, body = request(config["cartUrl"], fields)
    result = json.loads(body)
    check(status == 200 and not result.get("hasError"), f"le panier natif accepte {params}")


# ----- Parcours panier (mêmes requêtes que le front) -----
change(add=1, qty=1)
state = cart()
check(state["count"] == 1 and state["items"][0]["id"] == product["id"], "ajout : 1 article dans le panier")
check({"id", "attributeId", "name", "detail", "quantity", "price", "total", "image"} <= set(state["items"][0]),
      "une ligne de panier a tous ses champs")
check("action=show" in state["checkoutUrl"], "le lien « Commander » mène au panier de la boutique")
change(update=1, op="up", qty=2)
check(cart()["count"] == 3, "augmentation : 3 articles")
change(update=1, op="down", qty=1)
check(cart()["count"] == 2, "diminution : 2 articles")
change(delete=1)
check(cart()["count"] == 0, "suppression : panier vide")

# ----- L'API est en lecture seule -----
request(config["apiUrl"], {"id_product": product["id"], "add": 1, "qty": 1})
check(cart()["count"] == 0, "écrire sur l'API ne modifie pas le panier")

# ----- Le reste de la boutique n'est pas remplacé -----
status, _, body = request(state["checkoutUrl"])
check(status == 200 and "data-slimroom" not in body, "la page panier reste celle de PrestaShop")

print(f"\n{checks} vérifications réussies sur {BASE}")
