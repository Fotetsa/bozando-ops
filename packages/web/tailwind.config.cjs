const path = require("path")

// Chemin du package @medusajs/ui (pour que Tailwind scanne ses classes).
const medusaUI = path.join(
  path.dirname(require.resolve("@medusajs/ui")),
  "**/*.{js,jsx,ts,tsx}"
)

/** @type {import('tailwindcss').Config} */
// Chemins ancrés sur __dirname pour être corrects quel que soit le cwd
// (build lancé depuis la racine du monorepo ou depuis packages/web).
module.exports = {
  presets: [require("@medusajs/ui-preset")],
  content: [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "src/**/*.{js,ts,jsx,tsx}"),
    medusaUI,
  ],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
}
