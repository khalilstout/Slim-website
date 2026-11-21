"""Agrandit la texture de la chambre (768 px) en 2048 px, pour la vue intérieure.

    python3 -m venv venv && ./venv/bin/pip install "opencv-contrib-python-headless<5" numpy
    curl -L -o EDSR_x4.pb https://github.com/Saafke/EDSR_Tensorflow/raw/master/models/EDSR_x4.pb
    ./venv/bin/python tools/upscale-texture.py \\
        Ressources/bundle_001/textures/room_baseColor.png EDSR_x4.pb frontend/src/assets/room-base.jpg

C'est un agrandissement « intelligent » (réseau EDSR, via OpenCV) : il rend les
bords nets mais n'invente pas de détail. Le vrai remède reste un rendu des
textures en plus grand depuis Blender. Détail : docs/guide-modifications.md, section 7.
"""
import sys, cv2, numpy as np
src, model, out = sys.argv[1:4]
img = cv2.imread(src, cv2.IMREAD_UNCHANGED)
bgr, alpha = img[:, :, :3].copy(), img[:, :, 3]
# Les zones vides de la planche sont transparentes : on y étale d'abord les couleurs
# voisines, sinon l'agrandissement ferait baver du blanc sur le bord des objets.
mask = (alpha > 8).astype(np.uint8)
filled, known = bgr.copy(), mask.copy()
kernel = np.ones((3, 3), np.uint8)
for _ in range(24):
    grown = cv2.dilate(known, kernel)
    ring = (grown == 1) & (known == 0)
    if not ring.any(): break
    blur = cv2.blur(filled * known[:, :, None], (3, 3)).astype(np.float32)
    weight = cv2.blur(known.astype(np.float32), (3, 3))[:, :, None]
    estimate = np.where(weight > 0, blur / np.maximum(weight, 1e-6), 0)
    filled[ring] = estimate[ring].astype(np.uint8)
    known = grown
sr = cv2.dnn_superres.DnnSuperResImpl_create()
sr.readModel(model); sr.setModel('edsr', 4)
big = sr.upsample(filled)                       # 768 -> 3072
big = cv2.resize(big, (2048, 2048), interpolation=cv2.INTER_AREA)
cv2.imwrite(out, big, [cv2.IMWRITE_JPEG_QUALITY, 90])
print('ok', big.shape)
