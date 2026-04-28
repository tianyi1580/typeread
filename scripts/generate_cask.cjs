const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

/**
 * This script generates a Homebrew Cask file for TypeRead.
 * It looks for the latest DMG in the Tauri bundle directory,
 * calculates its SHA256 hash, and outputs the Ruby code.
 */

const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');
const TARGET_DIR = path.join(__dirname, '../src-tauri/target');

function getVersion() {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    return pkg.version;
}

function findDmgRecursively(dir, version) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            const found = findDmgRecursively(fullPath, version);
            if (found) return found;
        } else if (file.name.endsWith('.dmg') && file.name.includes(version)) {
            return fullPath;
        }
    }
    return null;
}

function getLatestDmg(version) {
    const dmgPath = findDmgRecursively(TARGET_DIR, version);
    if (!dmgPath) {
        console.error(`Error: No DMG found for version ${version} in ${TARGET_DIR}`);
        process.exit(1);
    }
    return dmgPath;
}

function calculateSha256(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
}

const version = getVersion();
const dmgPath = getLatestDmg(version);
const sha256 = calculateSha256(dmgPath);
const dmgFilename = path.basename(dmgPath);

const caskTemplate = `
cask "typeread" do
  version "${version}"
  sha256 "${sha256}"

  url "https://github.com/tianyi1580/typeread/releases/download/v#{version}/${dmgFilename}"
  name "TypeRead"
  desc "A minimalist, beautiful typing practice app for readers"
  homepage "https://github.com/tianyi1580/typeread"

  app "TypeRead.app"

  # Bypasses the "damaged" warning by removing the quarantine flag after install
  postflight do
    system_command "xattr", args: ["-rd", "com.apple.quarantine", "#{appdir}/TypeRead.app"]
  end

  zap trash: [
    "~/Library/Application Support/com.tianyima.typeread",
    "~/Library/Caches/com.tianyima.typeread",
    "~/Library/Preferences/com.tianyima.typeread.plist",
  ]
end
`;

const outputPath = path.join(__dirname, '../typeread.rb');
fs.writeFileSync(outputPath, caskTemplate.trim());

console.log(`\n✅ Success! Generated Homebrew Cask for v${version}`);
console.log(`SHA256: ${sha256}`);
console.log(`File saved to: ${outputPath}`);
console.log(`\nNext steps:`);
console.log(`1. Upload ${dmgFilename} to your GitHub Release (v${version}).`);
console.log(`2. Copy the content of typeread.rb to your homebrew-tap repository.`);
