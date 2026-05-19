// Consumer-facing entry point for the Expo config plugin.
// The TS implementation lives in src/config-plugin/index.ts and is
// compiled by expo-module-scripts to build/config-plugin/index.js.
module.exports = require("./build/config-plugin").default;
