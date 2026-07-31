const fs = require("fs");
const path = require("path");

const src = `C:\\Users\\yoges\\.gemini\\antigravity-ide\\brain\\aee2e8ce-0d23-4dfe-9563-22f944855d14\\driver_app_icon_1785502665970.png`;
const targetDir = path.join(__dirname, "../public/icons");

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.copyFileSync(src, path.join(targetDir, "icon-512.png"));
fs.copyFileSync(src, path.join(targetDir, "icon-192.png"));
console.log("Copied 3D PNG icons successfully!");
