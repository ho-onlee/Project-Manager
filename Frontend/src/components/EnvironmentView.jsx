import React, { useEffect, useState } from 'react';
import EnvironmentCard from './EnvironmentCard';
import EnvironmentModal from './EnvironmentModal';
import FloatingAction from './FloatingAction';
import CardVisibilityTabs from './CardVisibilityTabs';
import CatalogSearch from './CatalogSearch';
import useHiddenCards from './useHiddenCards';
import useCreatedCardAnimation from './useCreatedCardAnimation';
import { createEnvironmentAPI, deleteEnvironmentAPI, fetchEnvironments, updateEnvironmentAPI, updateSharedCardAPI } from '../api';

export default function EnvironmentView({ teams = [], activeWorkspaceId }) {
  const [environments, setEnvironments] = useState([]);
  const [modal, setModal] = useState(null);
  const [cardView, setCardView] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { hiddenIds, hideCard, restoreCard, forgetCard } = useHiddenCards('environments');
  const { createdCardIds, highlightCreatedCard } = useCreatedCardAnimation('environments');

  const loadEnvironments = async () => {
    try {
      const response = await fetchEnvironments();
      setEnvironments(response.data.results || response.data);
    } catch (error) {
      console.error('Failed to load environments:', error);
    }
  };

  useEffect(() => { loadEnvironments(); }, []);

  const saveEnvironment = async values => {
    if (modal?.id) {
      const response = await updateEnvironmentAPI(modal.id, values);
      setEnvironments(current => current.map(environment => environment.id === modal.id ? response.data : environment));
    } else {
      const response = await createEnvironmentAPI(values);
      setEnvironments(current => [...current, response.data]);
      setCardView('all');
      setSearchQuery('');
      highlightCreatedCard(response.data.id);
    }
    setModal(null);
  };

  const deleteEnvironment = async id => {
    await deleteEnvironmentAPI(id);
    setEnvironments(current => current.filter(environment => environment.id !== id));
    setModal(null);
  };

  const shareEnvironment = async (environment, teamId, shouldShare) => {
    const sharedWith = new Set((environment.shared_with || []).map(String));
    if (shouldShare) sharedWith.add(String(teamId)); else sharedWith.delete(String(teamId));
    const response = await updateSharedCardAPI('environments', environment.id, [...sharedWith]);
    setEnvironments(current => current.map(item => item.id === environment.id ? response.data : item));
  };

  const removeEnvironmentFromCard = async id => {
    const environment = environments.find(item => String(item.id) === String(id));
    if (!environment || !window.confirm(`Remove "${environment.name}"? This cannot be undone.`)) return;
    await deleteEnvironmentAPI(id);
    setEnvironments(current => current.filter(item => item.id !== id));
    forgetCard(id);
  };

  const hiddenEnvironmentsCount = environments.filter(environment => hiddenIds.has(String(environment.id))).length;
  const displayedEnvironments = environments.filter(environment => hiddenIds.has(String(environment.id)) === (cardView === 'hidden'));
  const query = searchQuery.trim().toLowerCase();
  const filteredEnvironments = displayedEnvironments.filter(environment => !query || [environment.name, environment.description].some(value => String(value || '').toLowerCase().includes(query)));

  return (
    <>
      <section className="catalog-view">
        <div className="catalog-toolbar">
          <CatalogSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search environments" />
          <CardVisibilityTabs view={cardView} onChange={setCardView} allCount={environments.length - hiddenEnvironmentsCount} hiddenCount={hiddenEnvironmentsCount} />
        </div>
        <div className="catalog-grid">
          {filteredEnvironments.map(environment => <EnvironmentCard id={`environments-card-${environment.id}`} key={environment.id} environment={environment} teams={environment.workspace === activeWorkspaceId ? teams : []} onShareChange={shareEnvironment} hidden={cardView === 'hidden'} highlighted={createdCardIds.has(String(environment.id))} onHide={() => hideCard(environment.id)} onRestore={() => restoreCard(environment.id)} onRemove={() => removeEnvironmentFromCard(environment.id)} onEdit={setModal} />)}
        </div>
        {!filteredEnvironments.length && <p className="hidden-cards-empty">{query ? `No environments match "${searchQuery.trim()}".` : cardView === 'hidden' ? 'No hidden environments.' : 'No environments yet.'}</p>}
      </section>
      {modal && <EnvironmentModal environment={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSave={saveEnvironment} onDelete={deleteEnvironment} />}
      <FloatingAction activeView="environments" onClick={() => setModal('new')} />
    </>
  );
}
