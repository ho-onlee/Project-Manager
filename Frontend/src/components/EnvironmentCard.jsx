import React from 'react';
import CatalogCard from './CatalogCard';

export default function EnvironmentCard({ id, environment, hidden, highlighted, onHide, onRestore, onRemove, onEdit, teams = [], onShareChange }) {
  return (
    <CatalogCard id={id} label="ENVIRONMENT" name={environment.name} description={environment.description} hidden={hidden} highlighted={highlighted} onHide={onHide} onRestore={onRestore} onRemove={onRemove} onEdit={() => onEdit(environment)} teams={teams} sharedWith={(environment.shared_with || []).map(String)} onShareChange={onShareChange && ((teamId, shared) => onShareChange(environment, teamId, shared))} />
  );
}
