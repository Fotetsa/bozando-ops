const path = require("path")

// Pointe explicitement vers la config Tailwind de ce package (chemin absolu) :
// robuste quel que soit le cwd du build (racine monorepo vs packages/web).
module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, "tailwind.config.cjs") },
    autoprefixer: {},
  },
}
