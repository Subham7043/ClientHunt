import { GoogleGenAI, Type } from '@google/genai';
import type {
  AiTelemetryEntry,
  BusinessLead,
  HiringClassification,
  LeadAnalysis,
  PitchChannel,
  PitchTone,
} from '../src/types/domain.ts';
import { isProviderEnabled, recordProviderUsage } from './providers/types.ts';

const aiTelemetryLog: AiTelemetryEntry[] = [];

function pushTelemetry(entry: AiTelemetryEntry): void {
  aiTelemetryLog.unshift(entry);
  if (aiTelemetryLog.length > 50) {
    aiTelemetryLog.length = 50;
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

    recordProviderUsage('gemini', true, 1);
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
    recordProviderUsage('gemini', false, 0, msg);
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
    rating: lead.rating ?? null,
    reviewCount: lead.reviewCount ?? null,
    source: lead.source,
    discoveredAt: lead.discoveredAt,
  };

  const prompt = `Analyze ONLY the publicly retrieved business facts provided below for a freelancer offering "${freelancerService || 'Digital & Creative Services'}".

STRICT TRUTHFULNESS RULES:
- Base observations strictly on the supplied JSON facts. Do NOT claim the business is actively hiring or fabricate missing details (website content, traffic, revenue, or unlisted contacts).
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

    recordProviderUsage('gemini', true, 1);
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
    recordProviderUsage('gemini', false, 0, msg);
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
    recordProviderUsage('gemini', true, 1);
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
    recordProviderUsage('gemini', false, 0, msg);
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
