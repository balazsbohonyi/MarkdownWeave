import * as esbuild from 'esbuild';
import { cp, copyFile, mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isProduction = args.includes('--production');

const shared = {
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
  logLevel: 'info'
};

const builds = [
  {
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode']
  },
  {
    ...shared,
    entryPoints: ['webview-ui/src/main.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022'
  }
];

async function run() {
  await copyWebviewRuntimeAssets();

  if (isWatch) {
    const contexts = await Promise.all(builds.map((build) => esbuild.context(build)));
    await Promise.all(contexts.map((context) => context.watch()));
    console.log('Watching extension host and webview bundles...');
    return;
  }

  await Promise.all(builds.map((build) => esbuild.build(build)));
}

async function copyWebviewRuntimeAssets() {
  await mkdir('dist/katex', { recursive: true });
  await mkdir('dist/mermaid', { recursive: true });

  await Promise.all([
    copyFile('node_modules/katex/dist/katex.mjs', 'dist/katex/katex.mjs'),
    copyFile('node_modules/katex/dist/katex.min.css', 'dist/katex/katex.min.css'),
    cp('node_modules/katex/dist/fonts', 'dist/katex/fonts', { recursive: true, force: true }),
    cp('node_modules/mermaid/dist', 'dist/mermaid', { recursive: true, force: true })
  ]);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
