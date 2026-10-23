import { useState, useCallback } from 'react';
import { Compass } from 'lucide-react';
import type { Group } from '@/types/group';
import { Landing } from '@/components/Landing';
import { GroupCreation } from '@/components/GroupCreation';
import { DiscoveryWorkspace } from '@/components/DiscoveryWorkspace';

type View = 'landing' | 'create' | 'workspace';

function App() {
  const [view, setView] = useState<View>('landing');
  const [group, setGroup] = useState<Group | null>(null);

  const handleStart = useCallback(() => setView('create'), []);
  const handleBackToLanding = useCallback(() => setView('landing'), []);

  const handleGroupComplete = useCallback((g: Group) => {
    setGroup(g);
    setView('workspace');
  }, []);

  const handleBackToGroup = useCallback(() => {
    setView('create');
  }, []);

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-ink-100 bg-ink-50/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <button
            onClick={() => setView('landing')}
            className="flex items-center gap-2 text-ink-900 hover:opacity-80 transition-opacity"
          >
            <Compass size={22} className="text-accent-600" />
            <span className="font-serif text-lg font-medium">CommonGround</span>
          </button>
          <nav className="flex items-center gap-4">
            {view !== 'landing' && (
              <button onClick={() => setView('landing')} className="text-sm text-ink-500 hover:text-ink-900 transition-colors">
                Home
              </button>
            )}
            {view === 'landing' && (
              <button onClick={handleStart} className="text-sm font-medium text-ink-700 hover:text-ink-900 transition-colors">
                Create a group
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main>
        {view === 'landing' && <Landing onStart={handleStart} />}
        {view === 'create' && (
          <GroupCreation onComplete={handleGroupComplete} onBack={handleBackToLanding} />
        )}
        {view === 'workspace' && group && (
          <DiscoveryWorkspace group={group} onBack={handleBackToGroup} />
        )}
        {view === 'workspace' && !group && (
          <div className="mx-auto max-w-md px-6 py-24 text-center">
            <p className="text-ink-500">No group found. Please create one first.</p>
            <button onClick={() => setView('create')} className="btn-primary mt-4">
              Create a group
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-ink-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center">
          <div className="flex items-center gap-2 text-ink-400">
            <Compass size={16} />
            <span className="text-sm">CommonGround</span>
          </div>
          <p className="text-xs text-ink-400">
            Powered by Qloo cultural intelligence · Discovery agent
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
