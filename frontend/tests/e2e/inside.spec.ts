// La vue intérieure (page dedans.html) : on est dans la chambre, à hauteur d'yeux.
// La boutique, les panneaux et le panier sont les mêmes que sur la page d'accueil ;
// on vérifie ici ce qui est propre à cette vue.
import { expect, test, type Page } from '@playwright/test';

/** Ouvre la page ; `enter` = franchir l'écran d'entrée avec son bouton, s'il est affiché. */
async function open(page: Page, path = './dedans.html', enter = true): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(page.locator('.loader')).toHaveClass(/done/, { timeout: 30_000 });
  const button = page.getByRole('button', { name: 'Entrer dans la chambre' });
  if (enter && (await button.isVisible())) await button.click();
  return errors;
}

/** Vrai si le navigateur sait faire de la 3D (voir room.spec.ts : seul Firefox peut ne pas l'avoir). */
async function has3D(page: Page, browserName: string): Promise<boolean> {
  const supported = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!supported) expect(browserName).toBe('firefox');
  return supported;
}

const panel = (page: Page) => page.locator('.panel');

test('les deux versions renvoient l’une vers l’autre', async ({ page }) => {
  await open(page, './');
  await expect(page.locator('#app')).not.toHaveAttribute('data-view', 'inside');
  await page.getByRole('link', { name: 'Entrer dans la chambre' }).click();
  // Venant de la vue d'ensemble, on entre directement : pas d'écran d'entrée à refranchir.
  await expect(page).toHaveURL(/dedans\.html#entrer$/);
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'inside');
  await expect(page.locator('.loader')).toHaveClass(/done/, { timeout: 30_000 });
  await expect(page.locator('.gate')).toBeHidden();
  await page.getByRole('link', { name: 'Vue d’ensemble' }).click();
  await expect(page).not.toHaveURL(/dedans/);
  await expect(page.getByRole('link', { name: 'Entrer dans la chambre' })).toBeVisible();
});

test.describe('écran d’entrée', () => {
  const gate = (page: Page) => page.locator('.gate');

  test('attend le visiteur, puis le bouton fait entrer', async ({ page }) => {
    await open(page, './dedans.html', false);
    await expect(gate(page)).toBeVisible();
    // Tant qu'on n'est pas entré, rien ne s'affiche par-dessus la chambre.
    await expect(page.locator('.hint')).toBeHidden();
    await expect(page.locator('.view-switch')).toBeHidden();
    await page.getByRole('button', { name: 'Entrer dans la chambre' }).click();
    await expect(gate(page)).toBeHidden();
    await expect(page.locator('.view-switch')).toBeVisible();
  });

  test('faire défiler vers le bas fait entrer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'la molette ne concerne pas le tactile');
    await open(page, './dedans.html', false);
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, -200); // vers le haut : on reste dehors
    await expect(gate(page)).toBeVisible();
    await page.mouse.wheel(0, 200);
    await expect(gate(page)).toBeHidden();
  });

  test('un lien direct ou le menu font entrer sans passer par le bouton', async ({ page }) => {
    await open(page, './dedans.html#posters', false);
    await expect(gate(page)).toBeHidden();
    await expect(panel(page).getByRole('heading', { name: 'Posters' })).toBeVisible();
    await open(page, './dedans.html', false);
    await expect(gate(page)).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: 'Merch' }).click();
    await expect(gate(page)).toBeHidden();
    await expect(panel(page).locator('.track')).toHaveCount(3);
  });
});

test('la vue intérieure s’affiche sans erreur', async ({ page, browserName }) => {
  const errors = await open(page);
  await expect(page.locator('.hint')).toContainText(/regarder autour|passe par le menu/);
  if (!(await has3D(page, browserName))) return;
  await expect(page.locator('.view canvas')).toBeVisible();
  // Depuis la place d'arrivée, on a l'armoire et le mur des posters devant soi.
  await expect(page.locator('.label', { hasText: 'Vêtements' })).toBeVisible();
  await expect(page.locator('.label', { hasText: 'Posters' })).toBeVisible();
  // L'image est pleine : de l'intérieur, la pièce est fermée, on ne voit plus le fond de page.
  const painted = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const source = document.querySelector<HTMLCanvasElement>('.view canvas')!;
    const copy = document.createElement('canvas');
    copy.width = copy.height = 32;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(source, 0, 0, 32, 32);
    const pixels = ctx.getImageData(0, 0, 32, 32).data;
    let opaque = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 200) opaque++;
    return opaque / (32 * 32);
  });
  expect(painted).toBeGreaterThan(0.97);
  expect(errors).toEqual([]);
});

test('glisser fait tourner le regard', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile, 'le glissement à la souris ne concerne pas le tactile');
  await open(page);
  if (!(await has3D(page, browserName))) return;
  const canvas = page.locator('.view canvas');
  const before = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
  // Un glissement n'est pas un clic : aucun panneau ne s'ouvre.
  await expect(panel(page)).toBeHidden();
});

test('ouvrir un objet, acheter, revenir', async ({ page, browserName }) => {
  const errors = await open(page, './dedans.html#cd-stack');
  await expect(panel(page).getByRole('heading', { name: 'CDs' })).toBeVisible();
  await panel(page).getByRole('button', { name: "Ajouter J'rentre dedans au panier" }).click();
  await expect(page.locator('.badge')).toHaveText('1');
  await panel(page).getByRole('button', { name: /Rayon suivant/ }).click();
  await expect(panel(page).getByRole('heading', { name: 'Vêtements' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  // Le panier est commun aux deux versions.
  await page.getByRole('link', { name: 'Vue d’ensemble' }).click();
  await expect(page.locator('.badge')).toHaveText('1');
  if (await has3D(page, browserName)) expect(errors).toEqual([]);
});

test('le panneau ne redimensionne pas la 3D', async ({ page, browserName }) => {
  await open(page);
  if (!(await has3D(page, browserName))) return;
  const size = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.view canvas')!;
      return `${canvas.width}x${canvas.height}`;
    });
  const before = await size();
  await page.getByRole('navigation').getByRole('button', { name: 'Actus' }).click();
  await expect(panel(page)).toBeVisible();
  expect(await size()).toBe(before);
});
