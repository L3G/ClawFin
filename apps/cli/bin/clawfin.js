#!/usr/bin/env node

// Thin shim that loads the built CLI entry point.
// This file exists so npm can create the bin symlink at install time
// (before the TypeScript build runs).

import("../dist/index.js").catch((err) => {
  console.error(
    "ClawFin has not been built yet.\nRun: npm run build\n"
  );
  process.exit(1);
});
