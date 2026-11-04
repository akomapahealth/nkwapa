const fs = require('fs');
const path = require('path');

const WIDTHS = [390, 768, 1024, 1280, 1440];
// Derive the inventory from App Router files, so a newly added route cannot silently escape.
function workspaceRoutes(dir = path.join(__dirname, '../app/(workspace)'), prefix = '') {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory())
        return workspaceRoutes(path.join(dir, entry.name), `${prefix}/${entry.name}`);
      return entry.name === 'page.tsx' ? [prefix] : [];
    })
    .sort();
}
async function overflow(page) {
  return page.evaluate(() => {
    const elements = [
      document.documentElement,
      document.body,
      document.querySelector('#main-content'),
    ].filter(Boolean);
    return elements.map((el) => ({
      name: el.id || el.tagName,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
  });
}
module.exports = { WIDTHS, workspaceRoutes, overflow };
