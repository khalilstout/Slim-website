// Parcours de bout en bout, sur le site compilé en mode démonstration.
// Chaque test tourne sur tous les navigateurs de playwright.config.ts.
import { expect, test, type Page } from '@playwright/test';

/** Ouvre la page et attend la fin du chargement. Rend la liste des erreurs vues par le navigateur. */
async function open(page: Page, path = './'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // Sans animation d'arrivée : les tests n'attendent pas trois secondes à chaque page.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(page.locator('.loader')).toHaveClass(/done/, { timeout: 30_000 });
  return errors;
}

/**
 * Le navigateur sait-il faire de la 3D ? Sur une machine sans carte graphique,
 * Firefox peut refuser : le site doit alors rester utilisable par le menu, et
 * c'est ce mode de secours qu'on vérifie. Chrome et Safari, eux, doivent toujours l'afficher.
 */
async function expect3D(page: Page, browserName: string): Promise<boolean> {
  const supported = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (supported) {
    await expect(page.locator('#app')).not.toHaveClass(/no-3d/);
    await expect(page.locator('.view canvas')).toBeVisible();
  } else {
    expect(browserName, 'seul Firefox a le droit de ne pas avoir de 3D ici').toBe('firefox');
    await expect(page.locator('#app')).toHaveClass(/no-3d/);
    await expect(page.locator('.hint')).toContainText('passe par le menu');
  }
  return supported;
}

const panel = (page: Page) => page.locator('.panel');
const badge = (page: Page) => page.locator('.badge');

