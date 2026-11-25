'use strict';

const esbuild = require('esbuild');
const { options, assets } = require('./build.cjs');

(async () => {
  const context = await esbuild.context(options);
  await context.rebuild();
  assets();
  await context.watch();
  const server = await context.serve({ servedir: '.', host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 0) });
  console.log(`VibeRotor: http://localhost:${server.port}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await context.dispose(); process.exit(0); });
})().catch(error => { console.error(error); process.exitCode = 1; });
