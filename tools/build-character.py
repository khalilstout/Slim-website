"""Construit le bonhomme en 3D avec Blender et l'exporte pour le site.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/build-character.py -- \
        frontend/src/assets/character.glb [dossier-pour-images-de-contrôle]

Tout le personnage est décrit ici : proportions, vêtements, cheveux, couleurs,
squelette. Pour le modifier, changer les valeurs puis relancer la commande.
Mesures en mètres ; Z vers le haut ; le personnage regarde vers -Y (l'avant
dans Blender). Le site anime le squelette lui-même (frontend/src/character.ts),
à partir du nom des os : ne pas les renommer sans y reporter le changement.
"""
import math
import random
import sys

import bmesh
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUTPUT = args[0] if args else "character.glb"
PREVIEW_DIR = args[1] if len(args) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ----- Outils -----
def linear(hex_color):
    """Couleur « web » (0xRRGGBB) vers les valeurs linéaires attendues par Blender."""
    channels = [((hex_color >> shift) & 255) / 255 for shift in (16, 8, 0)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]


def material(name, hex_color, roughness=0.85):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*linear(hex_color), 1)
    shader.inputs["Roughness"].default_value = roughness
    return result


SKIN = material("peau", 0xF0C2A2)
HAIR = material("cheveux", 0x4E3222)
SHIRT = material("tshirt", 0xF2CF3A)
SHORTS = material("short", 0xC6322C)
SOCK = material("chaussette", 0xE58AA2)
SHOE = material("sabot", 0xF4F1E8)
SOLE = material("semelle", 0xD9D2C2)
CAP_YELLOW = material("casquette_jaune", 0xF2C530)
CAP_RED = material("casquette_rouge", 0xD43A34)
CAP_GREEN = material("casquette_verte", 0x3F9A4D)
DARK = material("sombre", 0x26242B, 0.5)
MOUTH = material("bouche", 0x8A2F3A)
WHITE = material("blanc", 0xFFFFFF, 0.4)
PRINT = material("motif", 0x27407F)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def smooth(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def apply_modifiers(obj):
    activate(obj)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def new_object(name, mesh, mat=None):
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def tube(name, points, edges, mat, levels=2):
    """Forme organique : une enveloppe lisse autour d'un fil de fer.
    `points` = [(x, y, z, rayon_x, rayon_y), ...] ; le premier est la racine."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([p[:3] for p in points], edges, [])
    obj = new_object(name, mesh, mat)
    obj.modifiers.new("skin", "SKIN")
    for vertex, point in zip(mesh.skin_vertices[0].data, points):
        vertex.radius = (point[3], point[4])
        vertex.use_root = False
    mesh.skin_vertices[0].data[0].use_root = True
    subdivision = obj.modifiers.new("subdivision", "SUBSURF")
    subdivision.levels = subdivision.render_levels = levels
    apply_modifiers(obj)
    smooth(obj)
    return obj


def sphere(name, location, radius, mat, scale=(1, 1, 1), segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    smooth(obj)
    return obj


def both_sides(build):
    """Appelle `build(côté)` pour la gauche (+1) et la droite (-1)."""
    return [build(1), build(-1)]


parts = {}  # nom de l'os -> objets qui le suivent d'un bloc


def follows(bone, *objects):
    parts.setdefault(bone, []).extend(objects)
    return objects[0]


# ----- Corps (peau) : une seule forme continue -----
def body_points():
    points = [
        (0, 0, 0.93, 0.13, 0.098),    # 0 bassin
        (0, 0, 1.08, 0.12, 0.088),    # 1 taille
        (0, 0, 1.30, 0.15, 0.1),      # 2 poitrine
        (0, 0, 1.42, 0.062, 0.06),    # 3 base du cou
        (0, 0, 1.50, 0.052, 0.052),   # 4 haut du cou
    ]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4)]
    for side in (1, -1):
        start = len(points)
        points += [
            (side * 0.19, 0, 1.385, 0.058, 0.058),        # épaule
            (side * 0.25, 0.005, 1.13, 0.044, 0.044),     # coude
            (side * 0.258, 0.0, 1.05, 0.045, 0.043),      # haut de l'avant-bras, un peu plus charnu
            (side * 0.275, -0.01, 0.90, 0.034, 0.03),     # poignet
            (side * 0.283, -0.016, 0.83, 0.042, 0.024),   # paume
            (side * 0.288, -0.02, 0.765, 0.036, 0.022),   # doigts
            (side * 0.262, -0.055, 0.815, 0.016, 0.016),  # pouce
        ]
        edges += [(2, start)] + [(start + i, start + i + 1) for i in range(5)] + [(start + 4, start + 6)]
        start = len(points)
        points += [
            (side * 0.092, 0, 0.90, 0.09, 0.092),         # hanche
            (side * 0.097, -0.003, 0.70, 0.076, 0.08),    # cuisse
            (side * 0.10, -0.005, 0.50, 0.058, 0.06),     # genou
            (side * 0.103, 0.012, 0.37, 0.056, 0.064),    # mollet
            (side * 0.105, 0.006, 0.15, 0.04, 0.044),     # cheville
            (side * 0.105, 0.0, 0.06, 0.042, 0.05),       # talon, dans la chaussure
        ]
        edges += [(0, start)] + [(start + i, start + i + 1) for i in range(5)]
    return points, edges


body = tube("corps", *body_points(), SKIN)
# On retire la peau cachée au cœur du t-shirt et du short (elle ne peut plus traverser le tissu),
# en la laissant dépasser largement à l'intérieur des ouvertures : on ne voit jamais de vide.
hidden = bmesh.new()
hidden.from_mesh(body.data)
bmesh.ops.delete(hidden, context="VERTS", geom=[
    v for v in hidden.verts
    if (0.74 < v.co.z < 1.36 and abs(v.co.x) < 0.19) or (1.27 < v.co.z < 1.41 and abs(v.co.x) < 0.265)
    or 0.09 < v.co.z < 0.31   # sous les chaussettes
])
hidden.to_mesh(body.data)
hidden.free()

# ----- Vêtements : des enveloppes plus larges que le corps, resserrées aux ouvertures -----
shirt_points = [
    (0, 0, 0.87, 0.158, 0.127),
    (0, 0, 1.08, 0.154, 0.122),
    (0, 0, 1.30, 0.178, 0.128),
    (0, 0, 1.415, 0.085, 0.08),
]
shirt_edges = [(0, 1), (1, 2), (2, 3)]
for side in (1, -1):
    start = len(shirt_points)
    shirt_points += [
        (side * 0.19, 0, 1.385, 0.08, 0.08),
        (side * 0.222, 0.002, 1.27, 0.072, 0.072),
        (side * 0.24, 0.003, 1.205, 0.062, 0.062),   # la manche se resserre sur le bras
    ]
    shirt_edges += [(2, start), (start, start + 1), (start + 1, start + 2)]
shirt = tube("tshirt", shirt_points, shirt_edges, SHIRT)
relax = shirt.modifiers.new("lissage", "SMOOTH")   # arrondit les angles aux épaules
relax.factor, relax.iterations = 0.5, 6
apply_modifiers(shirt)

shorts_points = [(0, 0, 1.06, 0.14, 0.108), (0, 0, 0.93, 0.152, 0.118)]
shorts_edges = [(0, 1)]
for side in (1, -1):
    start = len(shorts_points)
    shorts_points += [
        (side * 0.092, 0, 0.88, 0.108, 0.108),
        (side * 0.097, -0.002, 0.72, 0.098, 0.1),
        (side * 0.099, -0.004, 0.61, 0.084, 0.086),   # la jambe du short se resserre sur la cuisse
    ]
    shorts_edges += [(1, start), (start, start + 1), (start + 1, start + 2)]
shorts = tube("short", shorts_points, shorts_edges, SHORTS)


def hem(name, bone, center, radius, mat, thickness=0.011, tilt=(0, 0, 0), stretch=1.0):
    """Ourlet : un anneau qui borde une ouverture (col, manche, jambe de short, haut de chaussette)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thickness, major_segments=32, minor_segments=10,
                                     location=center, rotation=tilt)
    ring = bpy.context.active_object
    ring.name = name
    ring.scale = (1, stretch, 1)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ring.data.materials.append(mat)
    smooth(ring)
    return follows(bone, ring)


