import { GoogleGenAI, Type } from '@google/genai';
import type {
  AiTelemetryEntry,
  BusinessLead,
  FreelancerProfile,
  HiringClassification,
  JobListing,
  JobMatchAnalysis,
  LeadAnalysis,
  PitchChannel,
  PitchTone,
  ScholarshipEligibilityResult,
  ScholarshipRecord,
  ScholarshipSourceType,
  StudentProfile,
} from '../src/types/domain.ts';
import { isProviderEnabled, recordProviderUsage } from './providers/types.ts';

const aiTelemetryLog: AiTelemetryEntry[] = [];

function pushTelemetry(entry: AiTelemetryEntry): void {
  aiTelemetryLog.unshift(entry);
  if (aiTelemetryLog.length > 80) {
    aiTelemetryLog.length = 80;
  }
}

export function getAiTelemetry(): AiTelemetryEntry[] {
  return [...aiTelemetryLog];
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function classifyHiringPosts(
  items: Array<{ title: string; snippet: string; link: string; sourceName: string }>
): Promise<
  Array<{
    title: string;
    companyName: string | null;
    requiredService: string;
    skillsRequired: string[];
    budget: string | null;
    location: string | null;
    workMode: string | null;
    deadline: string | null;
    aiClassification: HiringClassification;
    confidenceScore: number;
  }>
> {
  if (!isProviderEnabled('gemini')) {
    throw new Error('Gemini AI provider is disabled by admin.');
  }
  const ai = getGeminiClient();

  const prompt = `You are a strict hiring-intent classifier for a freelance platform.
Analyze each search result below and classify whether it represents genuine freelance/contract hiring or a permanent job/internship/irrelevant post.
CRITICAL RULES:
- NEVER invent a budget, deadline, location, or company name. Return null if not explicitly present in the text.
- Separate freelance projects and contract work from full-time jobs, part-time jobs, internships, agency requirements, and irrelevant content.
- Assign a calibrated confidenceScore between 0 and 100.

Items to classify:
${JSON.stringify(items.map((it, i) => ({ index: i, title: it.title, text: it.snippet, source: it.sourceName })))}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              companyName: { type: Type.STRING, nullable: true },
              requiredService: { type: Type.STRING },
              skillsRequired: { type: Type.ARRAY, items: { type: Type.STRING } },
              budget: { type: Type.STRING, nullable: true },
              location: { type: Type.STRING, nullable: true },
              workMode: { type: Type.STRING, nullable: true },
              deadline: { type: Type.STRING, nullable: true },
              aiClassification: {
                type: Type.STRING,
                enum: [
                  'Freelance Project',
                  'Contract Work',
                  'Full-Time Job',
                  'Part-Time Job',
                  'Internship',
                  'Agency Requirement',
                  'Irrelevant Content',
                ],
              },
              confidenceScore: { type: Type.NUMBER },
            },
          },
        },
      },
    });

    recordProviderUsage('gemini', true, 1, undefined, { endpoint: 'classifyHiringPosts' });
    const parsed = JSON.parse((response.text ?? '[]').trim());
    const avgConf =
      Array.isArray(parsed) && parsed.length > 0
        ? Math.round(parsed.reduce((acc: number, x: any) => acc + (Number(x.confidenceScore) || 70), 0) / parsed.length)
        : 75;
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'classify',
      target: `${items.length} hiring results`,
      confidenceScore: avgConf,
      success: true,
      timestamp: new Date().toISOString(),
    });
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gemini classification failed';
    recordProviderUsage('gemini', false, 0, msg, { endpoint: 'classifyHiringPosts' });
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'classify',
      target: `${items.length} hiring results`,
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}

export async function analyzeBusinessWithGemini(
  lead: Partial<BusinessLead>,
  freelancerService: string
): Promise<LeadAnalysis> {
  if (!isProviderEnabled('gemini')) {
    throw new Error('Gemini AI provider is disabled by admin.');
  }
  const ai = getGeminiClient();

  const factsPayload = {
    businessName: lead.businessName,
    category: lead.category,
    location: lead.location,
    address: lead.address || null,
    website: lead.website || null,
    publicPhone: lead.publicPhone || null,
    publicEmail: lead.publicEmail || null,
    instagramUrl: lead.instagramUrl || null,
    openingHours: lead.openingHours || null,
    rating: lead.rating ?? null,
    reviewCount: lead.reviewCount ?? null,
    source: lead.source,
    placesEnriched: Boolean(lead.placesEnriched),
    discoveredAt: lead.discoveredAt,
  };

  const prompt = `Analyze ONLY the publicly retrieved business facts provided below for a freelancer offering "${freelancerService || 'Digital & Creative Services'}".

STRICT TRUTHFULNESS RULES:
- Base observations strictly on the supplied JSON facts. Do NOT claim the business is actively hiring or fabricate missing details (website content, traffic, revenue, or unlisted contacts).
- Clearly label potential service requirements as AI-generated suggestions, NOT confirmed business requirements.
- Clearly separate verified facts from AI-suggested potential opportunities.
- Provide an explainable Opportunity Score (0-100) broken down into 4 factors totaling up to 100 points:
  1. Relevance to Freelancer Service (max 30)
  2. Public Evidence of Improvement Opportunity (max 25)
  3. Business Category Fit (max 20)
  4. Contact & Data Availability (max 25)
- Provide a separate AI Confidence Score (0-100) reflecting how complete the public data is.

Public business record:
${JSON.stringify(factsPayload)}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            onlinePresenceSummary: { type: Type.STRING },
            contentObservations: { type: Type.STRING },
            improvementAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
            potentialOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
            aiRecommendation: { type: Type.STRING },
            opportunityScore: { type: Type.NUMBER },
            confidenceScore: { type: Type.NUMBER },
            scoreBreakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  factor: { type: Type.STRING },
                  points: { type: Type.NUMBER },
                  maxPoints: { type: Type.NUMBER },
                  evidence: { type: Type.STRING },
                },
              },
            },
            verifiedFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
            evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    });

    recordProviderUsage('gemini', true, 1, undefined, { endpoint: 'analyzeBusinessWithGemini' });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    const result: LeadAnalysis = {
      leadId: lead.id || 'unknown',
      businessName: lead.businessName || 'Business',
      onlinePresenceSummary: parsed.onlinePresenceSummary || 'Public listing analyzed.',
      contentObservations: parsed.contentObservations || 'Limited public metadata available.',
      improvementAreas: Array.isArray(parsed.improvementAreas) ? parsed.improvementAreas : [],
      potentialOpportunities: Array.isArray(parsed.potentialOpportunities) ? parsed.potentialOpportunities : [],
      aiRecommendation: parsed.aiRecommendation || 'Offer an introductory consultation tailored to their category.',
      opportunityScore: Math.min(100, Math.max(0, Number(parsed.opportunityScore) || 60)),
      confidenceScore: Math.min(100, Math.max(0, Number(parsed.confidenceScore) || 65)),
      scoreBreakdown: Array.isArray(parsed.scoreBreakdown) ? parsed.scoreBreakdown : [],
      verifiedFacts: Array.isArray(parsed.verifiedFacts) ? parsed.verifiedFacts : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
    };

    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'analyze',
      target: lead.businessName || 'Business',
      confidenceScore: result.confidenceScore,
      success: true,
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gemini business analysis failed';
    recordProviderUsage('gemini', false, 0, msg, { endpoint: 'analyzeBusinessWithGemini' });
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'analyze',
      target: lead.businessName || 'Business',
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}

