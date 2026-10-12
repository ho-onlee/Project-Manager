import React from 'react';
import CardActions from './CardActions';

export default function CatalogCard({
  id,
  variant = 'skill',
  label,
  name,
  description,
  hidden,
  highlighted,
  onHide,
  onRestore,
  onRemove,
  onEdit,
  children,
}) {
  return (
    <article id={id} className={`catalog-card ${variant}-card ${highlighted ? 'is-highlighted' : ''}`}>
      <div className="card-kicker">{label}</div>
      <CardActions
        name={name}
        hidden={hidden}
        onHide={onHide}
        onRestore={onRestore}
        onEdit={onEdit}
        onRemove={onRemove}
      />
      <h2 title={name}>{name}</h2>
      <p title={description}>{description}</p>
      {children}
    </article>
  );
}
