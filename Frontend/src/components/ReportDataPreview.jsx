import React from 'react';

export default function ReportDataPreview({ payload, onCancel, onSend }) {
  return (
    <div className="modal-backdrop report-data-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
      <section className="device-modal report-data-modal" role="dialog" aria-modal="true" aria-labelledby="report-data-title">
        <header className="modal-header">
          <div><span className="eyebrow">Privacy review</span><h2 id="report-data-title">Data sent to Gemini</h2></div>
          <button className="close-button" type="button" aria-label="Close data review" onClick={onCancel}>×</button>
        </header>
        <p className="report-data-note">This is the exact request payload. Embedded image URLs are omitted from project JSON.</p>
        <pre className="report-data-json">{JSON.stringify(payload, null, 2)}</pre>
        <div className="modal-actions">
          <button className="quiet-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="button" onClick={onSend}>Send to Gemini</button>
        </div>
      </section>
    </div>
  );
}
