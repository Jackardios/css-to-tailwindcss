const fs = require('fs');
const path = require('path');

export const testingCss = fs
  .readFileSync(path.resolve(__dirname, './testing.css'))
  .toString();

export const testingTailwindNodes = [];
