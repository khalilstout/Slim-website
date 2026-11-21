// Boutique de démonstration : catalogue fictif, panier gardé dans le navigateur.
import { beforeEach, describe, expect, it } from 'vitest';
import { createShop, DEMO_CART_KEY, demoCatalog, demoShop } from '../../src/shop';

const [first, second] = demoCatalog[0].products;

beforeEach(() => localStorage.clear());

describe('catalogue', () => {
  it('est choisi quand la page ne vient pas de PrestaShop', () => {
    expect(createShop(document.createElement('div')).demo).toBe(true);
    expect(createShop(null).demo).toBe(true);
  });

  it('a des identifiants de produit uniques et des prix en euros', async () => {
    const products = (await demoShop().getCategories()).flatMap((category) => category.products);
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    for (const product of products) expect(product.price).toMatch(/^\d+,\d{2}\s€$/);
  });
});

describe('panier', () => {
  it('est vide au départ et ne propose pas de paiement', async () => {
    expect(await demoShop().getCart()).toMatchObject({ count: 0, items: [], checkoutUrl: null });
  });

  it('additionne les ajouts', async () => {
    const shop = demoShop();
    await shop.add(first);
    await shop.add(first);
    const cart = await shop.add(second);
    expect(cart.count).toBe(3);
    expect(cart.items.map((item) => [item.name, item.quantity])).toEqual([
      [first.name, 2],
      [second.name, 1],
    ]);
    expect(cart.total.replace(/\s/g, ' ')).toBe('39,00 €'); // 2 × 12 + 15
    expect(cart.items[0].total.replace(/\s/g, ' ')).toBe('24,00 €');
  });

  it('fixe une quantité, puis retire la ligne à zéro', async () => {
    const shop = demoShop();
    const added = await shop.add(first);
    const updated = await shop.setQuantity(added.items[0], 5);
    expect(updated.items[0].quantity).toBe(5);
    const emptied = await shop.setQuantity(updated.items[0], 0);
    expect(emptied).toMatchObject({ count: 0, items: [] });
  });

  it('plafonne la quantité', async () => {
    const shop = demoShop();
    const cart = await shop.setQuantity({ ...first, quantity: 0 }, 5000);
    expect(cart.items[0].quantity).toBe(99);
  });

  it('refuse un produit inconnu', async () => {
    await expect(demoShop().add({ id: 9999, attributeId: 0 })).rejects.toThrow('Produit inconnu');
  });

  it('survit au rechargement de la page', async () => {
    await demoShop().add(second);
    expect((await demoShop().getCart()).items.map((item) => item.name)).toEqual([second.name]);
  });
});

describe('stockage local abîmé ou trafiqué', () => {
  it.each([
    ['du texte illisible', '{pas du json'],
    ['autre chose qu’un objet', '"bonjour"'],
    ['null', 'null'],
  ])('%s : repart d’un panier vide', async (_label, stored) => {
    localStorage.setItem(DEMO_CART_KEY, stored);
    expect((await demoShop().getCart()).count).toBe(0);
  });

  it('ignore les quantités absurdes et les produits inexistants', async () => {
    localStorage.setItem(
      DEMO_CART_KEY,
      JSON.stringify({ [first.id]: -3, [second.id]: '<script>', 9999: 4, __proto__: { polluted: 1 } }),
    );
    expect((await demoShop().getCart()).count).toBe(0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('garde les lignes valides et plafonne les quantités énormes', async () => {
    localStorage.setItem(DEMO_CART_KEY, JSON.stringify({ [first.id]: 2, [second.id]: 1e9, 9999: 1 }));
    const cart = await demoShop().getCart();
    expect(cart.items.map((item) => item.quantity)).toEqual([2, 99]);
  });

  it('fonctionne même si le stockage refuse d’écrire', async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect((await demoShop().add(first)).count).toBe(1);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