export async function generatePitchWithGemini(params: {
  targetName: string;
  targetContext: string;
  service: string;
  skills: string[];
  portfolioLink: string;
  channel: PitchChannel;
  tone: PitchTone;
}): Promise<{ subject: string; body: string }> {
  if (!isProviderEnabled('gemini')) {
    throw new Error('Gemini AI provider is disabled by admin.');
  }
  const ai = getGeminiClient();

  const prompt = `Write a personalized outreach pitch for a freelancer.
Target Business or Opportunity: ${params.targetName}
Verified Public Context: ${params.targetContext}
Freelancer Service: ${params.service}
Relevant Skills: ${params.skills.join(', ')}
Portfolio Link: ${params.portfolioLink || 'Available on request'}
Outreach Channel: ${params.channel}
Tone: ${params.tone}

REQUIREMENTS:
- Reference at least one specific verified observation from the context above (never fabricate stats, traffic numbers, or fake claims).
- Explain the freelancer's service clearly with a concrete value proposition.
- Include a respectful, low-friction call to action.
- Tailor length & formatting to ${params.channel} (e.g. concise for Instagram DM / WhatsApp, crisp subject + structured body for Email, conversational for LinkedIn).
- Do not sound spammy or make exaggerated guarantees.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING },
          },
        },
      },
    });
    recordProviderUsage('gemini', true, 1, undefined, { endpoint: 'generatePitchWithGemini' });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'pitch',
      target: `${params.targetName} (${params.channel})`,
      confidenceScore: 90,
      success: true,
      timestamp: new Date().toISOString(),
    });
    return {
      subject: parsed.subject || `Idea for ${params.targetName}`,
      body: parsed.body || '',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gemini pitch generation failed';
    recordProviderUsage('gemini', false, 0, msg, { endpoint: 'generatePitchWithGemini' });
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'pitch',
      target: `${params.targetName} (${params.channel})`,
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}

// ============================================================================
// SCHOLARSHIP AI OPPORTUNITY ENGINE
// ============================================================================

export async function parseScholarshipNaturalLanguageQuery(
  naturalQuery: string,
  studentProfile?: Partial<StudentProfile> | null
): Promise<{
  country: string;
  state: string;
  educationLevel: string;
  course: string;
  subject: string;
  fundingType: string;
  category: string;
  targetedQuery: string;
  intentExplanation: string;
}> {
  if (!isProviderEnabled('gemini')) {
    return {
      country: studentProfile?.country || 'India',
      state: studentProfile?.state || 'All',
      educationLevel: studentProfile?.educationLevel || 'All',
      course: studentProfile?.course || '',
      subject: studentProfile?.specialization || '',
      fundingType: 'All',
      category: 'All',
      targetedQuery: naturalQuery,
      intentExplanation: 'Direct search query parsed without AI expansion.',
    };
  }
  const ai = getGeminiClient();

  const prompt = `Convert this natural-language scholarship search query into structured search parameters and a targeted Google Search query for official scholarship portals.
User Query: "${naturalQuery}"
Optional Student Profile Context: ${studentProfile ? JSON.stringify(studentProfile) : 'None provided'}
Rules:
- Never assume fields that aren't implied. Default country to "India" only if India/Indian/Rajasthan is mentioned or in studentProfile.
- Produce a clean targetedQuery suitable for Google Search (e.g. "MCA cybersecurity scholarships India official portal").`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            country: { type: Type.STRING },
            state: { type: Type.STRING },
            educationLevel: { type: Type.STRING },
            course: { type: Type.STRING },
            subject: { type: Type.STRING },
            fundingType: { type: Type.STRING },
            category: { type: Type.STRING },
            targetedQuery: { type: Type.STRING },
            intentExplanation: { type: Type.STRING },
          },
        },
      },
    });
    recordProviderUsage('gemini', true, 1, undefined, { endpoint: 'scholarship_nlq' });
    const p = JSON.parse((response.text ?? '{}').trim());
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'scholarship_nlq',
      target: naturalQuery.slice(0, 80),
      confidenceScore: 90,
      success: true,
      timestamp: new Date().toISOString(),
    });
    return {
      country: p.country || studentProfile?.country || 'India',
      state: p.state || 'All',
      educationLevel: p.educationLevel || 'All',
      course: p.course || '',
      subject: p.subject || '',
      fundingType: p.fundingType || 'All',
      category: p.category || 'All',
      targetedQuery: p.targetedQuery || naturalQuery,
      intentExplanation: p.intentExplanation || 'Structured scholarship search parameters extracted from your query.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'NLQ parsing failed';
    recordProviderUsage('gemini', false, 0, msg, { endpoint: 'scholarship_nlq' });
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'scholarship_nlq',
      target: naturalQuery.slice(0, 80),
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
    return {
      country: studentProfile?.country || 'India',
      state: studentProfile?.state || 'All',
      educationLevel: studentProfile?.educationLevel || 'All',
      course: '',
      subject: '',
      fundingType: 'All',
      category: 'All',
      targetedQuery: naturalQuery,
      intentExplanation: 'Fallback direct query search.',
    };
  }
}

export async function extractScholarshipFromPageText(params: {
  url: string;
  pageTitle: string;
  pageText: string;
  sourceType: ScholarshipSourceType;
  countryHint?: string;
  stateHint?: string;
}): Promise<Partial<ScholarshipRecord>> {
  if (!isProviderEnabled('gemini')) {
    throw new Error('Gemini AI provider is disabled by admin.');
  }
  const ai = getGeminiClient();

  const prompt = `Extract verified scholarship information ONLY from the fetched webpage text below.
CRITICAL TRUTHFULNESS RULES:
- NEVER invent scholarship amounts, currency, deadlines, eligibility rules, or application URLs.
- If a field is NOT explicitly stated on this page, set it to "Not specified" (or empty array [] for lists).
- List exact factual quotes or bullet points found on the page in verifiedFacts.
- Official URL: ${params.url}
- Page Title: ${params.pageTitle}
- Source Type: ${params.sourceType}

Page Text:
${params.pageText.slice(0, 7500)}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            provider: { type: Type.STRING },
            description: { type: Type.STRING },
            category: {
              type: Type.STRING,
              enum: [
                'Government',
                'Private',
                'University',
                'International',
                'Fellowship & Grant',
                'Research',
                'Merit-based',
                'Need-based',
                'Minority & Category',
              ],
            },
            country: { type: Type.STRING },
            state: { type: Type.STRING },
            eligibleLocations: { type: Type.ARRAY, items: { type: Type.STRING } },
            educationLevels: { type: Type.ARRAY, items: { type: Type.STRING } },
            degrees: { type: Type.ARRAY, items: { type: Type.STRING } },
            courses: { type: Type.ARRAY, items: { type: Type.STRING } },
            subjects: { type: Type.ARRAY, items: { type: Type.STRING } },
            academicRequirements: { type: Type.STRING },
            financialRequirements: { type: Type.STRING },
            otherEligibilityCriteria: { type: Type.STRING },
            amount: { type: Type.STRING },
            currency: { type: Type.STRING },
            fundingType: {
              type: Type.STRING,
              enum: ['Full Funding', 'Partial Funding', 'Tuition Waiver', 'Stipend / Grant', 'Not specified'],
            },
            benefits: { type: Type.ARRAY, items: { type: Type.STRING } },
            startDate: { type: Type.STRING },
            deadline: { type: Type.STRING },
            requiredDocuments: { type: Type.ARRAY, items: { type: Type.STRING } },
            applicationInstructions: { type: Type.STRING },
            status: { type: Type.STRING, enum: ['Open', 'Upcoming', 'Closed', 'Expired'] },
            verifiedFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    });
    recordProviderUsage('gemini', true, 1, undefined, { endpoint: 'scholarship_extract' });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'scholarship_extract',
      target: parsed.title || params.pageTitle || params.url,
      confidenceScore: 85,
      success: true,
      timestamp: new Date().toISOString(),
    });
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scholarship extraction failed';
    recordProviderUsage('gemini', false, 0, msg, { endpoint: 'scholarship_extract' });
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'scholarship_extract',
      target: params.url,
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}

