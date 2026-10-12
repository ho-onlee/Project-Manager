import React from 'react';

export default function CatalogSearch({ value, onChange, placeholder }) {
  return (
    <label className="catalog-search">
      <span aria-hidden="true">⌕</span>
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}