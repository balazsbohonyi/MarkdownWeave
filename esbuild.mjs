import * as esbuild from 'esbuild';

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
  if (isWatch) {
    const contexts = await Promise.all(builds.map((build) => esbuild.context(build)));
    await Promise.all(contexts.map((context) => context.watch()));
    console.log('Watching extension host and webview bundles...');
    return;
  }

  await Promise.all(builds.map((build) => esbuild.build(build)));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