export async function evaluateScholarshipEligibility(
  studentProfile: Partial<StudentProfile>,
  scholarship: Partial<ScholarshipRecord>
): Promise<ScholarshipEligibilityResult> {
  if (!isProviderEnabled('gemini')) {
    throw new Error('Gemini AI provider is disabled by admin.');
  }
  const ai = getGeminiClient();

  const prompt = `Evaluate a student's eligibility against a scholarship strictly using the provided profile and scholarship facts.

STRICT RULES:
1. Verdict MUST be one of: "Eligible", "Potentially Eligible", "Not Eligible", "Insufficient Information".
2. If critical scholarship criteria or student facts (such as income range or academic percentage when required) are missing or "Not specified", return "Potentially Eligible" or "Insufficient Information" — NEVER infer sensitive conditions without evidence.
3. NEVER guarantee selection.
4. Explain scoreBreakdown honestly across 4 factors totaling up to 100 points:
   - Education Level & Degree Fit (max 30)
   - Course & Subject Fit (max 25)
   - Location & Domicile Fit (max 25)
   - Academic & Financial Criteria Fit (max 20)

Student Profile:
${JSON.stringify(studentProfile)}

Scholarship Record:
${JSON.stringify({
  id: scholarship.id,
  title: scholarship.title,
  provider: scholarship.provider,
  country: scholarship.country,
  state: scholarship.state,
  eligibleLocations: scholarship.eligibleLocations,
  educationLevels: scholarship.educationLevels,
  degrees: scholarship.degrees,
  courses: scholarship.courses,
  subjects: scholarship.subjects,
  academicRequirements: scholarship.academicRequirements,
  financialRequirements: scholarship.financialRequirements,
  otherEligibilityCriteria: scholarship.otherEligibilityCriteria,
  requiredDocuments: scholarship.requiredDocuments,
  officialApplicationUrl: scholarship.officialApplicationUrl,
  sourceUrl: scholarship.sourceUrl,
})}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdict: {
              type: Type.STRING,
              enum: ['Eligible', 'Potentially Eligible', 'Not Eligible', 'Insufficient Information'],
            },
            matchScore: { type: Type.NUMBER },
            scoreBreakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  factor: { type: Type.STRING },
                  points: { type: Type.NUMBER },
                  maxPoints: { type: Type.NUMBER },
                  evidence: { type: Type.STRING },
                },
              },
            },
            matchingCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
            unmatchedCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
            importantConditions: { type: Type.ARRAY, items: { type: Type.STRING } },
            requiredDocuments: { type: Type.ARRAY, items: { type: Type.STRING } },
            reason: { type: Type.STRING },
          },
        },
      },
    });

    recordProviderUsage('gemini', true, 1, undefined, { endpoint: 'scholarship_eligibility' });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    const result: ScholarshipEligibilityResult = {
      scholarshipId: scholarship.id || 'unknown',
      scholarshipTitle: scholarship.title || 'Scholarship',
      verdict: parsed.verdict || 'Insufficient Information',
      matchScore: Math.min(100, Math.max(0, Number(parsed.matchScore) || 50)),
      scoreBreakdown: Array.isArray(parsed.scoreBreakdown) ? parsed.scoreBreakdown : [],
      matchingCriteria: Array.isArray(parsed.matchingCriteria) ? parsed.matchingCriteria : [],
      unmatchedCriteria: Array.isArray(parsed.unmatchedCriteria) ? parsed.unmatchedCriteria : [],
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation : [],
      importantConditions: Array.isArray(parsed.importantConditions) ? parsed.importantConditions : [],
      requiredDocuments:
        Array.isArray(parsed.requiredDocuments) && parsed.requiredDocuments.length > 0
          ? parsed.requiredDocuments
          : scholarship.requiredDocuments || [],
      reason: parsed.reason || 'Eligibility assessed based on available profile and scholarship criteria.',
      officialSourceReference: scholarship.officialApplicationUrl || scholarship.sourceUrl || 'Not specified',
      disclaimer:
        'AI-assisted assessment only — not an official eligibility decision or guarantee of scholarship selection. Confirm final rules on the official provider portal.',
    };

    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'scholarship_eligibility',
      target: result.scholarshipTitle,
      confidenceScore: result.matchScore,
      success: true,
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scholarship eligibility check failed';
    recordProviderUsage('gemini', false, 0, msg, { endpoint: 'scholarship_eligibility' });
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'scholarship_eligibility',
      target: scholarship.title || 'Scholarship',
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}

// ============================================================================
// JOB MATCHING & APPLICATION DRAFTING ENGINE
// ============================================================================

export async function matchJobToFreelancer(
  profile: Partial<FreelancerProfile>,
  job: Partial<JobListing>
): Promise<JobMatchAnalysis> {
  if (!isProviderEnabled('gemini')) {
    throw new Error('Gemini AI provider is disabled by admin.');
  }
  const ai = getGeminiClient();

  const prompt = `Compare this freelancer/candidate profile against the real job listing below.
STRICT RULES:
- Base skill match, experience match, location compatibility, and employment type compatibility strictly on the supplied JSON.
- Do NOT fabricate skills the candidate does not list.

Candidate Profile:
${JSON.stringify({
  headline: profile.headline,
  skills: profile.skills,
  services: profile.services,
  experienceLevel: profile.experienceLevel,
  country: profile.country,
  city: profile.city,
  workPreference: profile.workPreference,
})}

Job Listing:
${JSON.stringify({
  title: job.title,
  company: job.company,
  description: (job.description || '').slice(0, 2200),
  requirements: job.requirements,
  skills: job.skills,
  location: job.location,
  employmentType: job.employmentType,
  workMode: job.workMode,
  experienceLevel: job.experienceLevel,
})}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { type: Type.NUMBER },
            skillMatchScore: { type: Type.NUMBER },
            experienceMatchScore: { type: Type.NUMBER },
            locationCompatibility: { type: Type.STRING },
            employmentTypeCompatibility: { type: Type.STRING },
            matchingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            reasonsForRecommendation: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    });
    recordProviderUsage('gemini', true, 1, undefined, { endpoint: 'job_match' });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    const result: JobMatchAnalysis = {
      jobId: job.id || 'unknown',
      overallScore: Math.min(100, Math.max(0, Number(parsed.overallScore) || 60)),
      skillMatchScore: Math.min(100, Math.max(0, Number(parsed.skillMatchScore) || 60)),
      experienceMatchScore: Math.min(100, Math.max(0, Number(parsed.experienceMatchScore) || 65)),
      locationCompatibility: parsed.locationCompatibility || 'Check job location vs preference',
      employmentTypeCompatibility: parsed.employmentTypeCompatibility || 'Check schedule type',
      matchingSkills: Array.isArray(parsed.matchingSkills) ? parsed.matchingSkills : [],
      missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : [],
      reasonsForRecommendation: Array.isArray(parsed.reasonsForRecommendation) ? parsed.reasonsForRecommendation : [],
      disclaimer: 'AI match insight based on listed profile skills and job description.',
    };
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'job_match',
      target: job.title || 'Job Listing',
      confidenceScore: result.overallScore,
      success: true,
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Job matching failed';
    recordProviderUsage('gemini', false, 0, msg, { endpoint: 'job_match' });
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'job_match',
      target: job.title || 'Job Listing',
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}

