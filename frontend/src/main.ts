// L'interface autour de la chambre : barre du haut, panneau (rayon, texte,
// vidéo, panier), notification d'ajout, écran de chargement.
// Direction artistique : une appli de streaming — un rayon se lit comme une
// playlist, chaque article est une petite carte, le panier est la sélection.

import './style.css';
import { loadCharacterModel } from './character';
import { character as characterSettings, interactables, type Interactable } from './config';
import { loadRoom } from './room';
import { createShop, type Cart, type CartItem, type Category, type Product } from './shop';
import { createRoomView, type RoomView, type ViewMode } from './view';

type Child = Node | string | null | false;

/** Petit utilitaire pour créer du DOM sans innerHTML (les noms de produits viennent de la boutique). */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: className, ...rest } = props;
  if (className) el.className = className;
  Object.assign(el, rest);
  for (const child of children) if (child) el.append(child);
  return el;
}

// Icônes : tracés SVG écrits ici, jamais de contenu venu de l'extérieur.
const ICON_PATHS = {
  bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  previous: '<path d="M7 5v14"/><path d="M19 5l-9 7 9 7V5z"/>',
  next: '<path d="M17 5v14"/><path d="M5 5l9 7-9 7V5z"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  shirt: '<path d="M8 4l4 2 4-2 5 4-3 3-2-1v10H8V10l-2 1-3-3 5-4z"/>',
  frame: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 16l3-4 2 2.5 1.5-2L17 16"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>',
} as const;
type IconName = keyof typeof ICON_PATHS;

function icon(name: IconName, size = 20): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

/** Icône de pochette par rayon (slug de la catégorie). Rayon inconnu : une note de musique. */
const CATEGORY_ICONS: Record<string, IconName> = { cds: 'disc', vetements: 'shirt', posters: 'frame' };

/**
 * Pochette d'un article : sa photo si la boutique en fournit une, sinon un
 * dégradé dont la couleur dépend de l'article (toujours la même pour un article donné).
 */
