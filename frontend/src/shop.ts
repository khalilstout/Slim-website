// Accès à la boutique. Deux implémentations derrière la même interface `Shop` :
// - PrestaShop quand la page est servie par le module slimroom (attribut data-slimroom présent)
// - données de démo sinon (GitHub Pages, `npm run dev`)

export interface Product {
  id: number;
  /** Déclinaison par défaut (taille, couleur…), 0 pour un produit simple. */
  attributeId: number;
  name: string;
  /** Prix déjà mis en forme (« 12,00 € »). */
  price: string;
  image: string | null;
}

export interface Category {
  slug: string;
  name: string;
  products: Product[];
}

export interface CartItem {
  id: number;
  attributeId: number;
  name: string;
  /** Déclinaison choisie (« Taille : M »), vide pour un produit simple. */
  detail: string;
  quantity: number;
  /** Prix unitaire mis en forme. */
  price: string;
  /** Prix de la ligne (unitaire × quantité) mis en forme. */
  total: string;
  image: string | null;
}

export interface Cart {
  count: number;
  items: CartItem[];
  total: string;
  /** null en mode démo : pas de paiement possible. */
  checkoutUrl: string | null;
}

/** Ce qu'il faut pour désigner une ligne de panier ou un produit. */
export type ProductRef = Pick<Product, 'id' | 'attributeId'>;

export interface Shop {
  readonly demo: boolean;
  getCategories(): Promise<Category[]>;
  getCart(): Promise<Cart>;
  /** Ajoute un exemplaire au panier. */
  add(product: ProductRef): Promise<Cart>;
  /** Fixe la quantité d'une ligne du panier ; 0 la retire. */
  setQuantity(item: ProductRef & { quantity: number }, quantity: number): Promise<Cart>;
}

export interface PrestaConfig {
  apiUrl: string;
  cartUrl: string;
  token: string;
}

/**
 * Configuration écrite par le module PrestaShop dans la page (room.tpl) :
 * <div id="app" data-slimroom='{"apiUrl": …}'>. Absente = mode démo.
 * Une configuration présente mais illisible est une erreur : on ne bascule pas
 * en silence sur les produits fictifs dans la vraie boutique.
 */
export function readPrestaConfig(root: HTMLElement | null): PrestaConfig | null {
  const raw = root?.dataset.slimroom;
  if (raw === undefined) return null;
  const config = JSON.parse(raw) as Partial<PrestaConfig>;
  if (
    typeof config.apiUrl !== 'string' ||
    typeof config.cartUrl !== 'string' ||
    typeof config.token !== 'string'
  ) {
    throw new Error('Configuration slimroom incomplète');
  }
  return { apiUrl: config.apiUrl, cartUrl: config.cartUrl, token: config.token };
}

// ---------- PrestaShop ----------