def opening(obj, select, top=False, band=0.022):
    """Où un vêtement se termine vraiment (l'enveloppe arrondit ses extrémités) : centre et rayon du bord."""
    points = [v.co for v in obj.data.vertices if select(v.co)]
    edge = max(p.z for p in points) if top else min(p.z for p in points)
    near = [p for p in points if abs(p.z - edge) < band]
    center = sum(near, Vector()) / len(near)
    radius = max(math.hypot(p.x - center.x, p.y - center.y) for p in near)
    center.z = edge + (-band if top else band) * 0.55
    return center, radius


center, radius = opening(shirt, lambda p: abs(p.x) < 0.1, top=True)
hem("col", "chest", center, radius * 0.93, SHIRT, thickness=0.012)
for side, suffix in ((1, "L"), (-1, "R")):
    center, radius = opening(shirt, lambda p: p.x * side > 0.2)
    hem("ourlet_manche", "upper_arm." + suffix, center, radius * 0.95, SHIRT, thickness=0.01, tilt=(0, side * math.radians(-13), 0))
    center, radius = opening(shorts, lambda p: p.x * side > 0.02)
    hem("ourlet_short", "thigh." + suffix, center, radius * 0.95, SHORTS, thickness=0.011)


def sock(side):
    """Chaussette qui épouse le mollet, avec son bord côtelé, et descend dans la chaussure."""
    suffix = "L" if side > 0 else "R"
    points = [
        (side * 0.1035, 0.011, 0.36, 0.06, 0.066),
        (side * 0.1045, 0.008, 0.24, 0.052, 0.057),
        (side * 0.105, 0.006, 0.15, 0.046, 0.05),
        (side * 0.105, 0.0, 0.07, 0.047, 0.055),
    ]
    obj = follows("shin." + suffix, tube("chaussette_" + suffix, points, [(0, 1), (1, 2), (2, 3)], SOCK, levels=3))
    center, radius = opening(obj, lambda p: True, top=True)
    hem("bord_chaussette", "shin." + suffix, center, radius * 0.95, SOCK, thickness=0.011)


