import './style.css';
import { interactables, roomModel, type Interactable } from './config';
import { loadRoom } from './room';
import { createShop, type Cart, type Category, type Product } from './shop';
import { createRoomView, type RoomView } from './view';

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

const BAG_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';

const shop = createShop();
const shopItems = interactables.filter((i) => i.action.type === 'shop');

// ----- Structure de la page -----
const app = document.getElementById('app')!;
const badge = h('span', { class: 'badge', hidden: true });
const cartButton = h('button', { class: 'cart-button', ariaLabel: 'Panier' });
cartButton.innerHTML = BAG_ICON;
cartButton.append(badge);

const navHome = h('button', {}, 'Accueil');
const navNews = h('button', {}, 'Actus');
const navMerch = h('button', {}, 'Merch');
const viewEl = h('div', { class: 'view' });
const labelsEl = h('div', { class: 'labels' });
const hint = h('p', { class: 'hint', hidden: true }, 'Clique sur les objets de la chambre');
const loader = h('div', { class: 'loader' }, h('span', { class: 'loader-name' }, 'SLIM'), h('span', { class: 'loader-bar' }));
const panel = h('aside', { class: 'panel', hidden: true });
const toast = h('div', { class: 'toast', role: 'status' });

app.append(
  h('header', { class: 'topbar' }, h('nav', {}, navHome, navNews, navMerch), cartButton),
  h('main', { class: 'stage' }, viewEl, labelsEl, hint),
  panel,
  toast,
  loader,
);

// ----- État -----
let view: RoomView | null = null;
let categories: Promise<Category[]> | null = null;
let toastTimer = 0;

function loadCategories(): Promise<Category[]> {
  categories ??= shop.getCategories().catch((error) => {
    categories = null; // permet de réessayer au prochain clic
    throw error;
  });
  return categories;
}

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
}

function updateBadge(cart: Cart) {
  badge.textContent = String(cart.count);
  badge.hidden = cart.count === 0;
}

function openPanel(title: string, body: Child[], footer: Child = null) {
  const close = h('button', { class: 'close', ariaLabel: 'Fermer' }, '×');
  close.addEventListener('click', closePanel);
  panel.replaceChildren(
    h('div', { class: 'panel-head' }, h('h2', {}, title), close),
    h('div', { class: 'panel-body' }, ...body),
  );
  if (footer) panel.append(footer);
  panel.hidden = false;
  app.classList.add('panel-open');
  hint.hidden = true;
}

function closePanel() {
  panel.hidden = true;
  app.classList.remove('panel-open');
  view?.focus(null);
}

