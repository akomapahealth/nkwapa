const crypto = require('crypto');
const postcss = require('postcss');

// The fixture renders production components, including their CSS modules. Scope selectors and
// inject the actual stylesheet so importing feedback does not require a mocked visual component.
module.exports = function cssModule(source) {
  const prefix = `fixture-${crypto.createHash('sha256').update(this.resourcePath).digest('hex').slice(0, 8)}`;
  const classes = {};
  const sheet = postcss.parse(source);
  sheet.walkRules((rule) => {
    rule.selector = rule.selector.replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => {
      classes[name] = `${prefix}-${name}`;
      return `.${classes[name]}`;
    });
  });
  return `const style = document.createElement('style');
style.textContent = ${JSON.stringify(sheet.toString())};
document.head.appendChild(style);
export default ${JSON.stringify(classes)};`;
};