def shoe(side):
    """Sabot : une coque aux bords très arrondis, plus large à l'avant."""
    suffix = "L" if side > 0 else "R"
    center = Vector((side * 0.105, -0.03, 0.068))
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.active_object
    obj.name = "sabot_" + suffix
    obj.scale = (0.132, 0.27, 0.118)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    for vertex in obj.data.vertices:
        if vertex.co.y < center.y:   # l'avant est plus large et bombé
            vertex.co.x = center.x + (vertex.co.x - center.x) * 1.14
        elif vertex.co.z > center.z:  # l'arrière est plus bas : le pied y entre
            vertex.co.z -= 0.02
    bevel = obj.modifiers.new("bevel", "BEVEL")
    bevel.width, bevel.segments = 0.05, 8
    apply_modifiers(obj)
    obj.data.materials.append(SHOE)
    smooth(obj)
    follows("foot." + suffix, obj)


both_sides(sock)
both_sides(shoe)

# Motif du t-shirt : le nom, en relief léger, posé sur la poitrine.
chest_front = min(v.co.y for v in shirt.data.vertices if abs(v.co.x) < 0.09 and abs(v.co.z - 1.26) < 0.04)
bpy.ops.object.text_add(location=(0, chest_front - 0.001, 1.235), rotation=(math.radians(90), 0, 0))
text = bpy.context.active_object
text.data.body = "SLIM"
text.data.align_x = "CENTER"
text.data.size = 0.09
text.data.extrude = 0.007   # assez épais pour rester lisible sur le tissu bombé
bpy.ops.object.convert(target="MESH")
text.name = "motif"
text.data.materials.append(PRINT)
follows("chest", text)

# ----- Tête -----
R = 0.125                       # rayon de la tête : toutes les mesures du visage en découlent
HEAD = Vector((0, 0, 1.615))


def on_head(x, y, z):
    """Position donnée en « rayons de tête » : (1, 0, 0) = sur l'oreille gauche, (0, -1, 0) = bout du nez."""
    return HEAD + Vector((x, y, z)) * R


head = sphere("tete", HEAD, R, SKIN, scale=(0.95, 1.0, 1.12), segments=48, rings=32)
for vertex in head.data.vertices:  # mâchoire : la tête s'affine vers le menton
    below = (HEAD.z - vertex.co.z) / R
    if below > 0:
        factor = 1 - 0.2 * below ** 1.5
        vertex.co.x *= factor
        vertex.co.y = vertex.co.y * (factor * 0.5 + 0.5)
