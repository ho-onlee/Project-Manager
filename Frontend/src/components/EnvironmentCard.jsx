import React from 'react';
import CatalogCard from './CatalogCard';

export default function EnvironmentCard({ id, environment, hidden, highlighted, onHide, onRestore, onRemove, onEdit }) {
  return (
    <CatalogCard id={id} label="ENVIRONMENT" name={environment.name} description={environment.description} hidden={hidden} highlighted={highlighted} onHide={onHide} onRestore={onRestore} onRemove={onRemove} onEdit={() => onEdit(environment)} />
  );
}
