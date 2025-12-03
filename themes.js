import fs from 'fs';
import path from 'path';
import toml from 'toml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load theme from TOML file
 * Supports both project themes and user themes in ~/.config/scrapbook-cli/
 */
export function loadTheme(themeName = 'vulpes-reddishnovember-dark') {
  const possiblePaths = [
    // User theme in config directory
    path.join(process.env.HOME, '.config', 'scrapbook-cli', `${themeName}.toml`),
    // Project theme
    path.join(__dirname, 'themes', `${themeName}.toml`),
    // Default theme in root
    path.join(__dirname, 'theme.toml'),
  ];

  for (const themePath of possiblePaths) {
    if (fs.existsSync(themePath)) {
      try {
        const themeContent = fs.readFileSync(themePath, 'utf-8');
        const theme = toml.parse(themeContent);
        console.log(`Loaded theme from: ${themePath}`);
        return theme;
      } catch (error) {
        console.error(`Error parsing theme ${themePath}:`, error.message);
      }
    }
  }

  // Fallback to default theme
  console.warn(`Theme "${themeName}" not found, using default`);
  return getDefaultTheme();
}

/**
 * Get default theme (fallback)
 */
function getDefaultTheme() {
  return {
    manager: {
      border: { fg: '#595959' },
      header: { fg: '#ff1a90', bold: true },
      hovered: { fg: '#0d0d0d', bg: '#e60067', bold: true },
      date: { fg: '#595959' },
      type: { fg: '#f2cfdf' },
      content: { fg: '#f2cfdf' },
    },
    preview: {
      border: { fg: '#ff1a90' },
      label: { fg: '#ff1a90', bold: true },
      text: { fg: '#f2cfdf' },
      highlight: { fg: '#ff1a90' },
    },
    palette: {
      bg: '#0d0d0d',
      fg: '#f2cfdf',
      pink: '#ff1a90',
    },
  };
}

/**
 * List available themes
 */
export function listThemes() {
  const themes = [];
  const themesDir = path.join(__dirname, 'themes');

  if (fs.existsSync(themesDir)) {
    const files = fs.readdirSync(themesDir);
    files
      .filter(f => f.endsWith('.toml'))
      .forEach(f => themes.push(path.basename(f, '.toml')));
  }

  // Check user themes
  const userThemesDir = path.join(process.env.HOME, '.config', 'scrapbook-cli');
  if (fs.existsSync(userThemesDir)) {
    const files = fs.readdirSync(userThemesDir);
    files
      .filter(f => f.endsWith('.toml'))
      .forEach(f => themes.push(`~/${path.basename(f, '.toml')}`));
  }

  return themes;
}

export default { loadTheme, listThemes };