follows("head", head)
follows("head", sphere("nez", on_head(0, -0.99, -0.2), 0.15 * R, SKIN, scale=(0.9, 1.1, 1)))
for side in (1, -1):
    follows("head", sphere("oreille", on_head(side * 0.94, 0.08, -0.1), 0.26 * R, SKIN, scale=(0.45, 0.8, 1.1)))
    eye = on_head(side * 0.36, -0.87, 0.1)
    follows("head", sphere("oeil", eye, 0.13 * R, WHITE, scale=(1, 0.6, 1.15)))
    follows("head", sphere("pupille", eye + Vector((0, -0.07 * R, 0)), 0.085 * R, DARK, scale=(1, 0.5, 1.15)))
    bpy.ops.mesh.primitive_cube_add(size=1, location=on_head(side * 0.37, -0.93, 0.42),
                                    rotation=(0, side * math.radians(-6), side * math.radians(10)))
    brow = bpy.context.active_object
    brow.name = "sourcil"
    brow.scale = (0.34 * R, 0.07 * R, 0.07 * R)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bevel = brow.modifiers.new("bevel", "BEVEL")
    bevel.width, bevel.segments = 0.003, 3
    apply_modifiers(brow)
    brow.data.materials.append(HAIR)
    smooth(brow)
    follows("head", brow)
# Sourire : un trait épais qui remonte aux coins et suit la courbe du visage.
smile = []
for step in range(9):
    t = -1 + step * 0.25
    point = on_head(t * 0.3, -0.9 + 0.1 * t * t, -0.6 + 0.13 * t * t)
    smile.append((*point, 0.045 * R, 0.045 * R))
follows("head", tube("sourire", smile, [(i, i + 1) for i in range(8)], MOUTH))

# Lunettes rondes à monture fine, un peu en avant du visage.
for side in (1, -1):
    center = on_head(side * 0.37, -1.06, 0.1)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.3 * R, minor_radius=0.034 * R, major_segments=40, minor_segments=10,
                                     location=center, rotation=(math.radians(90), 0, 0))
    rim = bpy.context.active_object
    rim.name = "lunettes"
    rim.data.materials.append(DARK)
    smooth(rim)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.028 * R, depth=1.0 * R, vertices=8,
                                        location=center + Vector((side * 0.36 * R, 0.5 * R, 0.02 * R)),
                                        rotation=(math.radians(90), 0, side * math.radians(10)))
    temple = bpy.context.active_object
    temple.name = "branche"
    temple.data.materials.append(DARK)
    follows("head", rim, temple)
bpy.ops.mesh.primitive_cylinder_add(radius=0.028 * R, depth=0.16 * R, vertices=8,
                                    location=on_head(0, -1.06, 0.16), rotation=(0, math.radians(90), 0))
bridge = bpy.context.active_object
bridge.name = "pont"
bridge.data.materials.append(DARK)
follows("head", bridge)

# Fond de chevelure : une calotte qui couvre l'arrière et les côtés du crâne, sous les boucles.
scalp = sphere("fond_cheveux", HEAD, R * 1.035, HAIR, scale=(0.95, 1.0, 1.12), segments=32, rings=20)
under = bmesh.new()
under.from_mesh(scalp.data)
bmesh.ops.delete(under, context="VERTS", geom=[
    v for v in under.verts if (v.co.y - HEAD.y) < -0.12 * R or (v.co.z - HEAD.z) < -0.72 * R
])
under.to_mesh(scalp.data)
under.free()
follows("head", scalp)

# Cheveux bouclés : beaucoup de petites boules qui fusionnent, sur les côtés et l'arrière, plus une frange.
random.seed(4)
bpy.ops.object.metaball_add(type="BALL", radius=0.3 * R, location=HEAD)
curls = bpy.context.active_object
curls.data.resolution = 0.0085
curls.data.elements[0].co = Vector((0, 0.85 * R, 0))
for i in range(230):
    # Angle mesuré depuis l'avant : on couvre des tempes à la nuque.
    angle = math.radians(58 + 244 * ((i * 0.618) % 1))
    height = -0.95 + random.random() * 1.6
    out = 0.92 + random.random() * 0.4 + max(0, -height) * 0.15   # plus de volume vers le bas
    element = curls.data.elements.new()
    element.co = Vector((math.sin(angle) * out, -math.cos(angle) * out, height)) * R
    element.radius = (0.2 + random.random() * 0.14) * R