// ----- Contenus du panneau -----
function productRow(product: Product): HTMLElement {
  const add = h('button', { class: 'add', ariaLabel: `Ajouter ${product.name} au panier` }, '+');
  add.addEventListener('click', async () => {
    add.disabled = true;
    try {
      updateBadge(await shop.add(product));
      showToast(`« ${product.name} » ajouté au panier`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Impossible d'ajouter au panier");
    } finally {
      add.disabled = false;
    }
  });
  return h(
    'li',
    { class: 'product' },
    add,
    product.image ? h('img', { src: product.image, alt: '', loading: 'lazy' }) : null,
    h('span', { class: 'name' }, product.name),
    h('span', { class: 'price' }, product.price),
  );
}

async function showShop(item: Interactable, slug: string) {
  // Flèches : catégorie précédente / suivante, dans l'ordre de config.ts.
  const index = shopItems.indexOf(item);
  const previous = shopItems[(index - 1 + shopItems.length) % shopItems.length];
  const next = shopItems[(index + 1) % shopItems.length];
  const arrow = (target: Interactable, text: string) => {
    const button = h('button', {}, text);
    button.addEventListener('click', () => select(target.id));
    return button;
  };
  const footer =
    shopItems.length > 1
      ? h('div', { class: 'panel-nav' }, arrow(previous, `◁ ${previous.label ?? ''}`), arrow(next, `${next.label ?? ''} ▷`))
      : null;

  const title = item.label ?? slug;
  openPanel(title, [h('p', { class: 'muted' }, 'Chargement…')], footer);
  const isCurrent = () => !panel.hidden && panel.querySelector('h2')?.textContent === title;
  try {
    const category = (await loadCategories()).find((c) => c.slug === slug);
    if (!isCurrent()) return;
    const body = category?.products.length
      ? [h('ul', { class: 'products' }, ...category.products.map(productRow))]
      : [h('p', { class: 'muted' }, 'Rien à vendre ici pour le moment.')];
    openPanel(category?.name ?? title, body, footer);
  } catch {
    if (isCurrent()) openPanel(title, [h('p', { class: 'muted' }, 'La boutique ne répond pas. Réessaie dans un instant.')], footer);
  }
}

function paragraphs(text: string): HTMLElement[] {
  return text.split('\n\n').map((part) => h('p', {}, part));
}

function select(id: string) {
  const item = interactables.find((i) => i.id === id);
  if (!item) return;
  view?.focus(id);
  const action = item.action;
  if (action.type === 'shop') {
    void showShop(item, action.category);
  } else if (action.type === 'text') {
    openPanel(action.title, paragraphs(action.body));
  } else {
    const frame = h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(action.youtubeId)}`,
      title: action.title,
      allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture',
      allowFullscreen: true,
    });
    openPanel(action.title, [h('div', { class: 'video' }, frame), ...(action.body ? paragraphs(action.body) : [])]);
  }
}

async function showCart() {
  view?.focus(null);
  openPanel('Panier', [h('p', { class: 'muted' }, 'Chargement…')]);
  try {
    const cart = await shop.getCart();
    updateBadge(cart);
    if (!cart.items.length) {
      openPanel('Panier', [h('p', { class: 'muted' }, 'Ton panier est vide.')]);
      return;
    }
    const rows = cart.items.map((item) =>
      h(
        'li',
        { class: 'product' },
        h('span', { class: 'quantity' }, `${item.quantity} ×`),
        h('span', { class: 'name' }, item.name),
        h('span', { class: 'price' }, item.total),
      ),
    );
    const checkout = cart.checkoutUrl
      ? h('a', { class: 'checkout', href: cart.checkoutUrl }, 'Commander')
      : h('p', { class: 'muted' }, 'Version de démonstration : le paiement se fait sur la vraie boutique.');
    openPanel('Panier', [
      h('ul', { class: 'products' }, ...rows),
      h('p', { class: 'total' }, h('span', {}, 'Total'), h('span', {}, cart.total)),
      checkout,
    ]);
  } catch {
    openPanel('Panier', [h('p', { class: 'muted' }, 'Le panier ne répond pas. Réessaie dans un instant.')]);
  }
}

// ----- Événements -----
navHome.addEventListener('click', closePanel);
navNews.addEventListener('click', () => select('computer'));
navMerch.addEventListener('click', () => shopItems[0] && select(shopItems[0].id));
cartButton.addEventListener('click', () => void showCart());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !panel.hidden) closePanel();
});

// ----- Démarrage -----
shop.getCart().then(updateBadge, () => undefined);
loadRoom(roomModel).then(
  (room) => {
    view = createRoomView(viewEl, labelsEl, room, interactables, select);
    loader.classList.add('done');
    // L'indication n'apparaît qu'une fois l'animation d'arrivée terminée.
    void view.ready.then(() => (hint.hidden = !panel.hidden));
    // Lien direct vers un objet : https://…/#cd-stack ouvre le panneau des CDs.
    const linked = decodeURIComponent(location.hash.slice(1));
    if (linked === 'panier') void showCart();
    else if (linked) select(linked);
  },
  (error) => {
    console.error(error);
    hint.textContent = "La chambre n'a pas pu être chargée.";
    hint.hidden = false;
    loader.classList.add('done');
  },
);
