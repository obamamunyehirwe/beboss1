'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const releaseDirectory = path.resolve(__dirname, '..', 'release');
if (!fs.existsSync(releaseDirectory) || !fs.statSync(releaseDirectory).isDirectory()) {
  throw new Error('Desktop release directory does not exist. Build the installer first.');
}

const artifacts = fs.readdirSync(releaseDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== 'SHA256SUMS.txt')
  .map((entry) => entry.name)
  .sort();

if (artifacts.length === 0) {
  throw new Error('No desktop release artifacts were produced.');
}

const rows = artifacts.map((filename) => {
  const filePath = path.join(releaseDirectory, filename);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  return digest + '  ' + filename;
});

fs.writeFileSync(
  path.join(releaseDirectory, 'SHA256SUMS.txt'),
  '# BeBoss desktop release artifact SHA-256 checksums\n' + rows.join('\n') + '\n',
  'utf8'
);
process.stdout.write('Generated SHA256SUMS.txt for ' + artifacts.length + ' artifacts.\n');
