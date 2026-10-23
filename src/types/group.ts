/**
 * Group and member domain models.
 */

import type { CulturalInterest } from './cultural';

export interface Member {
  id: string;
  displayName: string;
  culturalInterests: CulturalInterest[];
  exclusions: string[];
  budgetPreference: BudgetLevel | null;
  accessibilityRequirements: string[];
}

export type BudgetLevel = 'free' | 'low' | 'moderate' | 'premium';

export interface GroupConstraints {
  maxTravelDistanceMiles: number | null;
  preferredDays: string[];
  budgetLevel: BudgetLevel | null;
  groupSizeMin: number | null;
  groupSizeMax: number | null;
}

export interface Group {
  id: string;
  name: string;
  destination: string | null;
  members: Member[];
  constraints: GroupConstraints;
  createdAt: string;
  updatedAt: string;
}

export const BUDGET_LABELS: Record<BudgetLevel, string> = {
  free: 'Free',
  low: 'Under $25',
  moderate: '$25–75',
  premium: '$75+',
};

export const BUDGET_OPTIONS: { value: BudgetLevel; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'low', label: 'Under $25' },
  { value: 'moderate', label: '$25–75' },
  { value: 'premium', label: '$75+' },
];
