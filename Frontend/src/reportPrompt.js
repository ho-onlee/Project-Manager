export const REPORT_PROMPT_STORAGE_KEY = 'projectnote-report-generation-prompt';
export const DEFAULT_REPORT_PROMPT = 'Write a clear, structured project report in Markdown. Cover the project purpose and goals, ordered steps, relationships and dependencies, tools, skills, environments, risks or gaps, and practical recommendations supported by the project data. Do not invent facts; identify missing information.';

export function readReportPrompt() {
  try {
    const savedPrompt = localStorage.getItem(REPORT_PROMPT_STORAGE_KEY);
    return savedPrompt === null ? DEFAULT_REPORT_PROMPT : savedPrompt;
  } catch {
    return DEFAULT_REPORT_PROMPT;
  }
}