for i in range(11):  # frange qui dépasse sous la visière
    across = -0.6 + i * 0.12
    element = curls.data.elements.new()
    element.co = Vector((across, -0.86 + abs(across) * 0.22, 0.56 - abs(across) * 0.18)) * R
    element.radius = 0.2 * R
activate(curls)
bpy.ops.object.convert(target="MESH")
hair = bpy.context.active_object
hair.name = "cheveux"
hair.data.materials.append(HAIR)
decimate = hair.modifiers.new("decimate", "DECIMATE")
decimate.ratio = 0.3
apply_modifiers(hair)
smooth(hair)
follows("head", hair)

# Casquette à quartiers de couleur, posée haut sur la tête.
CAP = on_head(0, 0.03, 0.5)
CAP_R = 1.12 * R
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=CAP_R, location=CAP)
cap = bpy.context.active_object
cap.name = "casquette"
cap.scale = (1.0, 1.06, 0.92)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
mesh = bmesh.new()
mesh.from_mesh(cap.data)
bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if v.co.z < CAP.z + 0.02 * R], context="VERTS")
mesh.to_mesh(cap.data)
mesh.free()
for mat in (CAP_YELLOW, CAP_GREEN, CAP_RED):
    cap.data.materials.append(mat)
for polygon in cap.data.polygons:  # six quartiers, le premier centré sur l'avant
    angle = math.atan2(polygon.center.x - CAP.x, -(polygon.center.y - CAP.y))
    polygon.material_index = int(((angle + math.pi / 6) % (2 * math.pi)) / (math.pi / 3)) % 3
solidify = cap.modifiers.new("solidify", "SOLIDIFY")
solidify.thickness = 0.008
apply_modifiers(cap)
smooth(cap)
follows("head", cap)
follows("head", sphere("bouton", CAP + Vector((0, 0, CAP_R * 0.92)), 0.1 * R, CAP_RED))

# Visière : un demi-disque allongé, légèrement incliné vers le bas.
outline = []
for step in range(25):
    angle = math.radians(-84 + step * 7)
    outline.append(Vector((math.sin(angle) * CAP_R * 0.98, -0.5 * CAP_R - math.cos(angle) * CAP_R * 1.05, 0)))
brim_mesh = bpy.data.meshes.new("visiere")
brim_bm = bmesh.new()
brim_bm.faces.new([brim_bm.verts.new(point) for point in outline])
bmesh.ops.triangulate(brim_bm, faces=brim_bm.faces[:])
brim_bm.to_mesh(brim_mesh)
brim_bm.free()
brim = new_object("visiere", brim_mesh, CAP_RED)
for vertex in brim.data.vertices:
    vertex.co.z = (vertex.co.y + 0.5 * CAP_R) * 0.22   # penche vers l'avant
brim.location = CAP + Vector((0, 0, 0.05 * R))
activate(brim)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
solidify = brim.modifiers.new("solidify", "SOLIDIFY")
solidify.thickness = 0.009
apply_modifiers(brim)
smooth(brim)
follows("head", brim)

# ----- Squelette -----
BONES = [  # nom, départ, arrivée, parent
    ("hips", (0, 0, 0.93), (0, 0, 1.08), None),
    ("spine", (0, 0, 1.08), (0, 0, 1.30), "hips"),
    ("chest", (0, 0, 1.30), (0, 0, 1.42), "spine"),
    ("neck", (0, 0, 1.42), (0, 0, 1.50), "chest"),
    ("head", (0, 0, 1.50), (0, 0, 1.78), "neck"),
]
for side, suffix in ((1, "L"), (-1, "R")):
    BONES += [
        ("upper_arm." + suffix, (side * 0.19, 0, 1.385), (side * 0.25, 0.005, 1.13), "chest"),
        ("forearm." + suffix, (side * 0.25, 0.005, 1.13), (side * 0.275, -0.01, 0.90), "upper_arm." + suffix),
        ("hand." + suffix, (side * 0.275, -0.01, 0.90), (side * 0.285, -0.015, 0.79), "forearm." + suffix),
        ("thigh." + suffix, (side * 0.092, 0, 0.90), (side * 0.10, -0.005, 0.50), "hips"),
        ("shin." + suffix, (side * 0.10, -0.005, 0.50), (side * 0.105, 0.005, 0.11), "thigh." + suffix),
        ("foot." + suffix, (side * 0.105, 0.005, 0.11), (side * 0.105, -0.14, 0.03), "shin." + suffix),
    ]
