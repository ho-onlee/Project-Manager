export const ACCESSIBILITY_SETTINGS_KEY = 'projectnote-accessibility-settings-v1';
export const REPORT_REVIEW_KEY = 'projectnote-review-report-data';

export function readAccessibilitySettings() {
  const defaults = { textSize: 'standard', highContrast: false, reduceMotion: false };
  try {
    const saved = JSON.parse(localStorage.getItem(ACCESSIBILITY_SETTINGS_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      textSize: ['standard', 'large', 'largest'].includes(saved.textSize) ? saved.textSize : defaults.textSize,
      highContrast: Boolean(saved.highContrast),
      reduceMotion: Boolean(saved.reduceMotion),
    };
  } catch {
    return defaults;
  }
}

export function saveAccessibilitySettings(settings) {
  try {
    localStorage.setItem(ACCESSIBILITY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Keep preferences active for this session if browser storage is unavailable.
  }
}

export function readReviewReportData() {
  try {
    const saved = localStorage.getItem(REPORT_REVIEW_KEY);
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
}

export function saveReviewReportData(enabled) {
  try {
    localStorage.setItem(REPORT_REVIEW_KEY, String(enabled));
  } catch {
    // Keep the preference active for this session if browser storage is unavailable.
  }
}
