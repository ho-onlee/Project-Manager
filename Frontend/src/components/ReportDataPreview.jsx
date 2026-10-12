import React from 'react';

export default function ReportDataPreview({ payload, onCancel, onSend }) {
  const images = [];
  const redactImageData = value => {
    if (Array.isArray(value)) return value.map(redactImageData);
    if (!value || typeof value !== 'object') return value;
    const clean = { ...value };
    if (clean.type === 'image' && typeof clean.image_url === 'string') {
      images.push({ id: clean.id, title: clean.title || 'Project image', imageUrl: clean.image_url });
      delete clean.image_url;
      clean.image_attached_to_gemini = true;
    }
    if (Array.isArray(clean.children)) clean.children = clean.children.map(redactImageData);
    return clean;
  };
  const previewPayload = { ...payload, project_json: { ...payload.project_json, nodes: redactImageData(payload.project_json.nodes) } };

  return (
    <div className="modal-backdrop report-data-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
      <section className="device-modal report-data-modal" role="dialog" aria-modal="true" aria-labelledby="report-data-title">
        <header className="modal-header">
          <div><span className="eyebrow">Privacy review</span><h2 id="report-data-title">Data sent to Gemini</h2></div>
          <button className="close-button" type="button" aria-label="Close data review" onClick={onCancel}>×</button>
        </header>
        <p className="report-data-note">This preview shows the project text sent to Gemini. Attached pictures are sent as image data so Gemini can understand them and place them in the report.</p>
        {images.length > 0 && <div className="report-data-images">{images.map(image => <figure key={image.id}><img src={image.imageUrl} alt={image.title} /><figcaption>{image.title}</figcaption></figure>)}</div>}
        <pre className="report-data-json">{JSON.stringify(previewPayload, null, 2)}</pre>
        <div className="modal-actions">
          <button className="quiet-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="button" onClick={onSend}>Send to Gemini</button>
        </div>
      </section>
    </div>
  );
}
