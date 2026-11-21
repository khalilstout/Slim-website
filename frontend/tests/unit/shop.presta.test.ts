// Mode PrestaShop : on vérifie les requêtes envoyées, sans vraie boutique (fetch est simulé).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShop, prestaShop, readPrestaConfig, type Cart } from '../../src/shop';

const config = { apiUrl: 'https://shop.test/module/slimroom/api', cartUrl: 'https://shop.test/panier', token: 'jeton123' };
const emptyCart: Cart = { count: 0, items: [], total: '0,00 €', checkoutUrl: 'https://shop.test/panier?action=show' };
const line = { id: 20, attributeId: 3, quantity: 2 };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Par défaut : toute requête réussit.
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => reply(init?.method === 'POST' ? { success: true } : emptyCart));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Champs du formulaire envoyé au contrôleur panier lors du premier appel. */
function sentForm(): Record<string, string> {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(config.cartUrl);
  expect(init.method).toBe('POST');
  expect(init.credentials).toBe('same-origin');
  return Object.fromEntries(init.body as URLSearchParams);
}

describe('readPrestaConfig', () => {
  const root = (value?: string) => {
    const el = document.createElement('div');
    if (value !== undefined) el.dataset.slimroom = value;
    return el;
  };

  it('rend null sans attribut : mode démo', () => {
    expect(readPrestaConfig(root())).toBeNull();
    expect(readPrestaConfig(null)).toBeNull();
  });

  it('lit la configuration écrite par le module', () => {
    expect(readPrestaConfig(root(JSON.stringify({ ...config, extra: 1 })))).toEqual(config);
    expect(createShop(root(JSON.stringify(config))).demo).toBe(false);
  });

  it('échoue bruyamment si la configuration est illisible ou incomplète', () => {
    expect(() => readPrestaConfig(root('{oups'))).toThrow();
    expect(() => readPrestaConfig(root(JSON.stringify({ apiUrl: 'x' })))).toThrow('incomplète');
    expect(() => readPrestaConfig(root(JSON.stringify({ ...config, token: 42 })))).toThrow('incomplète');
  });
});

describe('lecture', () => {
  it('charge les catégories depuis l’API', async () => {
    const categories = [{ slug: 'cds', name: 'CDs', products: [] }];
    fetchMock.mockResolvedValueOnce(reply({ categories, cart: emptyCart }));
    expect(await prestaShop(config).getCategories()).toEqual(categories);
    expect(fetchMock).toHaveBeenCalledWith(config.apiUrl, { credentials: 'same-origin' });
  });

  it('demande seulement le panier quand il suffit', async () => {
    expect(await prestaShop(config).getCart()).toEqual(emptyCart);
    expect(fetchMock.mock.calls[0][0]).toBe(`${config.apiUrl}?only=cart`);
  });

  it('respecte une adresse d’API qui contient déjà des paramètres', async () => {
    await prestaShop({ ...config, apiUrl: 'https://shop.test/index.php?fc=module&module=slimroom' }).getCart();
    expect(fetchMock.mock.calls[0][0]).toBe('https://shop.test/index.php?fc=module&module=slimroom&only=cart');
  });

  it('signale une erreur du serveur', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 500));
    await expect(prestaShop(config).getCategories()).rejects.toThrow('HTTP 500');
  });
});

describe('modification du panier', () => {
  it('ajoute un exemplaire, avec le jeton de sécurité', async () => {
    const cart = await prestaShop(config).add({ id: 20, attributeId: 3 });
    expect(sentForm()).toEqual({
      token: 'jeton123',
      id_product: '20',
      id_product_attribute: '3',
      id_customization: '0',
      action: 'update',
      ajax: '1',
      add: '1',
      qty: '1',
    });
    expect(cart).toEqual(emptyCart); // le panier est relu après l'ajout
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('augmente de la différence', async () => {
    await prestaShop(config).setQuantity(line, 5);
    expect(sentForm()).toMatchObject({ update: '1', op: 'up', qty: '3' });
  });

  it('diminue de la différence', async () => {
    await prestaShop(config).setQuantity(line, 1);
    expect(sentForm()).toMatchObject({ update: '1', op: 'down', qty: '1' });
  });

  it('supprime la ligne à zéro', async () => {
    await prestaShop(config).setQuantity(line, 0);
    const form = sentForm();
    expect(form).toMatchObject({ delete: '1', id_product: '20', id_product_attribute: '3' });
    expect(form).not.toHaveProperty('qty');
  });

  it('n’envoie rien si la quantité ne change pas', async () => {
    await prestaShop(config).setQuantity(line, 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('method');
  });

  it.each([
    [{ hasError: true, errors: ['Stock insuffisant.', 'Réessayez.'] }, 'Stock insuffisant. Réessayez.'],
    [{ hasError: true, errors: 'Produit indisponible' }, 'Produit indisponible'],
    [{ success: false }, "Impossible d'ajouter au panier"],
  ])('transmet le refus de la boutique %#', async (body, message) => {
    fetchMock.mockResolvedValueOnce(reply(body));
    await expect(prestaShop(config).add(line)).rejects.toThrow(message);
  });
});
