/**
 * Fair Mix Planner — a deterministic, transparent selection algorithm that
 * turns existing discovery results into a balanced shortlist of up to 5
 * recommendations.
 *
 * No additional Qloo requests are made. The planner works entirely from the
 * RankedCandidate and TasteBridgeCandidate data already in a DiscoveryOutcome.
 *
 * Selection priorities:
 *   1. Genuine Shared candidates (surfaced by 2+ member retrievals)
 *   2. Underrepresented members — candidates from members not yet in the plan
 *   3. Individual candidates that help include underrepresented members
 *   4. Taste Bridge candidates as group-profile discoveries
 *
 * All reasons are Fair Mix-derived, not Qloo explanations.
 */

import type { RankedCandidate, TasteBridgeCandidate, MemberRetrievalResult } from '@/types/discovery';
import type { Group } from '@/types/group';
import type { FairMixItem, FairMixEligibleItem, FairMixInput, FairMixPlan, FairMixSource } from '@/types/fair-mix';

const MAX_PLAN_SIZE = 5;

interface CandidateRow {
  key: string;
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
  category: string;
  city: string | null;
  metro: string | null;
  source: FairMixSource;
  memberIds: string[];
  memberNames: string[];
  memberAssociationVerified: boolean;
  consensusScore: number | null;
  /** Members helped by including this candidate who are not yet represented. */
  newMemberIds: string[];
  /** Sort priority: lower = higher priority. */
  priority: number;
  /** Tie-breaker: consensus score or affinity. */
  tieBreaker: number;
}

/**
 * Build the default Fair Mix shortlist from existing discovery results.
 * Does not make any Qloo requests.
 */
export function buildFairMixPlan(input: FairMixInput): FairMixPlan {
  const { rankedCandidates, tasteBridgeCandidates, tasteBridgeStatus, memberRetrievals, destination, group } = input;

  const failedMemberNames = memberRetrievals
    .filter((r) => r.status === 'failed')
    .map((r) => r.memberName);

  const tasteBridgeUnavailable = tasteBridgeStatus === 'failed' || tasteBridgeStatus === 'skipped';

  // Collect all eligible candidates as unified rows
  const rows: CandidateRow[] = [];

  for (const rc of rankedCandidates) {
    const memberIds = [...new Set(rc.evidence.map((e) => e.memberId))];
    const memberNames = [...new Set(rc.evidence.map((e) => e.memberName))];
    rows.push({
      key: rc.entityId,
      entityId: rc.entityId,
      name: rc.name,
      description: rc.description,
      image: rc.image,
      category: rc.category,
      city: rc.city,
      metro: rc.metro,
      source: rc.isShared ? 'shared' : 'individual',
      memberIds,
      memberNames,
      memberAssociationVerified: true,
      consensusScore: rc.consensusScore,
      newMemberIds: [],
      priority: 0,
      tieBreaker: rc.consensusScore,
    });
  }

  for (const tb of tasteBridgeCandidates) {
    // Only include Taste Bridge candidates not already in ranked candidates
    if (rows.some((r) => r.entityId === tb.entityId)) continue;
    rows.push({
      key: tb.entityId,
      entityId: tb.entityId,
      name: tb.name,
      description: tb.description,
      image: tb.image,
      category: tb.category,
      city: tb.city,
      metro: tb.metro,
      source: 'taste_bridge',
      memberIds: [],
      memberNames: [],
      memberAssociationVerified: false,
      consensusScore: null,
      newMemberIds: [],
      priority: 0,
      tieBreaker: tb.affinity ?? 0,
    });
  }

  // Deterministic selection
  const selected = selectRows(rows);
  const selectedKeys = new Set(selected.map((r) => r.key));

  const eligible: FairMixEligibleItem[] = rows.map((r) => ({
    key: r.key,
    entityId: r.entityId,
    name: r.name,
    source: r.source,
    memberIds: r.memberIds,
  }));

  const items: FairMixItem[] = selected.map((row, i) => ({
    key: row.key,
    entityId: row.entityId,
    name: row.name,
    description: row.description,
    image: row.image,
    category: row.category,
    city: row.city,
    metro: row.metro,
    source: row.source,
    memberIds: row.memberIds,
    memberNames: row.memberNames,
    memberAssociationVerified: row.memberAssociationVerified,
    selectionReason: buildSelectionReason(row, group),
    consensusScore: row.consensusScore,
    position: i + 1,
  }));

  const summary = buildPlanSummary(items, failedMemberNames, tasteBridgeUnavailable, destination);

  return {
    destination,
    items,
    removedKeys: [],
    eligible,
    failedMemberNames,
    tasteBridgeUnavailable,
    summary,
  };
}

