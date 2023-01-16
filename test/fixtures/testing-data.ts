const fs = require('fs');
const path = require('path');

export const inputCSS: string = fs
  .readFileSync(path.resolve(__dirname, './input.css'))
  .toString();
