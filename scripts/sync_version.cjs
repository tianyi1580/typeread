const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, '../package.json');
const cargoPath = path.join(__dirname, '../src-tauri/Cargo.toml');
const tauriConfigPath = path.join(__dirname, '../src-tauri/tauri.conf.json');

// 1. Read the newly bumped version from package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

// 2. Update Cargo.toml
let cargoContent = fs.readFileSync(cargoPath, 'utf8');
cargoContent = cargoContent.replace(/^version\s*=\s*".*"/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargoContent);

// 3. Update tauri.conf.json
let tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
tauriConfig.version = version;
fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2) + '\n');

// 4. Update Cargo.lock
try {
    console.log('Updating Cargo.lock...');
    execSync('cargo tree', { cwd: path.join(__dirname, '../src-tauri'), stdio: 'pipe' });
} catch (error) {
    console.error('Failed to update Cargo.lock:', error.stderr ? error.stderr.toString() : error.message);
}

console.log(`\n✅ Successfully synced version ${version} to Cargo and Tauri configs.`);