/**
 * Deterministic selection algorithm.
 * Priority order:
 *   1. Shared candidates by consensus score (helps the most members)
 *   2. Candidates from underrepresented members
 *   3. Individual candidates by consensus score
 *   4. Taste Bridge candidates by affinity
 */
function selectRows(rows: CandidateRow[]): CandidateRow[] {
  if (rows.length === 0) return [];

  const selected: CandidateRow[] = [];
  const selectedKeys = new Set<string>();
  const representedMembers = new Set<string>();

  // Phase 1: Select Shared candidates by consensus score
  const shared = rows
    .filter((r) => r.source === 'shared')
    .sort((a, b) => b.tieBreaker - a.tieBreaker || a.name.localeCompare(b.name));

  for (const row of shared) {
    if (selected.length >= MAX_PLAN_SIZE) break;
    selected.push(row);
    selectedKeys.add(row.key);
    row.memberIds.forEach((id) => representedMembers.add(id));
  }

  // Phase 2: Fill with candidates that bring in underrepresented members
  // Re-evaluate remaining rows for new member coverage
  const remaining = rows.filter((r) => !selectedKeys.has(r.key));
  const withNewMembers = remaining
    .map((r) => {
      r.newMemberIds = r.memberIds.filter((id) => !representedMembers.has(id));
      // Priority: more new members first, then shared > individual > taste_bridge, then tieBreaker
      r.priority = r.newMemberIds.length === 0 ? 100 : -r.newMemberIds.length;
      if (r.source === 'shared') r.priority -= 0.5;
      else if (r.source === 'individual') r.priority -= 0.3;
      else r.priority -= 0.1;
      return r;
    })
    .sort((a, b) => a.priority - b.priority || b.tieBreaker - a.tieBreaker || a.name.localeCompare(b.name));

  for (const row of withNewMembers) {
    if (selected.length >= MAX_PLAN_SIZE) break;
    selected.push(row);
    selectedKeys.add(row.key);
    row.memberIds.forEach((id) => representedMembers.add(id));
  }

  // Phase 3: Fill remaining slots by best score, prioritizing source diversity
  if (selected.length < MAX_PLAN_SIZE) {
    const leftover = rows
      .filter((r) => !selectedKeys.has(r.key))
      .sort((a, b) => {
        // Prefer source diversity: deprioritize sources already well-represented
        const sourceCount = (src: FairMixSource) => selected.filter((s) => s.source === src).length;
        const aPenalty = sourceCount(a.source) * 0.2;
        const bPenalty = sourceCount(b.source) * 0.2;
        return (b.tieBreaker - bPenalty) - (a.tieBreaker - aPenalty) || a.name.localeCompare(b.name);
      });

    for (const row of leftover) {
      if (selected.length >= MAX_PLAN_SIZE) break;
      selected.push(row);
      selectedKeys.add(row.key);
    }
  }

  // Sort the final selection: shared first, then by member coverage, then by score
  selected.sort((a, b) => {
    if (a.source === 'shared' && b.source !== 'shared') return -1;
    if (b.source === 'shared' && a.source !== 'shared') return 1;
    if (a.memberIds.length !== b.memberIds.length) return b.memberIds.length - a.memberIds.length;
    return b.tieBreaker - a.tieBreaker || a.name.localeCompare(b.name);
  });

  return selected;
}

