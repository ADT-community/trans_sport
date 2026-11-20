"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFile();

const { buildConfig } = require("./config");
const { createServer } = require("./app");

const config = buildConfig(process.env);
const server = createServer({ config });

server.listen(config.port, () => {
  console.log(`trans_sport payments API on http://localhost:${config.port} (provider: ${config.provider})`);
});
