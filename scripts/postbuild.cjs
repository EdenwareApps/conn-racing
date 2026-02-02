'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'conn-racing.cjs');
let content = fs.readFileSync(file, 'utf8');

// Remove esbuild's default export wrapper so we can export the class directly
content = content.replace(/module\.exports = __toCommonJS\(conn_racing_exports\);\n?/g, '');

// Add direct CJS export for require('pkg') to return the class
if (!content.includes('module.exports = conn_racing_default')) {
  content = content.replace(
    /var conn_racing_default = ConnRacing;\s*$/m,
    'var conn_racing_default = ConnRacing;\nmodule.exports = conn_racing_default;\nmodule.exports.default = conn_racing_default;\n'
  );
}

fs.writeFileSync(file, content);