function cover(item: { id: number; image: string | null }, iconName: IconName, className = ''): HTMLElement {
  const el = h('span', { class: `cover ${className}` });
  if (item.image) {
    el.append(h('img', { src: item.image, alt: '', loading: 'lazy' }));
  } else {
    el.style.setProperty('--hue', String((item.id * 47 + 18) % 360));
    el.append(icon(iconName, 22));
  }
  return el;
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

const shopItems = interactables.filter((i) => i.action.type === 'shop');

// ----- Structure de la page -----
const app = document.getElementById('app')!;
const shop = createShop(app);

const brand = h(
  'button',
  { class: 'brand', ariaLabel: 'Slim — retour à la chambre' },
  h('span', { class: 'bars', ariaHidden: 'true' }, h('i'), h('i'), h('i'), h('i')),
  h('span', { class: 'brand-name' }, 'SLIM'),
);
const navHome = h('button', {}, 'Accueil');
const navNews = h('button', {}, 'Actus');
const navMerch = h('button', {}, 'Merch');
const badge = h('span', { class: 'badge', hidden: true });
const cartButton = h(
  'button',
  { class: 'cart-button', ariaLabel: 'Panier' },
  icon('bag', 22),
  h('span', { class: 'cart-text' }, 'Panier'),
  badge,
);

const viewEl = h('div', { class: 'view' });
const labelsEl = h('div', { class: 'labels' });
// Deux pages pour deux façons de voir la chambre : l'accueil (vue d'ensemble) et
// dedans.html (vue intérieure). La page l'indique par l'attribut data-view de
// #app ; en développement et dans PrestaShop, ?vue=dedans fait la même chose.
const mode: ViewMode =
  app.dataset.view === 'inside' || new URLSearchParams(location.search).get('vue') === 'dedans' ? 'inside' : 'outside';
/** Adresse de l'autre version. La démo compilée a deux fichiers ; ailleurs, c'est un paramètre d'adresse. */
function otherViewUrl(): string {
  const staticDemo = shop.demo && !import.meta.env.DEV;
  if (mode === 'inside') return staticDemo ? './' : location.pathname;
  // « #entrer » : venant de la vue d'ensemble, on entre directement, sans repasser par l'écran d'entrée.
  return (staticDemo ? 'dedans.html' : `${location.pathname}?vue=dedans`) + '#entrer';
}
if (mode === 'inside') app.classList.add('view-inside');
const viewSwitch = h(
  'a',
  { class: 'view-switch', href: otherViewUrl() },
  mode === 'inside' ? 'Vue d’ensemble' : 'Entrer dans la chambre',
);
// Écran d'entrée de la vue intérieure : la chambre attend dehors, un bouton (ou un
// défilement vers le bas) fait entrer.
const enterButton = h('button', { class: 'pill primary' }, 'Entrer dans la chambre');
const gate = h(
  'div',
  { class: 'gate', hidden: mode !== 'inside' },
  h('p', { class: 'gate-title' }, 'SLIM'),
  enterButton,
  h('p', { class: 'gate-scroll' }, 'ou fais défiler', h('span', { ariaHidden: 'true' }, '↓')),
);
const hint = h(
  'p',
  { class: 'hint', hidden: true },
  mode === 'inside' ? 'Clique sur un objet · glisse pour regarder autour' : 'Clique sur les objets de la chambre',
);
const loader = h(
  'div',
  { class: 'loader' },
  h('span', { class: 'loader-name' }, 'SLIM'),
  h('span', { class: 'bars big', ariaHidden: 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
);
const panel = h('aside', { class: 'panel', hidden: true, tabIndex: -1 });
const toast = h('div', { class: 'toast', role: 'status' });

app.append(
  h('header', { class: 'topbar' }, brand, h('nav', { ariaLabel: 'Navigation' }, navHome, navNews, navMerch), cartButton),
  h('main', { class: 'stage' }, viewEl, labelsEl, hint, viewSwitch, gate),
  panel,
  toast,
  loader,
);

// ----- État -----
type Section = 'home' | 'news' | 'merch' | 'cart';
let view: RoomView | null = null;
let categories: Promise<Category[]> | null = null;
let toastTimer = 0;
/** Change à chaque ouverture de panneau : une réponse arrivée trop tard est ignorée. */
let panelVersion = 0;

function setSection(section: Section) {
  const current: [HTMLElement, Section][] = [
    [navHome, 'home'],
    [navNews, 'news'],
    [navMerch, 'merch'],
    [cartButton, 'cart'],
  ];
  for (const [button, name] of current) {
    if (name === section) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function loadCategories(): Promise<Category[]> {
  categories ??= shop.getCategories().catch((error) => {
    categories = null; // permet de réessayer au prochain clic
    throw error;
  });
  return categories;
}

/** Notification en bas de l'écran. Avec `item`, elle prend la forme d'une petite carte « ajouté ». */
function showToast(message: string, item?: { cover: HTMLElement; title: string }) {
  toast.replaceChildren();
  if (item) {
    const open = h('button', { class: 'toast-action' }, 'Voir');
    open.addEventListener('click', () => void showCart());
    toast.append(
      item.cover,
      h('span', { class: 'toast-text' }, h('small', {}, message), h('strong', {}, item.title)),
      open,
    );
  } else {
    toast.append(h('span', { class: 'toast-text' }, message));
  }
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), item ? 3600 : 2600);
}

function updateBadge(cart: Cart) {
  badge.textContent = String(cart.count);
  badge.hidden = cart.count === 0;
  cartButton.setAttribute('aria-label', cart.count ? `Panier, ${plural(cart.count, 'article')}` : 'Panier');
}

interface PanelContent {
  /** Petite ligne au-dessus du titre (« Playlist merch », « Easter egg »…). */
  overline: string;
  title: string;
  /** Ligne sous le titre (« 3 articles »). */
  meta?: string;
  /** Grande pochette à gauche du titre. */
  art?: HTMLElement;
  body: Child[];
  footer?: Child;
}

function openPanel(content: PanelContent): number {
  const close = h('button', { class: 'close', ariaLabel: 'Fermer' }, icon('close'));
  close.addEventListener('click', closePanel);
  panel.replaceChildren(
    h(
      'div',
      { class: 'panel-head' },
      content.art ?? null,
      h(
        'div',
        { class: 'panel-title' },
        h('p', { class: 'overline' }, content.overline),
        h('h2', {}, content.title),
        content.meta ? h('p', { class: 'meta' }, content.meta) : null,
      ),
      close,
    ),
    h('div', { class: 'panel-body' }, ...content.body),
  );
  if (content.footer) panel.append(content.footer);
  panel.setAttribute('aria-label', content.title);
  panel.hidden = false;
  app.classList.add('panel-open');
  hint.hidden = true;
  syncInset();
  return ++panelVersion;
}

function closePanel() {
  panelVersion++;
  panel.hidden = true;
  app.classList.remove('panel-open');
  syncInset();
  view?.focus(null);
  setSection('home');
}

/** Indique à la vue 3D la place que prend le panneau, pour qu'elle recentre la chambre à côté. */
function syncInset() {
  if (panel.hidden) return view?.setInset(0, 0);
  const box = panel.getBoundingClientRect();
  // Sur téléphone le panneau occupe toute la largeur, en bas ; sur ordinateur, une colonne à droite.
  if (box.width >= window.innerWidth - 1) view?.setInset(0, window.innerHeight - box.top);
  else view?.setInset(window.innerWidth - box.left, 0);
}

const message = (text: string) => h('p', { class: 'muted' }, text);

// ----- Rayon : une playlist d'articles -----
function productRow(product: Product, index: number, category: Category): HTMLElement {
  const iconName = CATEGORY_ICONS[category.slug] ?? 'note';
  const add = h('button', { class: 'round add', ariaLabel: `Ajouter ${product.name} au panier` }, icon('plus'));
  add.addEventListener('click', async () => {
    add.disabled = true;
    try {
      updateBadge(await shop.add(product));
      showToast('Ajouté au panier', { cover: cover(product, iconName, 'small'), title: product.name });
      add.replaceChildren(icon('check'));
      add.classList.add('done');
      window.setTimeout(() => {
        add.replaceChildren(icon('plus'));
        add.classList.remove('done');
      }, 1400);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Impossible d'ajouter au panier");
    } finally {
      add.disabled = false;
    }
  });
  return h(
    'li',
    { class: 'track' },
    h('span', { class: 'track-index', ariaHidden: 'true' }, String(index + 1).padStart(2, '0')),
    cover(product, iconName),
    h('span', { class: 'track-text' }, h('strong', {}, product.name), h('small', {}, category.name)),
    h('span', { class: 'price' }, product.price),
    add,
  );
}

function shopFooter(item: Interactable): HTMLElement | null {
  if (shopItems.length < 2) return null;
  // Rayon précédent / suivant, dans l'ordre de config.ts.
  const index = shopItems.indexOf(item);
  const previous = shopItems[(index - 1 + shopItems.length) % shopItems.length];
  const next = shopItems[(index + 1) % shopItems.length];
  const skip = (target: Interactable, iconName: IconName, before: boolean) => {
    const label = h('span', {}, target.label ?? '');
    const button = h('button', { ariaLabel: `Rayon ${before ? 'précédent' : 'suivant'} : ${target.label ?? ''}` });
    button.append(...(before ? [icon(iconName, 18), label] : [label, icon(iconName, 18)]));
    button.addEventListener('click', () => select(target.id));
    return button;
  };
  const dots = h(
    'span',
    { class: 'dots', ariaHidden: 'true' },
    ...shopItems.map((entry) => h('i', { class: entry === item ? 'on' : '' })),
  );
  return h('div', { class: 'panel-nav' }, skip(previous, 'previous', true), dots, skip(next, 'next', false));
}

async function showShop(item: Interactable, slug: string) {
  const footer = shopFooter(item);
  const iconName = CATEGORY_ICONS[slug] ?? 'note';
  const head = (title: string, meta?: string) => ({
    overline: 'Playlist merch',
    title,
    meta,
    art: cover({ id: shopItems.indexOf(item) + 3, image: null }, iconName, 'large'),
    footer,
  });
  const title = item.label ?? slug;
  const version = openPanel({ ...head(title), body: [message('Chargement…')] });
  try {
    const category = (await loadCategories()).find((c) => c.slug === slug);
    if (version !== panelVersion) return;
    const count = category?.products.length ?? 0;
    openPanel({
      ...head(category?.name ?? title, count ? plural(count, 'article') : undefined),
      body:
        category && count
          ? [h('ol', { class: 'tracks' }, ...category.products.map((p, i) => productRow(p, i, category)))]
          : [message('Rien à vendre ici pour le moment.')],
    });
  } catch {
    if (version === panelVersion) {
      openPanel({ ...head(title), body: [message('La boutique ne répond pas. Réessaie dans un instant.')] });
    }
  }
}

function paragraphs(text: string): HTMLElement[] {
  return text.split('\n\n').map((part) => h('p', {}, part));
}

/** Vue intérieure : quitte l'écran d'entrée et fait plonger la caméra dans la pièce. */
function enterRoom() {
  if (gate.hidden) return;
  gate.hidden = true;
  view?.enter();
}

function select(id: string) {
  const item = interactables.find((i) => i.id === id);
  if (!item) return;
  enterRoom(); // ouvrir un objet depuis le menu fait aussi entrer
  view?.focus(id);
  const action = item.action;
  // Un objet avec bulle est une rubrique ; sans bulle, c'est un secret à trouver.
  const overline = item.label ? 'À la une' : 'Easter egg';
  const art = h('span', { class: 'cover large plain' }, icon(item.label ? 'note' : 'spark', 22));
  if (action.type === 'shop') {
    setSection('merch');
    void showShop(item, action.category);
  } else if (action.type === 'text') {
    setSection(id === 'computer' ? 'news' : 'home');
    openPanel({ overline, title: action.title, art, body: paragraphs(action.body) });
  } else {
    setSection('home');
    const frame = h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(action.youtubeId)}`,
      title: action.title,
      allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture',
      allowFullscreen: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    openPanel({
      overline,
      title: action.title,
      art,
      body: [h('div', { class: 'video' }, frame), ...(action.body ? paragraphs(action.body) : [])],
    });
  }
}

// ----- Panier -----
function cartRow(item: CartItem, onChange: (quantity: number) => void): HTMLElement {
  const step = (iconName: IconName, label: string, quantity: number) => {
    const button = h('button', { class: 'round', ariaLabel: `${label} : ${item.name}` }, icon(iconName, 16));
    button.addEventListener('click', () => onChange(quantity));
    return button;
  };
  return h(
    'li',
    { class: 'track' },
    cover(item, 'bag'),
    h(
      'span',
      { class: 'track-text' },
      h('strong', {}, item.name),
      h('small', {}, [item.detail, item.price].filter(Boolean).join(' · ')),
    ),
    h(
      'span',
      { class: 'stepper' },
      step('minus', item.quantity > 1 ? 'Retirer un exemplaire' : 'Retirer du panier', item.quantity - 1),
      h('span', { class: 'quantity', ariaLabel: `Quantité : ${item.quantity}` }, String(item.quantity)),
      step('plus', 'Ajouter un exemplaire', item.quantity + 1),
    ),
    h('span', { class: 'price' }, item.total),
  );
}

function renderCart(cart: Cart) {
  updateBadge(cart);
  const head = { overline: 'Ta sélection', title: 'Panier', art: h('span', { class: 'cover large plain' }, icon('bag', 22)) };
  if (!cart.items.length) {
    const browse = h('button', { class: 'pill' }, 'Voir le merch');
    browse.addEventListener('click', () => shopItems[0] && select(shopItems[0].id));
    openPanel({ ...head, body: [message('Ton panier est vide.'), shopItems.length ? browse : null] });
    return;
  }
  const list = h('ul', { class: 'tracks' });
  const change = async (item: CartItem, quantity: number) => {
    list.classList.add('busy');
    list.querySelectorAll('button').forEach((button) => (button.disabled = true));
    try {
      const next = await shop.setQuantity(item, quantity);
      if (!panel.hidden && panel.contains(list)) renderCart(next);
      else updateBadge(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Impossible de modifier le panier');
      list.classList.remove('busy');
      list.querySelectorAll('button').forEach((button) => (button.disabled = false));
    }
  };
  list.append(...cart.items.map((item) => cartRow(item, (quantity) => void change(item, quantity))));
  const checkout = cart.checkoutUrl
    ? h('a', { class: 'pill primary', href: cart.checkoutUrl }, 'Commander')
    : h('p', { class: 'muted small' }, 'Version de démonstration : le paiement se fait sur la vraie boutique.');
  openPanel({
    ...head,
    meta: `${plural(cart.count, 'article')} · ${cart.total}`,
    body: [list],
    footer: h(
      'div',
      { class: 'panel-total' },
      h('p', { class: 'total' }, h('span', {}, 'Total'), h('strong', {}, cart.total)),
      checkout,
    ),
  });
}

async function showCart() {
  enterRoom();
  view?.focus(null);
  setSection('cart');
  toast.classList.remove('visible');
  const version = openPanel({ overline: 'Ta sélection', title: 'Panier', body: [message('Chargement…')] });
  try {
    const cart = await shop.getCart();
    if (version === panelVersion) renderCart(cart);
  } catch {
    if (version === panelVersion) {
      openPanel({ overline: 'Ta sélection', title: 'Panier', body: [message('Le panier ne répond pas. Réessaie dans un instant.')] });
    }
  }
}

// ----- Événements -----
brand.addEventListener('click', closePanel);
navHome.addEventListener('click', closePanel);
navNews.addEventListener('click', () => select('computer'));
navMerch.addEventListener('click', () => shopItems[0] && select(shopItems[0].id));
cartButton.addEventListener('click', () => void showCart());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !panel.hidden) closePanel();
});

// Entrer : le bouton, la molette ou le pavé tactile vers le bas, un glissement du doigt vers le haut, ou Entrée.
enterButton.addEventListener('click', enterRoom);
window.addEventListener('wheel', (event) => event.deltaY > 8 && enterRoom(), { passive: true });
let touchStartY: number | null = null;
gate.addEventListener('touchstart', (event) => (touchStartY = event.touches[0].clientY), { passive: true });
gate.addEventListener(
  'touchmove',
  (event) => touchStartY !== null && touchStartY - event.touches[0].clientY > 40 && enterRoom(),
  { passive: true },
);
window.addEventListener('hashchange', () => openLinked());
window.addEventListener('resize', syncInset);

// ----- Démarrage -----
setSection('home');
shop.getCart().then(updateBadge, () => undefined);

/** Lien direct : https://…/#cd-stack ouvre le panneau des CDs, #panier ouvre le panier. */
function openLinked() {
  let linked: string;
  try {
    linked = decodeURIComponent(location.hash.slice(1));
  } catch {
    return; // adresse mal formée : on reste sur la chambre
  }
  if (linked === 'entrer') enterRoom();
  else if (linked === 'panier') void showCart();
  else if (linked) select(linked);
}

// Le bonhomme est un plus : s'il ne se charge pas, la chambre s'affiche sans lui.
const characterModel = characterSettings.enabled
  ? loadCharacterModel().catch((error) => {
      console.warn('[character] modèle non chargé', error);
      return null;
    })
  : Promise.resolve(null);

Promise.all([loadRoom(), characterModel])
  .then(([room, bonhomme]) => {
    view = createRoomView(viewEl, labelsEl, room, interactables, select, mode, bonhomme);
    syncInset();
    if (gate.hidden) view.enter(); // « entrer » a été demandé avant la fin du chargement
    // L'indication n'apparaît qu'une fois l'animation d'arrivée terminée.
    void view.ready.then(() => (hint.hidden = !panel.hidden));
  })
  .catch((error) => {
    // Pas de 3D (WebGL indisponible, fichier manquant) : le menu reste utilisable.
    console.error(error);
    app.classList.add('no-3d');
    hint.textContent = "La chambre en 3D n'a pas pu s'afficher : passe par le menu.";
    hint.hidden = false;
  })
  .finally(() => {
    loader.classList.add('done');
    openLinked();
  });
