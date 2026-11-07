/** Presentation types for the study export. */
export interface StudyAccount {
  limitations?: string[];
  name: string;
  platform: string | null;
  averageViews: number | null;
  medianViews: number | null;
  engagementRate: number | null;
  postsPerWeek: number | null;
}
export interface StudyAnalysis {
  id: string;
  status: string;
  createdAt: string | null;
  warnings: string[];
  consumption: string | null;
}
export interface StudyItem {
  measurements?: { label: string; value: string }[];
  status?: string | null;
  limitations?: string[];
  id: string;
  title: string;
  description: string | null;
  hypothesis: string | null;
  action: string | null;
  effort: string | null;
  outcomeMeasure: string | null;
  sourceIds: string[];
}
export interface StudySource {
  platform?: string | null;
  handle?: string | null;
  views?: number | null;
  format?: string | null;
  observedAt?: string | null;
  id: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
}
export interface StudyData {
  periods?: { label: string; startAt: string | null; endAt: string | null }[];
  selectionBasis: string | null;
  createdAt: string | null;
  analyses: StudyAnalysis[];
  ownAccounts: StudyAccount[];
  competitorAccounts: StudyAccount[];
  peerComparison: StudyItem[];
  coverage: string[];
  trends: StudyItem[];
  viralCandidates: StudyItem[];
  repeatableFormats: StudyItem[];
  productOpportunities: StudyItem[];
  actions: StudyItem[];
  sources: StudySource[];
}
