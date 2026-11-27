export type UserRole = 'freelancer' | 'business' | 'admin';

export type AccountStatus = 'active' | 'suspended';

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  status: AccountStatus;
  onboardingCompleted: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface FreelancerProfile {
  uid: string;
  fullName: string;
  photoURL?: string;
  headline: string;
  description?: string;
  skills: string[];
  services: string[];
  experienceLevel: 'Beginner' | 'Intermediate' | 'Senior' | 'Agency';
  portfolioLinks?: string[];
  website?: string;
  country: string;
  state: string;
  city: string;
  workPreference: 'Remote' | 'On-site' | 'Hybrid' | 'Any';
  minBudget?: number;
  preferredIndustries?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface BusinessProfile {
  uid: string;
  companyName: string;
  industry: string;
  description?: string;
  website?: string;
  country: string;
  state: string;
  city: string;
  logoURL?: string;
  size: 'Solo' | '2-10' | '11-50' | '51-200' | '200+';
  createdAt?: any;
  updatedAt?: any;
}

export interface BusinessLead {
  id: string;
  ownerId?: string;
  businessName: string;
  category: string;
  location: string;
  address?: string;
  country?: string;
  state?: string;
  city?: string;
  area?: string;
  website?: string;
  publicPhone?: string;
  publicEmail?: string;
  emailVerificationStatus?: 'verified' | 'unverified' | 'unknown';
  instagramUrl?: string;
  linkedinUrl?: string;
  rating?: number;
  reviewCount?: number;
  source: string;
  sourceUrl?: string;
  providerId?: string;
  latitude?: number;
  longitude?: number;
  hasWebsite: boolean;
  hasInstagram: boolean;
  opportunityScore: number;
  confidenceScore: number;
  suggestedServices: string[];
  aiExplanation: string;
  possibleDuplicate?: boolean;
  duplicateReason?: string;
  isDemo: boolean;
  status: 'active' | 'archived' | 'flagged';
  discoveredAt: string;
  lastVerifiedAt?: string;
}

export type HiringClassification =
  | 'Freelance Project'
  | 'Contract Work'
  | 'Full-Time Job'
  | 'Part-Time Job'
  | 'Internship'
  | 'Agency Requirement'
  | 'Irrelevant Content';

export interface HiringOpportunity {
  id: string;
  ownerId?: string;
  title: string;
  originalText: string;
  companyName?: string;
  requiredService?: string;
  skillsRequired: string[];
  budget?: string;
  location?: string;
  workMode?: string;
  deadline?: string;
  publishedAt?: string;
  sourceName: string;
  sourceUrl: string;
  aiClassification: HiringClassification;
  confidenceScore: number;
  isDemo: boolean;
  discoveredAt: string;
}

export interface ScoreFactor {
  factor: string;
  points: number;
  maxPoints: number;
  evidence: string;
}

export interface LeadAnalysis {
  id?: string;
  ownerId?: string;
  leadId: string;
  businessName: string;
  onlinePresenceSummary: string;
  contentObservations: string;
  improvementAreas: string[];
  potentialOpportunities: string[];
  aiRecommendation: string;
  opportunityScore: number;
  confidenceScore: number;
  scoreBreakdown?: ScoreFactor[];
  verifiedFacts?: string[];
  evidence: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface SavedLead {
  id: string;
  ownerId: string;
  leadId: string;
  businessName: string;
  category: string;
  location: string;
  website?: string;
  publicPhone?: string;
  publicEmail?: string;
  source: string;
  sourceUrl?: string;
  opportunityScore?: number;
  suggestedServices?: string[];
  notes?: string;
  isDemo?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export type CrmStatus =
  | 'New'
  | 'Interested'
  | 'Saved'
  | 'Contacted'
  | 'Replied'
  | 'Negotiating'
  | 'Converted'
  | 'Not Interested'
  | 'Closed';

export const CRM_STATUSES: CrmStatus[] = [
  'New',
  'Interested',
  'Saved',
  'Contacted',
  'Replied',
  'Negotiating',
  'Converted',
  'Not Interested',
  'Closed',
];

export interface CrmPipelineItem {
  id: string;
  ownerId: string;
  leadId?: string;
  businessName: string;
  category?: string;
  location?: string;
  source?: string;
  status: CrmStatus;
  estimatedValue: number;
  followUpDate?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CrmActivity {
  id: string;
  ownerId: string;
  crmId: string;
  channel: 'Email' | 'Instagram DM' | 'LinkedIn' | 'WhatsApp' | 'Call' | 'Note';
  summary: string;
  createdAt?: any;
}

export type PitchChannel = 'Email' | 'Instagram DM' | 'LinkedIn' | 'WhatsApp';
export type PitchTone =
  | 'Professional'
  | 'Friendly'
  | 'Short and Direct'
  | 'Personalized'
  | 'Persuasive but Respectful';

export interface PitchDraft {
  id: string;
  ownerId: string;
  targetName: string;
  channel: PitchChannel;
  tone: PitchTone;
  subject?: string;
  body: string;
  serviceOffered?: string;
  createdAt?: any;
  updatedAt?: any;
}

export type ProjectStatus = 'Draft' | 'Published' | 'Paused' | 'Closed' | 'Completed';

export interface MarketplaceProject {
  id: string;
  businessId: string;
  companyName: string;
  title: string;
  description: string;
  category: string;
  requiredSkills: string[];
  budgetMin: number;
  budgetMax: number;
  currency: 'INR' | 'USD';
  deadline?: string;
  experienceLevel?: 'Beginner' | 'Intermediate' | 'Senior' | 'Any';
  location?: string;
  workMode: 'Remote' | 'On-site' | 'Hybrid';
  projectType: 'Fixed Price' | 'Hourly' | 'Retainer';
  status: ProjectStatus;
  createdAt?: any;
  updatedAt?: any;
}

export type ProposalStatus =
  | 'Submitted'
  | 'Viewed'
  | 'Shortlisted'
  | 'Accepted'
  | 'Rejected'
  | 'Withdrawn';

export interface ProjectProposal {
  id: string;
  projectId: string;
  projectTitle: string;
  businessId: string;
  freelancerId: string;
  freelancerName: string;
  coverLetter: string;
  portfolioLink?: string;
  proposedPrice: number;
  currency: 'INR' | 'USD';
  deliveryDays: number;
  relevantExperience?: string;
  status: ProposalStatus;
  createdAt?: any;
  updatedAt?: any;
}

export interface Conversation {
  id: string;
  businessId: string;
  freelancerId: string;
  businessName: string;
  freelancerName: string;
  projectId?: string;
  projectTitle?: string;
  lastMessage: string;
  lastSenderId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ConversationMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt?: any;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'application' | 'proposal' | 'message' | 'project' | 'followup' | 'opportunity';
  title: string;
  message: string;
  read: boolean;
  createdAt?: any;
}

export interface NotificationPreference {
  userId: string;
  newApplications: boolean;
  proposalUpdates: boolean;
  messages: boolean;
  followUpReminders: boolean;
  opportunityAlerts: boolean;
  updatedAt?: any;
}

export interface AbuseReport {
  id: string;
  reporterId: string;
  targetType: 'lead' | 'opportunity' | 'project' | 'user';
  targetId: string;
  reason: string;
  details?: string;
  status: 'open' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt?: any;
  updatedAt?: any;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: string;
  createdAt?: any;
}

export type ProviderId =
  | 'scrapingdog'
  | 'gemini'
  | 'openstreetmap'
  | 'foursquare'
  | 'hunter'
  | 'brave';

export interface ProviderHealth {
  id: ProviderId;
  name: string;
  role: 'Primary Discovery' | 'AI Intelligence' | 'Geo & Maps' | 'Supplementary';
  enabled: boolean;
  configured: boolean;
  requiredEnvKey: string;
  requestsMade: number;
  successfulRequests: number;
  failedRequests: number;
  creditsConsumed: number;
  dailyQuotaLimit: number;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  description: string;
}

export interface AiTelemetryEntry {
  id: string;
  task: 'classify' | 'analyze' | 'pitch';
  target: string;
  confidenceScore?: number;
  success: boolean;
  error?: string;
  timestamp: string;
}
