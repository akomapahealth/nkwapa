const ts = require('typescript');

// Use the installed compiler for the browser-only fixture; the normal typecheck
// still validates this TSX together with the application.
module.exports = function transpile(source) {
  return ts.transpileModule(source, {
    fileName: this.resourcePath,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
};