function withParams(url: string, params: string): string {
  return url + (url.includes('?') ? '&' : '?') + params;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

export function prestaShop(cfg: PrestaConfig): Shop {
  const getCart = async () =>
    json<Cart>(await fetch(withParams(cfg.apiUrl, 'only=cart'), { credentials: 'same-origin' }));

  // Mêmes requêtes que les boutons du thème PrestaShop : le panier, les stocks
  // et les règles de prix restent entièrement gérés par PrestaShop.
  async function change(ref: ProductRef, params: Record<string, string>, failure: string): Promise<Cart> {
    const body = new URLSearchParams({
      token: cfg.token,
      id_product: String(ref.id),
      id_product_attribute: String(ref.attributeId),
      id_customization: '0',
      action: 'update',
      ajax: '1',
      ...params,
    });
    const result = await json<{ success?: boolean; hasError?: boolean; errors?: string[] | string }>(
      await fetch(cfg.cartUrl, {
        method: 'POST',
        body,
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      }),
    );
    if (result.hasError || result.success === false) {
      const errors = result.errors;
      throw new Error((Array.isArray(errors) ? errors.join(' ') : errors) || failure);
    }
    return getCart();
  }

  return {
    demo: false,
    async getCategories() {
      const data = await json<{ categories: Category[] }>(
        await fetch(cfg.apiUrl, { credentials: 'same-origin' }),
      );
      return data.categories;
    },
    getCart,
    add: (product) => change(product, { add: '1', qty: '1' }, "Impossible d'ajouter au panier"),
    setQuantity(item, quantity) {
      const failure = 'Impossible de modifier le panier';
      if (quantity <= 0) return change(item, { delete: '1' }, failure);
      const delta = quantity - item.quantity;
      if (delta === 0) return getCart();
      return change(item, { update: '1', op: delta > 0 ? 'up' : 'down', qty: String(Math.abs(delta)) }, failure);
    },
  };
}

// ---------- Démo ----------

interface DemoProduct extends Product {
  amount: number;
}

const euro = (amount: number) =>
  amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

function demoProduct(id: number, name: string, amount: number): DemoProduct {
  return { id, attributeId: 0, name, amount, price: euro(amount), image: null };
}

/** Catalogue fictif. Les `slug` doivent correspondre aux catégories de config.ts. */
export const demoCatalog: (Category & { products: DemoProduct[] })[] = [
  {
    slug: 'cds',
    name: 'CDs',
    products: [
      demoProduct(1, "J'rentre dedans", 12),
      demoProduct(2, "J'reste dedans + exclu", 15),
      demoProduct(3, 'Vinyle édition limitée', 28),
    ],
  },
  {
    slug: 'vetements',
    name: 'Vêtements',
    products: [
      demoProduct(4, 'T-shirt Slim', 25),
      demoProduct(5, 'Hoodie Slim', 55),
      demoProduct(6, 'Casquette', 20),
    ],
  },
  {
    slug: 'posters',
    name: 'Posters',
    products: [demoProduct(7, 'Poster A2', 18), demoProduct(8, 'Poster A2 dédicacé', 30)],
  },
];

export const DEMO_CART_KEY = 'slimroom-demo-cart';
const DEMO_MAX_QUANTITY = 99;

export function demoShop(): Shop {
  const products = demoCatalog.flatMap((category) => category.products);

  // Le contenu du stockage local peut avoir été modifié à la main : on ne garde
  // que des quantités entières positives de produits connus.
  const read = (): Record<string, number> => {
    let stored: unknown;
    try {
      stored = JSON.parse(localStorage.getItem(DEMO_CART_KEY) || '{}');
    } catch {
      return {};
    }
    const clean: Record<string, number> = {};
    if (!stored || typeof stored !== 'object') return clean;
    for (const product of products) {
      const quantity = (stored as Record<string, unknown>)[product.id];
      if (typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0) {
        clean[product.id] = Math.min(quantity, DEMO_MAX_QUANTITY);
      }
    }
    return clean;
  };
  const write = (quantities: Record<string, number>) => {
    try {
      localStorage.setItem(DEMO_CART_KEY, JSON.stringify(quantities));
    } catch {
      // stockage indisponible (navigation privée) : le panier ne survit pas au rechargement
    }
  };
  let quantities = read();

  const cart = (): Cart => {
    let total = 0;
    let count = 0;
    const items: CartItem[] = [];
    for (const product of products) {
      const quantity = quantities[product.id];
      if (!quantity) continue;
      total += product.amount * quantity;
      count += quantity;
      items.push({
        id: product.id,
        attributeId: 0,
        name: product.name,
        detail: '',
        quantity,
        price: product.price,
        total: euro(product.amount * quantity),
        image: null,
      });
    }
    return { count, items, total: euro(total), checkoutUrl: null };
  };

  const set = (id: number, quantity: number): Cart => {
    if (!products.some((product) => product.id === id)) throw new Error('Produit inconnu');
    const next = { ...quantities };
    if (quantity <= 0) delete next[id];
    else next[id] = Math.min(Math.floor(quantity), DEMO_MAX_QUANTITY);
    quantities = next;
    write(quantities);
    return cart();
  };

  return {
    demo: true,
    async getCategories() {
      return demoCatalog;
    },
    async getCart() {
      return cart();
    },
    async add(product) {
      return set(product.id, (quantities[product.id] || 0) + 1);
    },
    async setQuantity(item, quantity) {
      return set(item.id, quantity);
    },
  };
}

export function createShop(root: HTMLElement | null): Shop {
  const config = readPrestaConfig(root);
  return config ? prestaShop(config) : demoShop();
}