armature_data = bpy.data.armatures.new("squelette")
armature = bpy.data.objects.new("squelette", armature_data)
scene.collection.objects.link(armature)
activate(armature)
bpy.ops.object.mode_set(mode="EDIT")
for name, start, end, parent in BONES:
    bone = armature_data.edit_bones.new(name)
    bone.head, bone.tail = start, end
    bone.roll = 0
    if parent:
        bone.parent = armature_data.edit_bones[parent]
        bone.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")

# Peau et vêtements : chaque point suit les os les plus proches (calcul automatique de Blender).
soft = [body, shirt, shorts]
bpy.ops.object.select_all(action="DESELECT")
for obj in soft:
    obj.select_set(True)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
for obj in soft:
    assert len(obj.vertex_groups) > 0, f"poids automatiques absents sur {obj.name}"

# Le reste (tête, chaussures…) suit un seul os, d'un bloc.
for bone, objects in parts.items():
    for obj in objects:
        group = obj.vertex_groups.new(name=bone)
        group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
        obj.modifiers.new("squelette", "ARMATURE").object = armature
        obj.parent = armature

meshes = [obj for obj in scene.objects if obj.type == "MESH"]
print("OBJETS", len(meshes), "TRIANGLES", sum(len(p.vertices) - 2 for obj in meshes for p in obj.data.polygons))

# ----- Ombres douces peintes dans le modèle -----
# Blender calcule où la lumière a du mal à passer (sous la visière, entre les
# boucles, sous les bras) et l'enregistre comme une couleur par point. Le site
# l'utilise pour assombrir légèrement ces endroits : du relief sans aucun calcul.
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.device = "CPU"
for obj in meshes:
    attribute = obj.data.color_attributes.new("ombre", "FLOAT_COLOR", "POINT")
    obj.data.color_attributes.active_color = attribute
    obj.data.color_attributes.render_color_index = 0
for obj in meshes:
    activate(obj)
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    for value in obj.data.color_attributes["ombre"].data:
        shade = 0.45 + 0.55 * min(1.0, value.color[0] * 1.25)  # ombre adoucie
        value.color = (shade, shade, shade, 1)

# ----- Images de contrôle -----
if PREVIEW_DIR:
    for mat in bpy.data.materials:  # on montre les ombres peintes dans l'aperçu
        tree = mat.node_tree
        shader = tree.nodes["Principled BSDF"]
        attribute = tree.nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = "ombre"
        mix = tree.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1
        mix.inputs["A"].default_value = shader.inputs["Base Color"].default_value
        tree.links.new(attribute.outputs["Color"], mix.inputs["B"])
        tree.links.new(mix.outputs["Result"], shader.inputs["Base Color"])
        mat["apercu"] = True
    world = bpy.data.worlds.new("monde")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.9, 0.82, 0.75, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    sun = bpy.data.objects.new("soleil", bpy.data.lights.new("soleil", "SUN"))
    sun.data.energy = 2.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    scene.collection.objects.link(sun)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.lens = 70
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 700, 1000
    scene.render.film_transparent = False
    aim = bpy.data.objects.new("cible", None)
    scene.collection.objects.link(aim)
    track = camera.constraints.new("TRACK_TO")
    track.target = aim
    views = {
        "face": ((0.6, -4.6, 1.3), (0, 0, 0.9)),
        "profil": ((4.4, -1.2, 1.2), (0, 0, 0.9)),
        "dos": ((-1.2, 4.5, 1.5), (0, 0, 0.9)),
        "visage": ((0.3, -1.3, 1.72), (0, 0, 1.62)),
    }
    for name, (position, target) in views.items():
        camera.location, aim.location = position, target
        scene.render.filepath = f"{PREVIEW_DIR}/perso-{name}.png"
        bpy.ops.render.render(write_still=True)
    for mat in bpy.data.materials:  # on remet les matériaux simples avant l'export
        tree = mat.node_tree
        shader = tree.nodes["Principled BSDF"]
        for link in list(shader.inputs["Base Color"].links):
            tree.links.remove(link)
    for obj in (sun, camera, aim):
        bpy.data.objects.remove(obj)

# ----- Export -----
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format="GLB",
    export_apply=True,
    export_animations=False,
    export_skins=True,
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=False,
    export_texcoords=False,   # aucune image n'est plaquée sur le modèle : inutile d'alourdir le fichier
    export_yup=True,
)
print("EXPORT", OUTPUT)
