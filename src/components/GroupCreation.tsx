import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, X, ArrowRight, ArrowLeft, Users, Settings, Search, Check, MapPin } from 'lucide-react';
import type { Group, Member, BudgetLevel } from '@/types/group';
import { BUDGET_OPTIONS } from '@/types/group';
import type { CulturalInterest, CulturalCategory } from '@/types/cultural';
import { CULTURAL_CATEGORY_LABELS, SEARCHABLE_ENTITY_TYPES } from '@/types/cultural';
import type { QlooEntity } from '@/types/qloo';
import { StepIndicator, ErrorBanner, Spinner, ImageWithFallback } from '@/components/ui';
import { searchEntities } from '@/lib/qloo-client';


interface GroupCreationProps {
  onComplete: (group: Group) => void;
  onBack: () => void;
}

const STEPS = ['Group', 'Members', 'Destination', 'Review'];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function GroupCreation({ onComplete, onBack }: GroupCreationProps) {
  const [step, setStep] = useState(0);
  const [groupName, setGroupName] = useState('');
  const [destination, setDestination] = useState('');
  const [groupError, setGroupError] = useState('');
  const [members, setMembers] = useState<Member[]>([
    {
      id: generateId(),
      displayName: '',
      culturalInterests: [],
      exclusions: [],
      budgetPreference: null,
      accessibilityRequirements: [],
    },
  ]);

  function addMember() {
    setMembers((prev) => [
      ...prev,
      {
        id: generateId(),
        displayName: '',
        culturalInterests: [],
        exclusions: [],
        budgetPreference: null,
        accessibilityRequirements: [],
      },
    ]);
  }

  function removeMember(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function updateMember(id: string, updates: Partial<Member>) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }

  function handleNext() {
    if (step === 0) {
      if (!groupName.trim()) {
        setGroupError('Please give your group a name.');
        return;
      }
      setGroupError('');
      setStep(1);
    } else if (step === 1) {
      const validMembers = members.filter((m) => m.displayName.trim());
      if (validMembers.length < 2) {
        setGroupError('Add at least 2 members with names to continue.');
        return;
      }
      if (validMembers.some((m) => m.culturalInterests.length === 0)) {
        setGroupError('Each member needs at least one cultural interest.');
        return;
      }
      const hasResolved = validMembers.some((m) =>
        m.culturalInterests.some((ci) => ci.resolutionStatus === 'resolved' && ci.resolvedEntityId),
      );
      if (!hasResolved) {
        setGroupError('At least one interest must be resolved to a Qloo entity. Use the search to select a real entity.');
        return;
      }
      setGroupError('');
      setStep(2);
    } else if (step === 2) {
      if (!destination.trim()) {
        setGroupError('Please enter a destination city for local discovery.');
        return;
      }
      setGroupError('');
      setStep(3);
    } else {
      const now = new Date().toISOString();
      const group: Group = {
        id: generateId(),
        name: groupName.trim(),
        destination: destination.trim(),
        members: members.filter((m) => m.displayName.trim()),
        constraints: {
          maxTravelDistanceMiles: null,
          preferredDays: [],
          budgetLevel: null,
          groupSizeMin: null,
          groupSizeMax: null,
        },
        createdAt: now,
        updatedAt: now,
      };
      onComplete(group);
    }
  }

  function handleBack() {
    if (step === 0) {
      onBack();
    } else {
      setStep((s) => s - 1);
      setGroupError('');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-in">
      <div className="mb-8">
        <StepIndicator steps={STEPS} current={step} />
      </div>

      {groupError && <div className="mb-6"><ErrorBanner message={groupError} /></div>}

      {step === 0 && (
        <div className="animate-slide-up">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-ink-50">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-medium text-ink-900">Name your group</h2>
              <p className="text-sm text-ink-500">What should we call this group?</p>
            </div>
          </div>
          <div className="card">
            <label className="label" htmlFor="group-name">Group name</label>
            <input
              id="group-name"
              className="input-field"
              placeholder="e.g. Friday Night Crew, The Culture Club..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="animate-slide-up">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-ink-50">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-medium text-ink-900">Add members & interests</h2>
              <p className="text-sm text-ink-500">Each person lists what they're into.</p>
            </div>
          </div>
          <div className="space-y-6">
            {members.map((member, idx) => (
              <MemberCard
                key={member.id}
                member={member}
                index={idx}
                canRemove={members.length > 1}
                onUpdate={(updates) => updateMember(member.id, updates)}
                onRemove={() => removeMember(member.id)}
              />
            ))}
          </div>
          <button onClick={addMember} className="btn-secondary mt-6 w-full">
            <Plus size={18} /> Add another member
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-slide-up">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-ink-50">
              <MapPin size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-medium text-ink-900">Where are you going?</h2>
              <p className="text-sm text-ink-500">We'll search for places in this city or area.</p>
            </div>
          </div>
          <div className="card">
            <label className="label" htmlFor="destination">Destination city or area</label>
            <input
              id="destination"
              className="input-field"
              placeholder="e.g. New York, London, Tokyo..."
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              maxLength={80}
              autoFocus
            />
            <p className="mt-3 text-xs text-ink-400">
              This is where Qloo will look for places to recommend. Without a destination,
              results come from anywhere in the world.
            </p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-slide-up">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-ink-50">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-medium text-ink-900">Review your group</h2>
              <p className="text-sm text-ink-500">Does everything look right?</p>
            </div>
          </div>
          <div className="card">
            <h3 className="text-xl font-medium text-ink-900">{groupName}</h3>
            <div className="mt-2 flex items-center gap-2 text-sm text-ink-500">
              <MapPin size={14} /> {destination}
              <span className="text-ink-300">·</span>
              {members.filter((m) => m.displayName.trim()).length} members
            </div>
            <div className="mt-6 space-y-4">
              {members.filter((m) => m.displayName.trim()).map((m) => (
                <div key={m.id} className="rounded-lg border border-ink-100 p-4">
                  <p className="font-medium text-ink-900">{m.displayName}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.culturalInterests.map((interest) => (
                      <span key={interest.id} className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-600">
                        {interest.displayName || interest.originalInput}
                        {interest.category && ` · ${CULTURAL_CATEGORY_LABELS[interest.category] || interest.category}`}
                        {interest.resolutionStatus === 'resolved' && (
                          <span className="text-accent-600" title="Resolved via Qloo"> ●</span>
                        )}
                        {interest.resolutionStatus === 'unresolved' && (
                          <span className="text-ink-300" title="Not resolved via Qloo"> ○</span>
                        )}
                      </span>
                    ))}
                  </div>
                  {m.budgetPreference && (
                    <p className="mt-2 text-xs text-ink-400">Budget: {m.budgetPreference}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button onClick={handleBack} className="btn-secondary">
          <ArrowLeft size={18} /> Back
        </button>
        <button onClick={handleNext} className="btn-primary">
          {step === 3 ? 'Create group' : 'Continue'}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ─── Search results type ────────────────────────────────────────────

interface SearchResult {
  entity: QlooEntity;
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
  category: string | null;
}

function parseSearchResult(entity: QlooEntity): SearchResult {
  const entityId = entity.entity_id || entity.id || '';
  return {
    entity,
    entityId,
    name: entity.name || entity.properties?.name || 'Unknown',
    description: entity.properties?.short_description || entity.description || entity.properties?.description || null,
    image: entity.properties?.images?.[0]?.url || entity.properties?.image?.url || entity.image || null,
    category: entity.type || entity.subtype || null,
  };
}

function formatSearchError(kind: string, message: string): string {
  switch (kind) {
    case 'auth_failure':
      return 'Qloo rejected the API key. Contact an administrator.';
    case 'rate_limit':
      return 'Rate limit reached. Please wait a moment and try again.';
    case 'network':
      return `Could not reach Qloo: ${message}`;
    case 'missing_config':
      return 'Qloo API key is not configured on the server.';
    default:
      return message;
  }
}

// ─── MemberCard ─────────────────────────────────────────────────────

interface MemberCardProps {
  member: Member;
  index: number;
  canRemove: boolean;
  onUpdate: (updates: Partial<Member>) => void;
  onRemove: () => void;
}

function MemberCard({ member, index, canRemove, onUpdate, onRemove }: MemberCardProps) {
  const [interestInput, setInterestInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CulturalCategory | ''>('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  // Clear just-added highlight after a moment
  useEffect(() => {
    if (justAddedId) {
      const t = setTimeout(() => setJustAddedId(null), 1500);
      return () => clearTimeout(t);
    }
  }, [justAddedId]);

  const doSearch = useCallback(async (query: string, category: CulturalCategory | '') => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    const seq = ++searchSeqRef.current;
    setSearching(true);
    setSearchError('');
    setHasSearched(false);

    const types = category ? [category] : undefined;
    const result = await searchEntities(trimmed, types, 8);

    // Stale response guard: ignore if a newer search has been issued
    if (seq !== searchSeqRef.current) return;

    setSearching(false);
    setHasSearched(true);

    if (result.success) {
      setSearchResults(result.data.map(parseSearchResult));
    } else {
      setSearchResults([]);
      setSearchError(formatSearchError(result.error.kind, result.error.message));
    }
  }, []);

  // Debounced search on input change
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInterestInput(value);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!value.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError('');
      return;
    }

    debounceTimer.current = setTimeout(() => {
      doSearch(value, selectedCategory);
    }, 350);
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newCategory = e.target.value as CulturalCategory | '';
    setSelectedCategory(newCategory);
    // Re-search with new category if there's an existing query
    if (interestInput.trim()) {
      doSearch(interestInput, newCategory);
    }
  }

  function handleSearchSubmit() {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    doSearch(interestInput, selectedCategory);
  }

  function handleSelectResult(result: SearchResult) {
    const entityId = result.entityId;
    if (!entityId) return;

    // Prevent duplicates by entity_id
    const existing = member.culturalInterests.some(
      (ci) => ci.resolvedEntityId === entityId,
    );
    if (existing) {
      setJustAddedId(entityId);
      return;
    }

    const interest: CulturalInterest = {
      id: generateId(),
      originalInput: interestInput.trim(),
      resolvedEntityId: entityId,
      category: (result.category as CulturalCategory) || selectedCategory || null,
      resolutionStatus: 'resolved' as const,
      displayName: result.name,
    };

    onUpdate({
      culturalInterests: [...member.culturalInterests, interest],
    });

    setJustAddedId(entityId);
    setInterestInput('');
    setSearchResults([]);
    setHasSearched(false);
  }

  // Allow adding a custom (unresolved) interest if no Qloo match found
  function handleAddCustom() {
    const trimmed = interestInput.trim();
    if (!trimmed) return;

    // Prevent duplicates by display name within the same member
    const existing = member.culturalInterests.some(
      (ci) => ci.displayName?.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return;

    const interest: CulturalInterest = {
      id: generateId(),
      originalInput: trimmed,
      resolvedEntityId: null,
      category: selectedCategory || null,
      resolutionStatus: 'unresolved' as const,
      displayName: trimmed,
    };

    onUpdate({
      culturalInterests: [...member.culturalInterests, interest],
    });

    setJustAddedId(interest.id);
    setInterestInput('');
    setSearchResults([]);
    setHasSearched(false);
  }

  function removeInterest(id: string) {
    onUpdate({
      culturalInterests: member.culturalInterests.filter((ci) => ci.id !== id),
    });
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleSelectResult(searchResults[0]);
      } else if (interestInput.trim() && !searching) {
        handleAddCustom();
      }
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-ink-900">
          Member {index + 1}
          {member.displayName && <span className="text-ink-400 font-normal"> · {member.displayName}</span>}
        </h3>
        {canRemove && (
          <button onClick={onRemove} className="text-ink-400 hover:text-red-500 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="mt-4">
        <label className="label" htmlFor={`name-${member.id}`}>Display name</label>
        <input
          id={`name-${member.id}`}
          className="input-field"
          placeholder="e.g. Maya, James, Priya..."
          value={member.displayName}
          onChange={(e) => onUpdate({ displayName: e.target.value })}
          maxLength={40}
        />
      </div>

      <div className="mt-4">
        <label className="label">Search for cultural interests</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            className="input-field sm:w-40"
            value={selectedCategory}
            onChange={handleCategoryChange}
          >
            <option value="">Any category</option>
            {SEARCHABLE_ENTITY_TYPES.map((cat) => (
              <option key={cat} value={cat}>
                {CULTURAL_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
          <div className="flex flex-1 gap-2">
            <input
              className="input-field flex-1"
              placeholder="e.g. Miles Davis, Studio Ghibli, jazz..."
              value={interestInput}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              aria-label="Search for cultural interests"
            />
            <button
              onClick={handleSearchSubmit}
              className="btn-secondary px-4"
              disabled={!interestInput.trim() || searching}
              aria-label="Search Qloo"
            >
              <Search size={16} />
            </button>
          </div>
        </div>

        {/* Loading state */}
        {searching && (
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-400">
            <Spinner size={14} /> Searching Qloo for "{interestInput.trim()}"...
          </div>
        )}

        {/* Error state */}
        {searchError && !searching && (
          <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <p className="text-xs text-yellow-800">{searchError}</p>
            <button
              onClick={handleAddCustom}
              className="mt-2 text-xs font-medium text-yellow-700 underline hover:text-yellow-800"
            >
              Add "{interestInput.trim()}" as an unresolved interest
            </button>
          </div>
        )}

        {/* Search results list */}
        {!searching && searchResults.length > 0 && (
          <div className="mt-3 rounded-lg border border-ink-100 overflow-hidden">
            <div className="border-b border-ink-100 bg-ink-50 px-3 py-2 text-xs font-medium text-ink-500">
              {searchResults.length} result{searchResults.length > 1 ? 's' : ''} from Qloo — click to add
            </div>
            <div className="divide-y divide-ink-100 max-h-72 overflow-y-auto">
              {searchResults.map((result, i) => {
                const isAdded = member.culturalInterests.some(
                  (ci) => ci.resolvedEntityId === result.entityId,
                );
                return (
                  <button
                    key={result.entityId || i}
                    onClick={() => handleSelectResult(result)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-ocean-50 transition-colors focus:bg-ocean-50 focus:outline-none"
                  >
                    <ImageWithFallback
                      src={result.image}
                      alt={result.name}
                      category={result.category}
                      className="h-10 w-10 shrink-0"
                      rounded="rounded-lg"
                      iconSize={16}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-900 truncate">{result.name}</p>
                      {result.description && (
                        <p className="text-xs text-ink-400 truncate">{result.description}</p>
                      )}
                      {result.category && (
                        <p className="text-xs text-ink-300 mt-0.5">
                          {CULTURAL_CATEGORY_LABELS[result.category] || result.category}
                        </p>
                      )}
                    </div>
                    {isAdded ? (
                      <span className="flex items-center gap-1 text-xs text-accent-600 shrink-0">
                        <Check size={14} /> Added
                      </span>
                    ) : (
                      <Plus size={16} className="text-ink-300 shrink-0 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty results state */}
        {!searching && hasSearched && searchResults.length === 0 && !searchError && (
          <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50 p-4 text-center">
            <p className="text-sm text-ink-500">No Qloo results for "{interestInput.trim()}"</p>
            <button
              onClick={handleAddCustom}
              className="mt-2 text-xs font-medium text-ink-600 underline hover:text-ink-700"
            >
              Add "{interestInput.trim()}" as an unresolved interest
            </button>
          </div>
        )}

        {/* Saved interests */}
        {member.culturalInterests.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-ink-500 mb-2">
              Saved interests ({member.culturalInterests.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {member.culturalInterests.map((interest) => (
                <span
                  key={interest.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs animate-slide-in transition-colors ${
                    justAddedId === interest.resolvedEntityId || justAddedId === interest.id
                      ? 'bg-accent-100 text-accent-700 ring-1 ring-accent-300'
                      : 'bg-ink-100 text-ink-600'
                  }`}
                >
                  {interest.displayName || interest.originalInput}
                  {interest.category && (
                    <span className="text-ink-400">· {CULTURAL_CATEGORY_LABELS[interest.category] || ''}</span>
                  )}
                  {interest.resolutionStatus === 'resolved' && (
                    <span className="text-accent-600" title="Resolved via Qloo">●</span>
                  )}
                  {interest.resolutionStatus === 'unresolved' && (
                    <span className="text-ink-300" title="Not resolved via Qloo">○</span>
                  )}
                  <button
                    onClick={() => removeInterest(interest.id)}
                    className="text-ink-400 hover:text-red-500 transition-colors"
                    aria-label={`Remove ${interest.displayName || interest.originalInput}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Budget preference</label>
          <select
            className="input-field"
            value={member.budgetPreference || ''}
            onChange={(e) => onUpdate({ budgetPreference: (e.target.value || null) as BudgetLevel | null })}
          >
            <option value="">No preference</option>
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Accessibility needs</label>
          <input
            className="input-field"
            placeholder="e.g. wheelchair access, subtitles..."
            value={member.accessibilityRequirements.join(', ')}
            onChange={(e) =>
              onUpdate({
                accessibilityRequirements: e.target.value
                  ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  : [],
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