test.describe('chambre 3D', () => {
  test('s’affiche sans erreur, avec ses bulles', async ({ page, browserName }) => {
    const errors = await open(page);
    if (!(await expect3D(page, browserName))) return;
    for (const name of ['CDs', 'Vêtements', 'Posters', 'Actus']) {
      await expect(page.locator('.label', { hasText: name })).toBeVisible();
    }
    await expect(page.locator('.hint')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('dessine vraiment quelque chose', async ({ page, browserName }) => {
    await open(page);
    if (!(await expect3D(page, browserName))) return;
    // Le centre de l'image ne doit pas être vide : la chambre y est.
    const painted = await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const source = document.querySelector<HTMLCanvasElement>('.view canvas')!;
      const copy = document.createElement('canvas');
      copy.width = copy.height = 32;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(source, source.width * 0.25, source.height * 0.25, source.width * 0.5, source.height * 0.5, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;
      let opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 200) opaque++;
      return opaque / (32 * 32);
    });
    expect(painted).toBeGreaterThan(0.5);
  });

  test('une bulle ouvre son rayon', async ({ page, browserName }) => {
    await open(page);
    if (!(await expect3D(page, browserName))) {
      // Mode de secours : le menu donne accès au même rayon.
      await page.getByRole('navigation').getByRole('button', { name: 'Merch' }).click();
      await expect(panel(page).locator('.track')).toHaveCount(3);
      return;
    }
    await page.locator('.label', { hasText: 'CDs' }).click();
    await expect(panel(page).getByRole('heading', { name: 'CDs' })).toBeVisible();
    await expect(panel(page).locator('.track')).toHaveCount(3);
    await expect(page.locator('.label', { hasText: 'CDs' })).toHaveClass(/active/);
  });

  test('ouvrir ou fermer le panneau ne redimensionne pas la 3D', async ({ page, browserName }) => {
    // Redimensionner le canevas l'efface : l'image clignoterait à chaque ouverture ou fermeture.
    await open(page);
    if (!(await expect3D(page, browserName))) return;
    const size = () =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('.view canvas')!;
        return `${canvas.width}x${canvas.height} ${canvas.clientWidth}x${canvas.clientHeight}`;
      });
    const before = await size();
    await page.getByRole('navigation').getByRole('button', { name: 'Merch' }).click();
    await expect(panel(page)).toBeVisible();
    expect(await size()).toBe(before);
    await page.getByRole('button', { name: /Slim — retour/ }).click();
    await expect(panel(page)).toBeHidden();
    expect(await size()).toBe(before);
  });

  test('le bonhomme marche vers l’objet ouvert, sans erreur', async ({ page, browserName }) => {
    // Le clavier ouvre une vidéo : on ne charge pas le vrai YouTube, dont les messages ne sont pas les nôtres.
    await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ body: 'vidéo' }));
    const errors = await open(page);
    if (!(await expect3D(page, browserName))) return;
    // On enchaîne plusieurs destinations : rien ne doit casser pendant qu'il marche.
    for (const id of ['posters', 'cd-stack', 'keyboard']) {
      await page.evaluate((hash) => (location.hash = hash), id);
      await expect(panel(page)).toBeVisible();
      await page.waitForTimeout(400);
    }
    await page.getByRole('button', { name: /Slim — retour/ }).click();
    await expect(page.locator('.view canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('la page ne déborde pas de l’écran', async ({ page }) => {
    await open(page, './#cd-stack');
    await expect(panel(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // Le panneau et la barre restent entièrement dans l'écran.
    for (const selector of ['.panel', '.cart-button', '.brand']) {
      const box = (await page.locator(selector).boundingBox())!;
      const width = page.viewportSize()!.width;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
  });
});

test.describe('boutique', () => {
  test('ajouter, modifier la quantité, vider le panier', async ({ page }) => {
    await open(page, './#cd-stack');
    await expect(badge(page)).toBeHidden();

    await panel(page).getByRole('button', { name: "Ajouter J'rentre dedans au panier" }).click();
    await expect(badge(page)).toHaveText('1');
    await expect(page.locator('.toast')).toContainText("J'rentre dedans");

    // Le bouton « Voir » de la notification mène au panier.
    await page.locator('.toast-action').click();
    await expect(panel(page).getByRole('heading', { name: 'Panier' })).toBeVisible();
    await expect(panel(page).locator('.meta')).toHaveText(/1 article · 12,00\s€/);

    await panel(page).getByRole('button', { name: /Ajouter un exemplaire/ }).click();
    await expect(panel(page).locator('.quantity')).toHaveText('2');
    await expect(panel(page).locator('.total strong')).toHaveText(/24,00\s€/);
    await expect(badge(page)).toHaveText('2');

    await panel(page).getByRole('button', { name: /Retirer un exemplaire/ }).click();
    await expect(panel(page).locator('.quantity')).toHaveText('1');
    await panel(page).getByRole('button', { name: /Retirer du panier/ }).click();
    await expect(panel(page)).toContainText('Ton panier est vide.');
    await expect(badge(page)).toBeHidden();
  });

  test('le panier survit au rechargement', async ({ page }) => {
    await open(page, './#wardrobe');
    await panel(page).getByRole('button', { name: 'Ajouter Hoodie Slim au panier' }).click();
    await expect(badge(page)).toHaveText('1');
    await page.reload();
    await expect(badge(page)).toHaveText('1');
    await page.getByRole('button', { name: /^Panier/ }).click();
    await expect(panel(page).locator('.track')).toContainText('Hoodie Slim');
    await expect(panel(page)).toContainText('Version de démonstration');
  });

  test('les flèches passent d’un rayon à l’autre', async ({ page }) => {
    await open(page, './#cd-stack');
    await panel(page).getByRole('button', { name: /Rayon suivant/ }).click();
    await expect(panel(page).getByRole('heading', { name: 'Vêtements' })).toBeVisible();
    await panel(page).getByRole('button', { name: /Rayon suivant/ }).click();
    await expect(panel(page).getByRole('heading', { name: 'Posters' })).toBeVisible();
    await panel(page).getByRole('button', { name: /Rayon suivant/ }).click();
    await expect(panel(page).getByRole('heading', { name: 'CDs' })).toBeVisible();
    await panel(page).getByRole('button', { name: /Rayon précédent/ }).click();
    await expect(panel(page).getByRole('heading', { name: 'Posters' })).toBeVisible();
  });
});

test.describe('navigation', () => {
  test('le menu ouvre les rubriques et indique où l’on est', async ({ page }) => {
    await open(page);
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'Merch' }).click();
    await expect(panel(page).locator('.overline')).toHaveText('Playlist merch');
    await expect(nav.getByRole('button', { name: 'Merch' })).toHaveAttribute('aria-current', 'page');

    await nav.getByRole('button', { name: 'Actus' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Actus' })).toBeVisible();

    await nav.getByRole('button', { name: 'Accueil' }).click();
    await expect(panel(page)).toBeHidden();
    await expect(nav.getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');
  });

  test('Échap et la croix ferment le panneau', async ({ page }) => {
    await open(page, './#posters');
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await page.getByRole('button', { name: /^Panier/ }).click();
    await panel(page).getByRole('button', { name: 'Fermer' }).click();
    await expect(panel(page)).toBeHidden();
  });

  test('les liens directs ouvrent le bon contenu', async ({ page }) => {
    await open(page, './#panier');
    await expect(panel(page).getByRole('heading', { name: 'Panier' })).toBeVisible();
    await page.goto('./#posters');
    await expect(panel(page).getByRole('heading', { name: 'Posters' })).toBeVisible();
  });

  test('un lien direct inconnu ou mal formé ne casse rien', async ({ page, browserName }) => {
    const errors = await open(page, './#%E0%A4%A');
    await expect(panel(page)).toBeHidden();
    await page.goto('./#<img src=x onerror=alert(1)>');
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('.topbar')).toBeVisible();
    if (await expect3D(page, browserName)) expect(errors).toEqual([]);
  });

  test('un easter egg affiche sa vidéo, sans cookies de suivi', async ({ page }) => {
    await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ body: 'vidéo' }));
    await open(page, './#keyboard');
    await expect(panel(page).locator('.overline')).toHaveText('Easter egg');
    await expect(panel(page).locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}$/);
  });
});