function buildSelectionReason(row: CandidateRow, group: Group): string {
  switch (row.source) {
    case 'shared': {
      const memberNames = row.memberNames;
      if (memberNames.length >= 2) {
        return `Surfaced by ${memberNames.length} member searches (${memberNames.join(', ')}). Fair Mix prioritizes genuine shared discoveries.`;
      }
      return 'Appeared in multiple member searches. Fair Mix prioritizes shared discoveries.';
    }
    case 'individual': {
      const memberName = row.memberNames[0] || 'a member';
      return `From ${memberName}'s individual retrieval. Fair Mix includes this to represent ${memberName} in the shortlist.`;
    }
    case 'taste_bridge': {
      if (row.memberAssociationVerified) {
        return 'Group-profile discovery from Taste Bridge with explainability linking it to specific members. Fair Mix includes it as a group-level suggestion.';
      }
      return 'Group-profile discovery from Taste Bridge. Fair Mix includes it as a suggestion for the whole group; individual member contributions are not confirmed.';
    }
  }
}

function buildPlanSummary(
  items: FairMixItem[],
  failedMemberNames: string[],
  tasteBridgeUnavailable: boolean,
  destination: string,
): string {
  const parts: string[] = [];
  const shared = items.filter((i) => i.source === 'shared').length;
  const individual = items.filter((i) => i.source === 'individual').length;
  const tb = items.filter((i) => i.source === 'taste_bridge').length;

  parts.push(`Fair Mix selected ${items.length} recommendation(s) for ${destination}.`);
  if (shared > 0) parts.push(`${shared} shared by multiple members.`);
  if (individual > 0) parts.push(`${individual} individual discovery included for representation.`);
  if (tb > 0) parts.push(`${tb} Taste Bridge group-profile discovery.`);

  if (failedMemberNames.length > 0) {
    parts.push(`Partial data: retrieval failed for ${failedMemberNames.join(', ')}.`);
  }
  if (tasteBridgeUnavailable) {
    parts.push('Taste Bridge results were unavailable.');
  }

  return parts.join(' ');
}

/**
 * Rebalance (regenerate) the plan from existing discovery data.
 * Does not make any Qloo requests. Preserves nothing from the previous plan.
 */
export function rebalanceFairMixPlan(input: FairMixInput): FairMixPlan {
  return buildFairMixPlan(input);
}

/**
 * Remove an item from the plan by key. Returns a new plan with the item
 * removed and added to removedKeys. Does not re-select replacements.
 */
export function removeFromFairMixPlan(plan: FairMixPlan, key: string): FairMixPlan {
  const items = plan.items.filter((i) => i.key !== key);
  const removedKeys = plan.removedKeys.includes(key)
    ? plan.removedKeys
    : [...plan.removedKeys, key];

  // Re-number positions
  const renumbered = items.map((item, i) => ({ ...item, position: i + 1 }));

  return {
    ...plan,
    items: renumbered,
    removedKeys,
  };
}

/**
 * Restore a previously removed item. The item is re-added at the end of the
 * list. Does not call Qloo.
 */
