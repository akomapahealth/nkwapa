const { test, expect } = require('@playwright/test');

for (const theme of ['light', 'dark']) {
  test(`app fonts are self-hosted with external font hosts blocked (${theme})`, async ({
    page,
  }) => {
    const externalFonts = [];
    const fontRequests = [];
    await page.addInitScript((value) => localStorage.setItem('nkwapa-theme', value), theme);
    await page.route(/https:\/\/fonts\.(googleapis|gstatic|cdnfonts)\.com\//, (route) => {
      externalFonts.push(route.request().url());
      return route.abort();
    });
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fontRequests.push(request.url());
    });
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const fonts = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const heading = getComputedStyle(document.querySelector('h1'));
      const primaryFamily = (value) => value.split(',')[0].trim().replaceAll(/["']/g, '');
      const bodyFamily = primaryFamily(body.getPropertyValue('--font-body'));
      const headingFamily = primaryFamily(heading.getPropertyValue('--font-heading'));
      const loaded = [...document.fonts]
        .filter((font) => font.status === 'loaded')
        .map((font) => primaryFamily(font.family));
      return {
        bodyFamily,
        headingFamily,
        bodyApplied: primaryFamily(body.fontFamily) === bodyFamily,
        headingApplied: primaryFamily(heading.fontFamily) === headingFamily,
        loaded,
        preloads: [...document.querySelectorAll('link[rel="preload"][as="font"]')].map(
          (link) => link.href,
        ),
      };
    });
    expect(fonts.bodyFamily).toMatch(/IBM.Plex.Sans/i);
    expect(fonts.headingFamily).toMatch(/Source.Serif.4/i);
    expect(fonts.bodyApplied).toBe(true);
    expect(fonts.headingApplied).toBe(true);
    expect(fonts.loaded).toEqual(expect.arrayContaining([fonts.bodyFamily, fonts.headingFamily]));
    expect(fonts.preloads.length).toBeGreaterThanOrEqual(2);
    expect(fontRequests.length).toBeGreaterThanOrEqual(2);
    for (const url of [...fontRequests, ...fonts.preloads]) {
      const fontUrl = new URL(url);
      expect(fontUrl.origin).toBe(new URL(page.url()).origin);
      expect(fontUrl.pathname).toMatch(/^\/_next\/static\/media\/.*\.woff2$/);
    }
    expect(externalFonts).toEqual([]);
  });
}
