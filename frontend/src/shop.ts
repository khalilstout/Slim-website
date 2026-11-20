// Accès à la boutique. Deux implémentations :
// - PrestaShop quand la page est servie par le module slimroom (window.SLIMROOM existe)
// - données de démo sinon (GitHub Pages, `npm run dev`)

export interface Product {
  id: number;
  attributeId: number;
  name: string;
  price: string;
  image: string | null;
}

export interface Category {
  slug: string;
  name: string;
  products: Product[];
}

export interface CartItem {
  name: string;
  quantity: number;
  total: string;
}

export interface Cart {
  count: number;
  items: CartItem[];
  total: string;
  /** null en mode démo : pas de paiement possible. */
  checkoutUrl: string | null;
}

export interface Shop {
  readonly demo: boolean;
  getCategories(): Promise<Category[]>;
  getCart(): Promise<Cart>;
  add(product: Product): Promise<Cart>;
}

interface PrestaConfig {
  apiUrl: string;
  cartUrl: string;
  token: string;
}

declare global {
  interface Window {
    SLIMROOM?: PrestaConfig;
  }
}

// ---------- PrestaShop ----------

function withParams(url: string, params: string): string {
  return url + (url.includes('?') ? '&' : '?') + params;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

function prestaShop(cfg: PrestaConfig): Shop {
  const getCart = async () =>
    json<Cart>(await fetch(withParams(cfg.apiUrl, 'only=cart'), { credentials: 'same-origin' }));

  return {
    demo: false,
    async getCategories() {
      const data = await json<{ categories: Category[] }>(
        await fetch(cfg.apiUrl, { credentials: 'same-origin' }),
      );
      return data.categories;
    },
    getCart,
    async add(product) {
      // Même requête que le bouton « Ajouter au panier » du thème PrestaShop.
      const body = new URLSearchParams({
        token: cfg.token,
        id_product: String(product.id),
        id_product_attribute: String(product.attributeId),
        id_customization: '0',
        qty: '1',
        add: '1',
        action: 'update',
        ajax: '1',
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
        throw new Error((Array.isArray(errors) ? errors.join(' ') : errors) || "Impossible d'ajouter au panier");
      }
      return getCart();
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

const demoCatalog: (Category & { products: DemoProduct[] })[] = [
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

const DEMO_CART_KEY = 'slimroom-demo-cart';

function demoShop(): Shop {
  const read = (): Record<string, number> => {
    try {
      return JSON.parse(localStorage.getItem(DEMO_CART_KEY) || '{}');
    } catch {
      return {};
    }
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
    const all = demoCatalog.flatMap((c) => c.products);
    let total = 0;
    let count = 0;
    const items: CartItem[] = [];
    for (const [id, quantity] of Object.entries(quantities)) {
      const product = all.find((p) => p.id === Number(id));
      if (!product) continue;
      total += product.amount * quantity;
      count += quantity;
      items.push({ name: product.name, quantity, total: euro(product.amount * quantity) });
    }
    return { count, items, total: euro(total), checkoutUrl: null };
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
      quantities = { ...quantities, [product.id]: (quantities[product.id] || 0) + 1 };
      write(quantities);
      return cart();
    },
  };
}

export function createShop(): Shop {
  return window.SLIMROOM ? prestaShop(window.SLIMROOM) : demoShop();
}
