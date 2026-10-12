import React from 'react';

export default function TitleView({ onNavigate }) {
  return <section className="catalog-view title-view">
    <div className="title-page-content">
      <span className="eyebrow">A workspace for ideas in progress</span>
      <h1>Project<span>Note</span></h1>
      <div className="title-page-rule" />
      <p>Projects, tools, and the notes that connect them.</p>
      <div className="title-page-actions">
        <button className="title-page-primary" type="button" onClick={() => onNavigate('projects')}>Open projects <span aria-hidden="true">↗</span></button>
        <button type="button" onClick={() => onNavigate('dashboard')}>Dashboard</button>
      </div>
    </div>
    <span className="title-page-index">PN / 01</span>
  </section>;
}