export async function generateJobApplicationDraft(
  profile: Partial<FreelancerProfile>,
  job: Partial<JobListing>,
  format: 'Cover Letter' | 'Freelance Proposal' | 'Recruiter Message'
): Promise<{ subject: string; body: string }> {
  if (!isProviderEnabled('gemini')) {
    throw new Error('Gemini AI provider is disabled by admin.');
  }
  const ai = getGeminiClient();

  const prompt = `Draft a tailored ${format} for the job listing below using ONLY the candidate's real profile details.
CRITICAL TRUTHFULNESS RULES:
- NEVER fabricate prior companies, fake metrics, years of experience, or nonexistent portfolio projects.
- Reference only skills, services, and portfolio links explicitly listed in the candidate profile below.

Candidate Profile:
${JSON.stringify({
  fullName: profile.fullName,
  headline: profile.headline,
  description: profile.description,
  skills: profile.skills,
  services: profile.services,
  experienceLevel: profile.experienceLevel,
  portfolioLinks: profile.portfolioLinks,
})}

Job Listing:
${JSON.stringify({
  title: job.title,
  company: job.company,
  description: (job.description || '').slice(0, 2200),
  employmentType: job.employmentType,
  workMode: job.workMode,
})}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING },
          },
        },
      },
    });
    recordProviderUsage('gemini', true, 1, undefined, { endpoint: 'job_draft' });
    const parsed = JSON.parse((response.text ?? '{}').trim());
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'job_draft',
      target: `${job.title || 'Job'} (${format})`,
      confidenceScore: 88,
      success: true,
      timestamp: new Date().toISOString(),
    });
    return {
      subject: parsed.subject || `Application: ${job.title || 'Role'}`,
      body: parsed.body || '',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Job draft generation failed';
    recordProviderUsage('gemini', false, 0, msg, { endpoint: 'job_draft' });
    pushTelemetry({
      id: `ai_${Date.now()}`,
      task: 'job_draft',
      target: job.title || 'Job',
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}
