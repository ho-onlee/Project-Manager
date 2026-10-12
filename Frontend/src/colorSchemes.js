import { fetchColorSchemesAPI } from './api';

export const COLOR_SCHEMES_CACHE_KEY = 'projectnote-color-schemes-v4';
export const COLOR_SCHEME_SELECTION_KEY = 'projectnote-color-scheme';
export const CUSTOM_COLOR_SCHEMES_KEY = 'projectnote-custom-color-schemes-v1';
let pendingSchemeRequest = null;

const COLOR_VARIABLE_NAMES = [
  '--ink', '--muted', '--panel', '--line', '--lime', '--orange', '--app-bg', '--nav-bg',
  '--card-bg', '--card-hover', '--field-bg', '--surface', '--strong', '--accent-contrast',
  '--accent-soft', '--accent-border', '--grid-line', '--canvas-bg', '--canvas-line',
];
const SAFE_COLOR_VALUE = /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.%\s,]+\)|hsla?\(\s*[\d.%deg\s,]+\))$/i;

function normalizeCustomScheme(scheme) {
  if (!scheme || typeof scheme !== 'object' || typeof scheme.name !== 'string') return null;
  const name = scheme.name.trim();
  const description = typeof scheme.description === 'string' ? scheme.description.trim() : '';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (!slug || name.length > 48 || description.length > 120) return null;
  if (!Array.isArray(scheme.swatches) || scheme.swatches.length !== 4 || !scheme.swatches.every(isSafeColor)) return null;
  if (!scheme.variables || typeof scheme.variables !== 'object' || Array.isArray(scheme.variables)) return null;
  const keys = Object.keys(scheme.variables);
  if (keys.length !== COLOR_VARIABLE_NAMES.length || COLOR_VARIABLE_NAMES.some(key => !keys.includes(key))) return null;
  if (!COLOR_VARIABLE_NAMES.every(key => isSafeColor(scheme.variables[key]))) return null;
  return {
    id: `custom-${slug}`,
    name,
    description,
    swatches: [...scheme.swatches],
    variables: Object.fromEntries(COLOR_VARIABLE_NAMES.map(key => [key, scheme.variables[key].trim()])),
  };
}

function isSafeColor(value) {
  return typeof value === 'string' && SAFE_COLOR_VALUE.test(value.trim());
}

function readCustomSchemes() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_COLOR_SCHEMES_KEY) || '[]');
    return Array.isArray(stored) ? stored.map(normalizeCustomScheme).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function mergeCustomSchemes(schemes) {
  const merged = new Map(schemes.map(scheme => [scheme.id, scheme]));
  readCustomSchemes().forEach(scheme => merged.set(scheme.id, scheme));
  return [...merged.values()];
}

function readSchemesCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(COLOR_SCHEMES_CACHE_KEY) || 'null');
    if (cached?.version === 3 && Array.isArray(cached.schemes) && cached.schemes.length) return cached;
  } catch {
    // Treat unavailable or malformed browser cache as a cold open.
  }
  return null;
}

function readSelection() {
  try {
    return localStorage.getItem(COLOR_SCHEME_SELECTION_KEY) || '';
  } catch {
    return '';
  }
}

export function getInitialColorSchemeState() {
  const cached = readSchemesCache();
  return {
    schemes: mergeCustomSchemes(cached?.schemes || []),
    defaultSchemeId: cached?.default || 'moss',
    selectedSchemeId: readSelection() || cached?.default || 'moss',
    definitionsCached: Boolean(cached),
  };
}

export function loadColorSchemes() {
  if (!pendingSchemeRequest) {
    pendingSchemeRequest = fetchColorSchemesAPI().then(response => {
      const definitions = response.data;
      if (!definitions || definitions.version !== 3 || !Array.isArray(definitions.schemes) || !definitions.schemes.length) {
        throw new Error('Color scheme definitions are invalid.');
      }
      try {
        localStorage.setItem(COLOR_SCHEMES_CACHE_KEY, JSON.stringify(definitions));
      } catch {
        // Keep the fetched definitions active for this session if storage is unavailable.
      }
      return { ...definitions, schemes: mergeCustomSchemes(definitions.schemes) };
    }).finally(() => {
      pendingSchemeRequest = null;
    });
  }
  return pendingSchemeRequest;
}

export function addCustomColorScheme(input) {
  const scheme = normalizeCustomScheme(input);
  if (!scheme) throw new Error('Theme does not match the ProjectNote theme schema.');
  const customSchemes = readCustomSchemes().filter(existing => existing.id !== scheme.id);
  customSchemes.push(scheme);
  localStorage.setItem(CUSTOM_COLOR_SCHEMES_KEY, JSON.stringify(customSchemes));
  const cached = readSchemesCache();
  if (cached) localStorage.setItem(COLOR_SCHEMES_CACHE_KEY, JSON.stringify({
    ...cached,
    schemes: [...cached.schemes.filter(existing => existing.id !== scheme.id), scheme],
  }));
  return scheme;
}

export function saveColorSchemeSelection(schemeId) {
  try {
    localStorage.setItem(COLOR_SCHEME_SELECTION_KEY, schemeId);
  } catch {
    // Keep the selection active for this session if storage is unavailable.
  }
}