export function restoreToFairMixPlan(plan: FairMixPlan, input: FairMixInput, key: string): FairMixPlan {
  const eligible = input.rankedCandidates
    .map((rc) => ({ rc, source: rc.isShared ? 'shared' : 'individual' as FairMixSource }))
    .concat(
      input.tasteBridgeCandidates.map((tb) => ({
        rc: null as null,
        tb,
        source: 'taste_bridge' as FairMixSource,
      })),
    );

  // Find the item in eligible data
  for (const entry of eligible) {
    const entityId = entry.rc?.entityId ?? entry.tb?.entityId;
    if (entityId !== key) continue;

    if (entry.rc) {
      const memberIds = [...new Set(entry.rc.evidence.map((e) => e.memberId))];
      const memberNames = [...new Set(entry.rc.evidence.map((e) => e.memberName))];
      const item: FairMixItem = {
        key: entry.rc.entityId,
        entityId: entry.rc.entityId,
        name: entry.rc.name,
        description: entry.rc.description,
        image: entry.rc.image,
        category: entry.rc.category,
        city: entry.rc.city,
        metro: entry.rc.metro,
        source: entry.source,
        memberIds,
        memberNames,
        memberAssociationVerified: true,
        selectionReason: buildSelectionReason(
          {
            key: entry.rc.entityId,
            entityId: entry.rc.entityId,
            name: entry.rc.name,
            description: entry.rc.description,
            image: entry.rc.image,
            category: entry.rc.category,
            city: entry.rc.city,
            metro: entry.rc.metro,
            source: entry.source,
            memberIds,
            memberNames,
            memberAssociationVerified: true,
            consensusScore: entry.rc.consensusScore,
            newMemberIds: [],
            priority: 0,
            tieBreaker: entry.rc.consensusScore,
          },
          input.group,
        ),
        consensusScore: entry.rc.consensusScore,
        position: plan.items.length + 1,
      };
      const removedKeys = plan.removedKeys.filter((k) => k !== key);
      return {
        ...plan,
        items: [...plan.items, item].map((it, i) => ({ ...it, position: i + 1 })),
        removedKeys,
      };
    } else if (entry.tb) {
      const tb = entry.tb;
      const item: FairMixItem = {
        key: tb.entityId,
        entityId: tb.entityId,
        name: tb.name,
        description: tb.description,
        image: tb.image,
        category: tb.category,
        city: tb.city,
        metro: tb.metro,
        source: 'taste_bridge',
        memberIds: [],
        memberNames: [],
        memberAssociationVerified: false,
        selectionReason: 'Group-profile discovery from Taste Bridge. Restored by user.',
        consensusScore: null,
        position: plan.items.length + 1,
      };
      const removedKeys = plan.removedKeys.filter((k) => k !== key);
      return {
        ...plan,
        items: [...plan.items, item].map((it, i) => ({ ...it, position: i + 1 })),
        removedKeys,
      };
    }
  }

  return plan;
}

/**
 * Generate a plain-text summary suitable for clipboard copying.
 */
export function generatePlanSummaryText(plan: FairMixPlan): string {
  const lines: string[] = [];
  lines.push('CommonGround — Fair Mix Plan');
  lines.push(`Destination: ${plan.destination}`);
  lines.push('');

  plan.items.forEach((item) => {
    lines.push(`${item.position}. ${item.name}`);
    if (item.city) {
      lines.push(`   Location: ${item.city}${item.metro && item.metro !== item.city ? ` (${item.metro})` : ''}`);
    }
    const sourceLabel = sourceLabelFor(item.source);
    lines.push(`   Source: ${sourceLabel}`);
    if (item.memberAssociationVerified && item.memberNames.length > 0) {
      lines.push(`   Members: ${item.memberNames.join(', ')}`);
    }
    lines.push(`   Reason: ${item.selectionReason}`);
    lines.push('');
  });

  if (plan.failedMemberNames.length > 0) {
    lines.push(`Note: Retrieval failed for ${plan.failedMemberNames.join(', ')}. Plan is based on partial data.`);
  }
  if (plan.tasteBridgeUnavailable) {
    lines.push('Note: Taste Bridge results were unavailable.');
  }

  lines.push('');
  lines.push('These are suggestions to explore together, not unanimous group endorsements.');

  return lines.join('\n');
}

function sourceLabelFor(source: FairMixSource): string {
  switch (source) {
    case 'shared': return 'Shared (multiple members)';
    case 'individual': return 'Individual (single member)';
    case 'taste_bridge': return 'Taste Bridge (group profile)';
  }
}

export { sourceLabelFor };
