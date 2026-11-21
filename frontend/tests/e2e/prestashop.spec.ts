// Mode PrestaShop, sans PrestaShop : on sert la même page avec la configuration
// qu'écrirait le module, et une fausse API. Vérifie surtout que rien de ce que
// renvoie la boutique ne peut s'exécuter dans la page (injection de code).
import { expect, test, type Page, type Route } from '@playwright/test';

const HOSTILE_NAME = '<img src=x onerror="window.__pwned=1">Vinyle';
const product = { id: 20, attributeId: 0, name: HOSTILE_NAME, price: '12,00 €', image: 'x" onerror="window.__pwned=1' };
const categories = [{ slug: 'cds', name: '<script>window.__pwned=1</script>CDs', products: [product] }];

interface Fake {
  quantity: number;
  posts: Record<string, string>[];
}

async function mockShop(page: Page, options: { failAdd?: boolean } = {}): Promise<Fake> {
  const fake: Fake = { quantity: 0, posts: [] };
  const cart = () => ({
    count: fake.quantity,
    items: fake.quantity
      ? [{ ...product, detail: '<b>Taille : M</b>', quantity: fake.quantity, total: `${12 * fake.quantity},00 €` }]
      : [],
    total: `${12 * fake.quantity},00 €`,
    checkoutUrl: '/commande',
  });
  const json = (route: Route, body: unknown) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

  // La page d'accueil reçoit l'attribut de configuration, comme dans room.tpl.
  await page.route(/\/(index\.html)?(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const config = JSON.stringify({ apiUrl: '/fake-api', cartUrl: '/fake-cart', token: 'jeton-de-test' });
    const html = (await response.text()).replace(
      '<div id="app">',
      `<div id="app" data-slimroom="${config.replace(/"/g, '&quot;')}">`,
    );
    await route.fulfill({ response, body: html });
  });
  await page.route('**/fake-api*', (route) =>
    json(route, route.request().url().includes('only=cart') ? cart() : { categories, cart: cart() }),
  );
  await page.route('**/fake-cart', (route) => {
    const form = Object.fromEntries(new URLSearchParams(route.request().postData() ?? ''));
    fake.posts.push(form);
    if (options.failAdd) return json(route, { hasError: true, errors: ['Stock insuffisant.'] });
    if (form.delete) fake.quantity = 0;
    else fake.quantity += (form.op === 'down' ? -1 : 1) * Number(form.qty);
    return json(route, { success: true });
  });
  return fake;
}

async function open(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(page.locator('.loader')).toHaveClass(/done/, { timeout: 30_000 });
}

test('les textes de la boutique s’affichent tels quels, sans s’exécuter', async ({ page }) => {
  const fake = await mockShop(page);
  await open(page, './#cd-stack');
  const panel = page.locator('.panel');

  // Nom de produit et de catégorie hostiles : affichés comme du texte.
  await expect(panel.locator('.track strong')).toHaveText(HOSTILE_NAME);
  await expect(panel.locator('h2')).toContainText('<script>');
  await expect(panel.locator('.track img[onerror]')).toHaveCount(0);
  await expect(panel.locator('script')).toHaveCount(0);

  await panel.locator('.add').click();
  await expect(page.locator('.badge')).toHaveText('1');
  await expect(page.locator('.toast strong')).toHaveText(HOSTILE_NAME);
  expect(fake.posts[0]).toMatchObject({ token: 'jeton-de-test', id_product: '20', add: '1', qty: '1' });

  await page.getByRole('button', { name: /^Panier/ }).click();
  await expect(panel.locator('.track small')).toContainText('<b>Taille : M</b>');
  await expect(panel.locator('.track b')).toHaveCount(0);
  await expect(panel.getByRole('link', { name: 'Commander' })).toHaveAttribute('href', '/commande');

  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('les quantités passent par le panier natif', async ({ page }) => {
  const fake = await mockShop(page);
  fake.quantity = 2;
  await open(page, './#panier');
  const panel = page.locator('.panel');
  await expect(panel.locator('.quantity')).toHaveText('2');

  await panel.getByRole('button', { name: /Ajouter un exemplaire/ }).click();
  await expect(panel.locator('.quantity')).toHaveText('3');
  await panel.getByRole('button', { name: /Retirer un exemplaire/ }).click();
  await expect(panel.locator('.quantity')).toHaveText('2');
  expect(fake.posts.map((form) => [form.update, form.op, form.qty])).toEqual([
    ['1', 'up', '1'],
    ['1', 'down', '1'],
  ]);
});

test('un refus de la boutique est affiché, le panier ne bouge pas', async ({ page }) => {
  await mockShop(page, { failAdd: true });
  await open(page, './#cd-stack');
  await page.locator('.panel .add').click();
  await expect(page.locator('.toast')).toContainText('Stock insuffisant.');
  await expect(page.locator('.badge')).toBeHidden();
  await expect(page.locator('.panel .add')).toBeEnabled();
});

test('une boutique en panne affiche un message, pas une page cassée', async ({ page }) => {
  await mockShop(page);
  await page.route('**/fake-api*', (route) => route.fulfill({ status: 500, body: 'erreur' }));
  await open(page, './#cd-stack');
  await expect(page.locator('.panel')).toContainText('La boutique ne répond pas');
  await page.getByRole('button', { name: /^Panier/ }).click();
  await expect(page.locator('.panel')).toContainText('Le panier ne répond pas');
});
