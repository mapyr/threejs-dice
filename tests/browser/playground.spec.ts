import { test, expect } from '@playwright/test';

test('supports manual setup, keyboard rolls, history and reset controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Roll the dice' }),
  ).toBeEnabled();
  await page.getByLabel('Polyhedron').selectOption('6');
  await page.getByLabel('Dice', { exact: true }).fill('1');
  await page.getByLabel('Dice', { exact: true }).press('Tab');
  await expect(page.locator('.result')).toHaveCount(1);
  await page.getByLabel('Die size').fill('1.5');
  await page.getByLabel('Die size').press('Tab');
  await page.getByLabel('Label color').fill('#ffffff');
  await page.getByLabel('Label color').dispatchEvent('change');
  await expect(page.locator('#snippet')).toContainText('size: 1.5');
  await expect(page.locator('#snippet')).toContainText("fontColor: '#ffffff'");
  await page.locator('h1').click();
  await page.keyboard.press('Space');
  await expect(page.locator('#status')).toContainText('Free roll complete', {
    timeout: 30000,
  });
  await expect(page.locator('#history li')).toHaveCount(1);
  await expect(page.locator('#history li')).toContainText('Free');
  await page.getByLabel('Target value').fill('20');
  await page.getByRole('button', { name: 'Roll to target' }).click();
  await expect(page.locator('#status')).toContainText(
    'Directed roll complete',
    { timeout: 30000 },
  );
  await expect(page.locator('#history li')).toHaveCount(2);
  await expect(page.locator('#history li').first()).toContainText('D6: 6');
  await page.screenshot({
    path: 'test-results/playground-manual-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Reset dice' }).click();
  await expect(page.locator('#status')).toContainText('Your party is ready');
  await expect(page.locator('.result strong')).toHaveText(['—']);
  await expect(page.locator('#history li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByRole('button', { name: 'Roll the dice' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#status')).toContainText('aborted');
  await expect(page.locator('#history li')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/playground-manual-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Clear history' }).click();
  await expect(page.locator('#history li')).toHaveCount(0);
  await expect(page.locator('#history-empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('clamps the integration target and preserves the scene through cached page lifecycle events', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Roll the dice' }),
  ).toBeEnabled();
  await page.getByLabel('Polyhedron').selectOption('6');
  await page.getByLabel('Target value').fill('20');
  await page.getByLabel('Target value').press('Tab');
  await expect(page.locator('#snippet')).toContainText('sides: 6');
  await expect(page.locator('#snippet')).toContainText('value: 6');
  // Exercise the persisted event branch directly; this does not depend on
  // whether the automated browser chooses to admit this page to its cache.
  for (let visit = 0; visit < 2; visit++) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', { persisted: true }),
      );
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      );
    });
    await page.getByRole('button', { name: 'Roll to target' }).click();
    await expect(page.locator('#status')).toContainText(
      'Directed roll complete',
      { timeout: 30000 },
    );
    await expect(page.locator('.result strong')).toHaveText(Array(6).fill('6'));
  }
  expect(errors).toEqual([]);
});

test('renders all dice, rolls freely and to target, releases textures, and fits mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Roll the dice' }),
  ).toBeEnabled();
  await expect(page.locator('.result')).toHaveCount(6);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#metrics')).toHaveAttribute(
    'data-textures',
    /\d+/,
  );
  await expect
    .poll(async () =>
      Number(await page.locator('#metrics').getAttribute('data-textures')),
    )
    .toBeGreaterThanOrEqual(6);
  const baselineTextures = Number(
    await page.locator('#metrics').getAttribute('data-textures'),
  );
  await page.screenshot({
    path: 'test-results/playground-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Roll the dice' }).click();
  await expect(page.locator('#status')).toContainText('Free roll complete', {
    timeout: 30000,
  });
  await page.getByLabel('Target value').fill('20');
  await page.getByRole('button', { name: 'Roll to target' }).click();
  await expect(page.locator('#status')).toContainText(
    'Directed roll complete',
    { timeout: 30000 },
  );
  await expect(page.locator('.result strong')).toHaveText([
    '4',
    '6',
    '8',
    '10',
    '12',
    '20',
  ]);
  await page.screenshot({
    path: 'test-results/playground-directed.png',
    fullPage: true,
  });
  await page.getByLabel('Collider view').check();
  await page.waitForTimeout(300);
  await page.getByLabel('Collider view').uncheck();
  for (const color of ['#ff8888', '#77aaff', '#a9e66b']) {
    await page.locator('#color').fill(color);
    await page.locator('#color').dispatchEvent('change');
    await expect(page.locator('#status')).toContainText('Your party is ready');
  }
  await page.waitForTimeout(500);
  expect(
    Number(await page.locator('#metrics').getAttribute('data-textures')),
  ).toBeLessThanOrEqual(baselineTextures);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/playground-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('shares atlas textures across a dozen identical dice and cancels an active roll', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Roll the dice' }),
  ).toBeEnabled();
  await page.getByLabel('Polyhedron').selectOption('6');
  await page.locator('#count').fill('12');
  await page.locator('#count').press('Tab');
  await expect(page.locator('.result')).toHaveCount(12);
  await expect
    .poll(async () =>
      Number(await page.locator('#metrics').getAttribute('data-textures')),
    )
    .toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: 'Roll to target' }).click();
  await page.getByRole('button', { name: 'Cancel roll' }).click();
  await expect(page.locator('#status')).toContainText('aborted');
  await expect(
    page.getByRole('button', { name: 'Roll the dice' }),
  ).toBeEnabled();
});
