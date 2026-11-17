const fs = require('fs');
const os = require('os');
const path = require('path');
const webpack = require('webpack');

// Render the actual components in a real browser without adding a public demo
// route or another test dependency. Resolve React from the web workspace (18).
module.exports = async function bundleFixture({
  entry = 'SharedComponents.tsx',
  aliases = {},
  sourceWeb,
} = {}) {
  const web = path.resolve(__dirname, '../..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'nkwapa-components-'));
  const compiler = webpack({
    mode: 'development',
    devtool: false,
    target: 'web',
    entry: path.join(__dirname, entry),
    output: { path: output, filename: 'fixture.js' },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        ...aliases,
        '@': sourceWeb || web,
        react: path.dirname(require.resolve('react/package.json', { paths: [web] })),
        'react-dom': path.dirname(require.resolve('react-dom/package.json', { paths: [web] })),
      },
    },
    // App modules read process.env (Next inlines it); the browser has no process. Parenthesised:
    // a bare `{}` after `=>` parses as a block, so `() => process.env.X` became a syntax error.
    // One file: only fixture.js is read back, so a lazy import() must not split into a chunk.
    plugins: [
      new webpack.DefinePlugin({ 'process.env': '({})' }),
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    ],
    module: {
      rules: [
        { test: /\.module\.css$/, use: path.join(__dirname, 'css-module.cjs') },
        { test: /\.tsx?$/, exclude: /node_modules/, use: path.join(__dirname, 'transpile.cjs') },
      ],
    },
  });
  try {
    await new Promise((resolve, reject) => {
      compiler.run((error, stats) =>
        compiler.close(() => {
          if (error || stats.hasErrors())
            reject(error || new Error(stats.toString({ all: false, errors: true })));
          else resolve();
        }),
      );
    });
    return fs.readFileSync(path.join(output, 'fixture.js'), 'utf8');
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
};
