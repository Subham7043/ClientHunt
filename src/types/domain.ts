export type UserRole = 'student' | 'freelancer' | 'business' | 'admin';

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

export interface StudentProfile {
  uid: string;
  fullName: string;
  photoURL?: string;
  educationLevel:
    | 'High School'
    | 'Diploma / Vocational'
    | 'Undergraduate'
    | 'Postgraduate'
    | 'PhD / Doctoral'
    | 'Postdoctoral';
  degree: string;
  course: string;
  specialization?: string;
  country: string;
  state: string;
  city?: string;
  institution: string;
  academicScore?: string;
  graduationYear: string;
  incomeRange?: string;
  interests?: string[];
  preferredFunding?: 'Any' | 'Full Funding' | 'Partial Funding';
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
  locality?: string;
  website?: string;
  publicPhone?: string;
  publicEmail?: string;
  emailVerificationStatus?: 'verified' | 'unverified' | 'unknown';
  instagramUrl?: string;
  linkedinUrl?: string;
  rating?: number;
  reviewCount?: number;
  openingHours?: string[];
  businessSize?: string;
  placesEnriched?: boolean;
  placesEnrichedAt?: string;
  dataId?: string;
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

export type JobSourceProvider = 'Google Jobs' | 'LinkedIn Jobs' | 'Other Existing Source';
export type JobWorkMode = 'Remote' | 'Hybrid' | 'On-site' | 'Not specified';
export type JobEmploymentType =
  | 'Full-time'
  | 'Part-time'
  | 'Contract'
  | 'Internship'
  | 'Freelance'
  | 'Not specified';

export interface JobListing {
  id: string;
  ownerId?: string;
  externalJobId?: string;
  title: string;
  company: string;
  description: string;
  requirements: string[];
  skills: string[];
  category?: string;
  location: string;
  country: string;
  state?: string;
  city?: string;
  employmentType: JobEmploymentType;
  workMode: JobWorkMode;
  experienceLevel?: string;
  salary: string;
  currency?: string;
  postedDate: string;
  deadline: string;
  sourceProvider: JobSourceProvider;
  originalUrl: string;
  applicationUrl: string;
  lastVerifiedAt: string;
  status: 'active' | 'expired' | 'removed' | 'flagged';
  possibleDuplicate?: boolean;
  duplicateReason?: string;
  isDemo: boolean;
}

export interface JobMatchAnalysis {
  jobId: string;
  overallScore: number;
  skillMatchScore: number;
  experienceMatchScore: number;
  locationCompatibility: string;
  employmentTypeCompatibility: string;
  matchingSkills: string[];
  missingSkills: string[];
  reasonsForRecommendation: string[];
  disclaimer: string;
}

export interface SavedJob {
  id: string;
  ownerId: string;
  jobId: string;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  workMode: string;
  salary: string;
  sourceProvider: string;
  originalUrl: string;
  applicationUrl: string;
  skills: string[];
  notes?: string;
  isDemo?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface JobApplication {
  id: string;
  ownerId: string;
  jobId: string;
  title: string;
  company: string;
  sourceProvider: string;
  applicationUrl: string;
  status: 'Draft' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected' | 'Withdrawn';
  coverLetterDraft?: string;
  appliedDate?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface JobAlert {
  id: string;
  ownerId: string;
  keywords: string;
  category?: string;
  country: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export type ScholarshipSourceType =
  | 'Official Government Portal'
  | 'Official Scholarship Provider'
  | 'Official University Source'
  | 'Secondary Source'
  | 'Unverified Source';

export type ScholarshipVerificationStatus =
  | 'Verified'
  | 'Pending Review'
  | 'Unverified'
  | 'Rejected';

export type ScholarshipFundingType =
  | 'Full Funding'
  | 'Partial Funding'
  | 'Tuition Waiver'
  | 'Stipend / Grant'
  | 'Not specified';

export type ScholarshipStatus = 'Open' | 'Upcoming' | 'Closed' | 'Expired';

export interface ScholarshipRecord {
  id: string;
  ownerId?: string;
  title: string;
  provider: string;
  description: string;
  category:
    | 'Government'
    | 'Private'
    | 'University'
    | 'International'
    | 'Fellowship & Grant'
    | 'Research'
    | 'Merit-based'
    | 'Need-based'
    | 'Minority & Category';
  country: string;
  state: string;
  city?: string;
  eligibleLocations: string[];
  educationLevels: string[];
  degrees: string[];
  courses: string[];
  subjects: string[];
  academicRequirements: string;
  financialRequirements: string;
  otherEligibilityCriteria: string;
  amount: string;
  currency: string;
  fundingType: ScholarshipFundingType;
  benefits: string[];
  startDate: string;
  deadline: string;
  academicYear?: string;
  requiredDocuments: string[];
  applicationInstructions: string;
  officialApplicationUrl: string;
  sourceUrl: string;
  sourceType: ScholarshipSourceType;
  sourceVerificationStatus: ScholarshipVerificationStatus;
  publicationDate: string;
  lastVerifiedAt: string;
  status: ScholarshipStatus;
  verifiedFacts?: string[];
  aiMatchReason?: string;
  possibleDuplicate?: boolean;
  duplicateReason?: string;
  isDemo: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export type EligibilityVerdict =
  | 'Eligible'
  | 'Potentially Eligible'
  | 'Not Eligible'
  | 'Insufficient Information';

export interface ScholarshipEligibilityResult {
  scholarshipId: string;
  scholarshipTitle: string;
  verdict: EligibilityVerdict;
  matchScore: number;
  scoreBreakdown: ScoreFactor[];
  matchingCriteria: string[];
  unmatchedCriteria: string[];
  missingInformation: string[];
  importantConditions: string[];
  requiredDocuments: string[];
  reason: string;
  officialSourceReference: string;
  disclaimer: string;
}

export type ScholarshipApplicationStatus =
  | 'Interested'
  | 'Saved'
  | 'Eligibility Checking'
  | 'Preparing Documents'
  | 'Ready to Apply'
  | 'Applied'
  | 'Under Review'
  | 'Selected'
  | 'Rejected'
  | 'Expired';

export const SCHOLARSHIP_APPLICATION_STATUSES: ScholarshipApplicationStatus[] = [
  'Interested',
  'Saved',
  'Eligibility Checking',
  'Preparing Documents',
  'Ready to Apply',
  'Applied',
  'Under Review',
  'Selected',
  'Rejected',
  'Expired',
];

export interface SavedScholarship {
  id: string;
  ownerId: string;
  scholarshipId: string;
  title: string;
  provider: string;
  category: string;
  country: string;
  amount: string;
  fundingType: string;
  deadline: string;
  officialApplicationUrl: string;
  sourceType: ScholarshipSourceType;
  sourceVerificationStatus: ScholarshipVerificationStatus;
  notes?: string;
  isDemo?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface ScholarshipApplication {
  id: string;
  ownerId: string;
  scholarshipId: string;
  title: string;
  provider: string;
  deadline: string;
  officialApplicationUrl: string;
  status: ScholarshipApplicationStatus;
  applicationDate?: string;
  referenceNumber?: string;
  reminderDate?: string;
  notes?: string;
  documentNames?: string[];
  statusHistory?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface ScholarshipReminder {
  id: string;
  ownerId: string;
  scholarshipId: string;
  scholarshipTitle: string;
  reminderDate: string;
  deadline: string;
  note?: string;
  completed: boolean;
  createdAt?: any;
}

export interface EducationInstitution {
  id: string;
  name: string;
  category: string;
  address?: string;
  city: string;
  country: string;
  website?: string;
  source: string;
  sourceUrl?: string;
  rating?: number;
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
  type:
    | 'application'
    | 'proposal'
    | 'message'
    | 'project'
    | 'followup'
    | 'opportunity'
    | 'scholarship'
    | 'job'
    | 'deadline';
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
  targetType: 'lead' | 'opportunity' | 'project' | 'user' | 'job' | 'scholarship';
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
  | 'google_maps_search'
  | 'google_maps_places'
  | 'google_jobs'
  | 'linkedin_jobs'
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
  estimatedCreditsConsumed?: number;
  confirmedCreditsRemaining?: number | null;
  costNote?: string;
  dailyQuotaLimit: number;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  description: string;
}

export interface FailedRequestLog {
  id: string;
  providerId: ProviderId;
  providerName: string;
  endpoint: string;
  error: string;
  timestamp: string;
}

export interface AiTelemetryEntry {
  id: string;
  task:
    | 'classify'
    | 'analyze'
    | 'pitch'
    | 'scholarship_nlq'
    | 'scholarship_extract'
    | 'scholarship_eligibility'
    | 'job_match'
    | 'job_draft';
  target: string;
  confidenceScore?: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

