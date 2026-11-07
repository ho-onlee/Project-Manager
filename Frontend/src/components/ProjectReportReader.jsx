import React, { useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';

const transformReportUrl = (url, key) => {
  if (key === 'src' && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)) return url;
  return defaultUrlTransform(url);
};

function reportFileName(projectTitle, extension = 'md') {
  const name = projectTitle.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${name || 'project'}-research-plan.${extension}`;
}

export default function ProjectReportReader({ projectTitle, markdown, plan, planJson, planAppliedAt, payload, generatedAt, isRegenerating = false, generationError = '', applyingPlan = false, applyError = '', onBack, onRegenerate, onApplyPlan, onAnswerQuestions, onLoadHistory, onOpenHistoryVersion }) {
  const [message, setMessage] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [answers, setAnswers] = useState({});
  const [answeringQuestions, setAnsweringQuestions] = useState(false);
  const questions = plan?.questions || [];
  const resourceNames = new Map();
  const collectResources = nodes => (nodes || []).forEach(node => {
    if (['tool', 'skill', 'environment'].includes(node.type || node.node_type)) resourceNames.set(String(node.id), node.title || node.name || node.type || node.node_type);
    collectResources(node.children);
  });
  collectResources(payload?.project_json?.nodes);
  const planCanApply = plan?.ready_to_apply !== false && questions.length === 0 && !planAppliedAt;

  const downloadReport = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFileName(projectTitle);
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPlanJson = (selectedPlan = plan, selectedTitle = projectTitle) => {
    const json = selectedPlan === plan ? planJson : `${JSON.stringify(selectedPlan, null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFileName(selectedTitle, 'json');
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

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      setHistory(await onLoadHistory());
    } catch {
      setHistoryError('Plan history could not be loaded.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const submitAnswers = async event => {
    event.preventDefault();
    const clarifications = questions.map(question => ({ key: question.key, answer: String(answers[question.key] || '').trim() }));
    if (clarifications.some(item => !item.answer)) return;
    setAnsweringQuestions(true);
    await onAnswerQuestions(clarifications);
    setAnsweringQuestions(false);
  };

  if (isRegenerating) {
    return (
      <section className="catalog-view report-reader report-generating" role="status" aria-live="polite" aria-busy="true">
        <div className="report-loading-content">
          <span className="report-spinner" aria-hidden="true" />
          <span>Regenerating research plan…</span>
        </div>
      </section>
    );
  }

  return (
    <section className="catalog-view report-reader">
      <button className="report-float-button report-back-button" type="button" aria-label="Back to projects" title="Back to projects" onClick={onBack}>
        <span aria-hidden="true">←</span>
      </button>
      <div className="report-reader-actions">
        <button className="report-float-button" type="button" aria-label="Copy Markdown" title="Copy Markdown" onClick={copyReport}>
          <span aria-hidden="true">⧉</span>
        </button>
        {plan && <button className="report-float-button" type="button" aria-label="Apply plan to project diagram" title={applyingPlan ? 'Applying plan…' : planAppliedAt ? 'This plan has already been applied' : !planCanApply ? 'Answer the plan questions first' : 'Apply plan to project diagram'} disabled={applyingPlan || !planCanApply} onClick={() => setPreviewOpen(true)}>
          <span aria-hidden="true">{applyingPlan ? '…' : '＋'}</span>
        </button>}
        {plan && <button className="report-float-button report-json-button" type="button" aria-label="Download plan JSON" title="Download plan JSON" onClick={downloadPlanJson}>
          <span aria-hidden="true">{'{}'}</span>
        </button>}
        {plan && <button className="report-float-button" type="button" aria-label="Plan history" title="Plan history" onClick={openHistory}>
          <span aria-hidden="true">◷</span>
        </button>}
        <button className="report-float-button report-download-button" type="button" aria-label="Download Markdown report" title="Download Markdown report" onClick={downloadReport}>
          <span aria-hidden="true">↓</span>
        </button>
      </div>
      <div className="report-reader-meta">
        <time dateTime={generatedAt}>{generatedAt ? new Date(generatedAt).toLocaleString() : ''}</time>
        <button className="report-regenerate-button" type="button" onClick={onRegenerate}>↻ Regenerate</button>
      </div>
      {message && <p className="report-reader-message" role="status">{message}</p>}
      {generationError && <p className="report-reader-error" role="alert">{generationError}</p>}
      <article className="report-document">
        <p className="eyebrow">Research plan</p>
        <h1>{projectTitle}</h1>
        {plan?.human_subjects && <section className="research-ethics-note" aria-labelledby="research-ethics-title">
          <h2 id="research-ethics-title">Human-subject safeguards</h2>
          <ul>{(plan.ethics_checks || []).map((check, index) => <li key={`${index}-${check}`}>{check}</li>)}</ul>
        </section>}
        {questions.length > 0 && <form className="research-questions" onSubmit={submitAnswers}>
          <div><span className="eyebrow">More information needed</span><h2>Answer to refine this plan</h2></div>
          {questions.map(question => <label key={question.key}>
            <strong>{question.question}</strong>
            {question.reason && <small>{question.reason}</small>}
            <textarea required value={answers[question.key] || ''} onChange={event => setAnswers(current => ({ ...current, [question.key]: event.target.value }))} />
          </label>)}
          <button className="primary-button" type="submit" disabled={answeringQuestions || questions.some(question => !String(answers[question.key] || '').trim())}>{answeringQuestions ? 'Updating plan…' : 'Answer and regenerate'}</button>
        </form>}
        {plan && <button className="research-plan-review-button" type="button" disabled={!planCanApply || applyingPlan} onClick={() => setPreviewOpen(true)}>
          {planAppliedAt ? 'Already applied to project' : questions.length || plan.ready_to_apply === false ? 'Answer questions before applying' : 'Preview nodes to apply'}
        </button>}
        {applyError && <p className="settings-error" role="alert">{applyError}</p>}
        <div className="report-markdown"><ReactMarkdown urlTransform={transformReportUrl}>{markdown}</ReactMarkdown></div>
      </article>
      {previewOpen && <div className="modal-backdrop research-plan-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setPreviewOpen(false)}>
        <section className="device-modal research-plan-preview" role="dialog" aria-modal="true" aria-labelledby="research-plan-preview-title">
          <header className="modal-header">
            <div><span className="eyebrow">Review before applying</span><h2 id="research-plan-preview-title">{plan.title}</h2></div>
            <button className="close-button" type="button" aria-label="Close plan preview" onClick={() => setPreviewOpen(false)}>×</button>
          </header>
          <p>{plan.summary}</p>
          {plan.human_subjects && <div className="research-ethics-note"><strong>Human-subject safeguards</strong><ul>{(plan.ethics_checks || []).map((check, index) => <li key={`${index}-${check}`}>{check}</li>)}</ul></div>}
          <div className="research-plan-preview-list">{plan.nodes.map((node, index) => <article key={node.key}>
            <span>{index + 1} · {node.node_type}</span>
            <h3>{node.title}</h3>
            {node.description && <p>{node.description}</p>}
            {(node.resource_ids || []).length > 0 && <small>Uses: {node.resource_ids.map(id => resourceNames.get(String(id)) || id).join(', ')}</small>}
          </article>)}</div>
          <p className="research-plan-preview-count">{plan.nodes.length} nodes · {plan.relationships.length + plan.nodes.reduce((count, node) => count + (node.resource_ids || []).length, 0)} connections. Existing project nodes and resources will remain.</p>
          {applyError && <p className="settings-error" role="alert">{applyError}</p>}
          <footer className="modal-actions">
            <button className="quiet-button" type="button" onClick={() => setPreviewOpen(false)}>Cancel</button>
            <button className="primary-button" type="button" disabled={applyingPlan} onClick={onApplyPlan}>{applyingPlan ? 'Applying…' : 'Apply plan'}</button>
          </footer>
        </section>
      </div>}
      {historyOpen && <div className="modal-backdrop research-plan-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setHistoryOpen(false)}>
        <section className="device-modal plan-history-modal" role="dialog" aria-modal="true" aria-labelledby="plan-history-title">
          <header className="modal-header">
            <div><span className="eyebrow">Saved versions</span><h2 id="plan-history-title">Plan history</h2></div>
            <button className="close-button" type="button" aria-label="Close plan history" onClick={() => setHistoryOpen(false)}>×</button>
          </header>
          {historyLoading && <p>Loading plan history…</p>}
          {historyError && <p className="settings-error" role="alert">{historyError}</p>}
          {!historyLoading && !historyError && !history.length && <p>No saved plan versions yet.</p>}
          <div className="plan-history-list">{history.map(version => <article key={version.id}>
            <div className="plan-history-heading"><strong>{version.title}</strong><time>{new Date(version.created_at).toLocaleString()}</time></div>
            <p>{version.summary}</p>
            <small>{version.applied_at ? 'Applied to project' : 'Not applied'}{version.created_by ? ` · ${version.created_by}` : ''}</small>
            <details><summary>Inputs used</summary><pre>{JSON.stringify(version.source_project_json, null, 2)}</pre></details>
            <div className="plan-history-actions">
              <button className="secondary-setting-button" type="button" onClick={() => { onOpenHistoryVersion(version); setHistoryOpen(false); }}>Open version</button>
              <button className="secondary-setting-button" type="button" onClick={() => downloadPlanJson(version.plan_json, version.title)}>Download JSON</button>
            </div>
          </article>)}</div>
        </section>
      </div>}
    </section>
  );
}
