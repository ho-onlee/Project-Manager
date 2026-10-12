import React, { useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';

const transformReportUrl = (url, key) => {
  if (key === 'src' && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)) return url;
  return defaultUrlTransform(url);
};

function reportFileName(projectTitle) {
  const name = projectTitle.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${name || 'project'}-report.md`;
}

export default function ProjectReportReader({ projectTitle, markdown, onBack }) {
  const [message, setMessage] = useState('');

  const downloadReport = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFileName(projectTitle);
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setMessage('Markdown copied.');
    } catch {
      setMessage('Could not access the clipboard.');
    }
  };

  return (
    <section className="catalog-view report-reader">
      <button className="report-float-button report-back-button" type="button" aria-label="Back to projects" title="Back to projects" onClick={onBack}>
        <span aria-hidden="true">←</span>
      </button>
      <div className="report-reader-actions">
        <button className="report-float-button" type="button" aria-label="Copy Markdown" title="Copy Markdown" onClick={copyReport}>
          <span aria-hidden="true">⧉</span>
        </button>
        <button className="report-float-button report-download-button" type="button" aria-label="Download Markdown report" title="Download Markdown report" onClick={downloadReport}>
          <span aria-hidden="true">↓</span>
        </button>
      </div>
      {message && <p className="report-reader-message" role="status">{message}</p>}
      <article className="report-document">
        <p className="eyebrow">Generated project report</p>
        <h1>{projectTitle}</h1>
        <div className="report-markdown"><ReactMarkdown urlTransform={transformReportUrl}>{markdown}</ReactMarkdown></div>
      </article>
    </section>
  );
}
