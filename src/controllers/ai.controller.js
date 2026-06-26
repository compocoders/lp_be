import { getFlashModel, getProModel, calculateVirtualTokens, generateContentWithRetry } from '../services/ai.service.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import mime from 'mime-types';
import officeParser from 'officeparser';

export const parseFileForGemini = async (key, fileBuffer) => {
    const mimeType = mime.lookup(key) || 'application/octet-stream';
    let extractedText = "";
    let inlineData = null;

    if (mimeType.startsWith('image/')) {
        inlineData = {
            data: Buffer.from(fileBuffer).toString('base64'),
            mimeType
        };
    } else if (mimeType === 'application/pdf') {
        try {
            const pdfData = await pdf(Buffer.from(fileBuffer));
            extractedText = pdfData.text;
        } catch (e) {
            console.error("PDF parse error", e);
        }
    } else {
        try {
            const ext = key.split('.').pop().toLowerCase();
            const parsedData = await officeParser.parseOffice(Buffer.from(fileBuffer), { fileType: ext });
            // officeparser v7+ returns an object with a toText() method
            extractedText = typeof parsedData?.toText === 'function' ? parsedData.toText() : String(parsedData);
        } catch(e) {
            console.error("Office parser error", e);
            if (mimeType.startsWith('text/') || mimeType === 'text/csv') {
                extractedText = Buffer.from(fileBuffer).toString('utf-8');
            }
        }
    }
    return { extractedText, inlineData };
};

// Setup S3 Client to fetch PDFs for RAG
export const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
});

export const chatWithDocument = async (req, res, next) => {
    try {
        const { message, materialId, modelType = 'flash' } = req.body;
        
        if (!message || !materialId) {
            return res.status(400).json({ error: "Message and materialId are required" });
        }

        // 1. Fetch material from DB
        const material = await prisma.learningMaterial.findUnique({
            where: { id: materialId }
        });

        if (!material) {
            return res.status(404).json({ error: "Material not found" });
        }

        // 2. Fetch file from S3
        // The fileUrl usually contains the R2_PUBLIC_URL + key. We need to extract the key.
        const key = material.fileUrl.replace(env.R2_PUBLIC_URL + '/', '');
        
        const command = new GetObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key
        });

        const s3Response = await s3Client.send(command);
        const fileBuffer = await s3Response.Body.transformToByteArray();

        // 3. Parse file
        const { extractedText, inlineData } = await parseFileForGemini(key, fileBuffer);

        if (!extractedText && !inlineData) {
            return res.status(400).json({ error: "Could not parse document text. Unsupported format." });
        }

        // 4. Send to Gemini
        const model = modelType === 'pro' ? getProModel() : getFlashModel();
        
        let prompt = `You are a helpful AI tutor for a learning platform. Be direct, concise, and to the point. Do not use filler words unless necessary.
        
CRITICAL INSTRUCTION: Write the response entirely in plain, natural human text. DO NOT use any Markdown formatting. DO NOT use asterisks (*), hashes (#), or any special formatting symbols. Use natural paragraph spacing.

Student's Question: ${message}

Answer the student's question based ONLY on the context document or image provided in this prompt. If the answer cannot be found in the provided text or image, say "I cannot find the answer in the provided material."`;

        if (extractedText) {
            const textStr = typeof extractedText === 'string' ? extractedText : String(extractedText);
            prompt += `\n\nContext Document:\n"""\n${textStr.substring(0, 30000)}\n"""`;
        }

        const parts = [];
        if (inlineData) parts.push({ inlineData });
        parts.push({ text: prompt });

        const result = await generateContentWithRetry(model, parts, req.tokenWallet);
        const responseText = result.response.text();
        const usageMetadata = result.response.usageMetadata;

        // 5. Deduct tokens
        const tokensToDeduct = calculateVirtualTokens(usageMetadata);
        await req.tokenWallet.deductTokens(tokensToDeduct);

        res.json({
            reply: responseText,
            tokensUsed: tokensToDeduct,
            remainingTokens: req.tokenWallet.availableTokens - tokensToDeduct
        });

    } catch (error) {
        console.error("Chat with doc error:", error);
        next(error);
    }
};

export const generateActivity = async (req, res, next) => {
    try {
        const { topic, gradeLevel, type = 'quiz', additionalInstructions = '' } = req.body;
        
        const model = getFlashModel();
        let prompt = `You are an expert curriculum designer.
        Generate a ${type} for grade level ${gradeLevel} about the topic: "${topic}".
        ${additionalInstructions ? `Additional Teacher Instructions: "${additionalInstructions}"` : ''}\n`;

        if (type === 'CODING') {
            prompt += `CRITICAL INSTRUCTION: You MUST return a JSON array with exactly one object in this format:
[
  {
    "id": "1",
    "questionType": "coding_problem",
    "content": "Clear problem statement and instructions here...",
    "points": 100,
    "config": {
      "language": "javascript",
      "starterCode": "// Free example code for the student to start with based on the topic...",
      "expectedOutput": ""
    }
  }
]
Do not wrap in markdown, just return raw JSON.`;
        } else if (type === 'SPREADSHEET') {
            prompt += `CRITICAL INSTRUCTION: You MUST return a JSON array with exactly one object in this format:
[
  {
    "id": "1",
    "questionType": "spreadsheet_problem",
    "content": "Clear instructions on what data to input or formulas to use...",
    "points": 100,
    "config": {
      "starterData": [
        [{"value": "Header 1"}, {"value": "Header 2"}, {"value": "Header 3"}, {"value": "Header 4"}],
        [{"value": ""}, {"value": ""}, {"value": ""}, {"value": ""}],
        [{"value": ""}, {"value": ""}, {"value": ""}, {"value": ""}]
      ]
    }
  }
]
Do not wrap in markdown, just return raw JSON.`;
        } else if (type === 'FRONTEND') {
            prompt += `CRITICAL INSTRUCTION: You MUST return a JSON array with exactly one object in this format:
[
  {
    "id": "1",
    "questionType": "frontend_problem",
    "content": "Clear instructions on what UI to build...",
    "points": 100,
    "config": {
      "cssFramework": "native",
      "starterHtml": "<!-- free example HTML to start -->",
      "starterCss": "/* free example CSS to start */",
      "starterJs": "// free example JS to start"
    }
  }
]
Do not wrap in markdown, just return raw JSON.`;
        } else if (type === 'QUIZ') {
            let maxQs = 5;
            if (req.tokenWallet && req.tokenWallet.availableTokens) {
                maxQs = Math.max(1, Math.min(10, Math.floor(req.tokenWallet.availableTokens / 80)));
            }
            prompt += `CRITICAL INSTRUCTION: You MUST return a JSON array of EXACTLY ${maxQs} short questions in this format:
[
  {
    "id": "1",
    "questionType": "multiple_choice",
    "content": "Short question text here",
    "points": 10,
    "options": [
      { "id": "opt-1", "text": "Option A" },
      { "id": "opt-2", "text": "Option B" },
      { "id": "opt-3", "text": "Option C" },
      { "id": "opt-4", "text": "Option D" }
    ],
    "correctAnswer": "opt-2"
  }
]
CRITICAL INSTRUCTION: Keep the questions and options extremely brief (1 sentence max per question) to minimize token usage. Do not wrap in markdown, just return raw JSON.`;
        } else if (type === 'PROBLEM_SET') {
            prompt += `CRITICAL INSTRUCTION: You MUST return a JSON array of 3-5 problems in this format:
[
  {
    "id": "1",
    "questionType": "short_answer",
    "content": "Problem statement or question here",
    "points": 10
  }
]
Do not wrap in markdown, just return raw JSON.`;
        } else {
            prompt += `CRITICAL INSTRUCTION: Write the response entirely in plain, natural human text. DO NOT use any Markdown formatting. DO NOT use asterisks (*), hashes (#), or any special formatting symbols. Use natural paragraph spacing.`;
        }

        const result = await generateContentWithRetry(model, prompt, req.tokenWallet);
        const responseText = result.response.text();
        
        const tokensToDeduct = calculateVirtualTokens(result.response.usageMetadata);
        await req.tokenWallet.deductTokens(tokensToDeduct);

        res.json({
            content: responseText,
            tokensUsed: tokensToDeduct,
            remainingTokens: req.tokenWallet.availableTokens - tokensToDeduct
        });
    } catch(e) {
        next(e);
    }
};

export const generateStudyMaterial = async (req, res, next) => {
    try {
        const { materialId, type } = req.body; // type = 'quiz' or 'notes'
        
        if (!materialId || !type) {
            return res.status(400).json({ error: "MaterialId and type are required" });
        }

        const material = await prisma.learningMaterial.findUnique({ where: { id: materialId } });
        if (!material) return res.status(404).json({ error: "Material not found" });

        const key = material.fileUrl.replace(env.R2_PUBLIC_URL + '/', '');
        const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
        const s3Response = await s3Client.send(command);
        const fileBuffer = await s3Response.Body.transformToByteArray();
        
        const { extractedText, inlineData } = await parseFileForGemini(key, fileBuffer);

        if (!extractedText && !inlineData) {
            return res.status(400).json({ error: "Could not parse document text. Unsupported format." });
        }

        const model = getFlashModel();
        
        let prompt = '';
        if (type === 'quiz') {
            prompt = `You are Likhâ, a friendly and highly accurate human-like tutor. Based ONLY on the following document context, create a quick 5-question multiple choice review quiz to help the user practice. Keep the tone natural and encouraging. CRITICAL INSTRUCTION: Write the response entirely in plain text. DO NOT use any Markdown formatting (no asterisks or hashes). Use regular numbering like 1) 2) 3).`;
        } else {
            prompt = `You are Likhâ, a friendly and highly accurate human-like tutor. Based ONLY on the following document context, provide some concise study notes. Explain the concepts naturally as if you are speaking to the student. CRITICAL INSTRUCTION: Write the response entirely in plain text. DO NOT use any Markdown formatting (no asterisks or hashes). Use ALL CAPS for important terms instead of bolding.`;
        }

        if (extractedText) {
            const textStr = typeof extractedText === 'string' ? extractedText : String(extractedText);
            prompt += `\n\nContext Document:\n"""\n${textStr.substring(0, 30000)}\n"""`;
        }

        const parts = [];
        if (inlineData) parts.push({ inlineData });
        parts.push({ text: prompt });

        const result = await generateContentWithRetry(model, parts, req.tokenWallet);
        const tokensToDeduct = calculateVirtualTokens(result.response.usageMetadata);
        await req.tokenWallet.deductTokens(tokensToDeduct);

        res.json({
            content: result.response.text(),
            tokensUsed: tokensToDeduct,
            remainingTokens: req.tokenWallet.availableTokens - tokensToDeduct
        });
    } catch (e) {
        next(e);
    }
};

export const gradeWithAI = async (req, res, next) => {
    try {
        const { submissionId } = req.body;
        if (!submissionId) return res.status(400).json({ error: "submissionId is required" });

        const submission = await prisma.submission.findUnique({
            where: { id: submissionId },
            include: { 
                Activity: { include: { questions: true } },
                answers: true
            }
        });

        if (!submission) return res.status(404).json({ error: "Submission not found" });

        // Construct grading prompt
        let promptText = `You are an expert Teacher's Grading Assistant. You must be direct and concise.
Evaluate the following student submission based on the questions and provided answers. 
Suggest a score (integer) and a brief feedback string for EACH answer.

Activity Title: ${submission.Activity.title}
Activity Description: ${submission.Activity.description || 'N/A'}

Questions and Student Answers:
`;
        submission.answers.forEach(ans => {
            const q = submission.Activity.questions.find(q => q.id === ans.questionId);
            if (q) {
                promptText += `\n--- Question ID: ${q.id} ---\nQuestion (${q.points} Pts): ${q.content}\nStudent Answer: ${JSON.stringify(ans.content)}\n`;
            }
        });

        promptText += `
        
Respond STRICTLY in the following JSON format:
{
  "grades": [
    { "answerId": "...", "score": 10, "feedback": "Great job..." }
  ],
  "generalFeedback": "Overall, the student did well..."
}
`;

        const model = getFlashModel();
        const result = await generateContentWithRetry(model, promptText, req.tokenWallet);
        
        let rawText = result.response.text();
        let gradingResult = {};
        try {
            const jsonMatch = rawText.match(/```json\n([\s\S]*)\n```/);
            if (jsonMatch) rawText = jsonMatch[1];
            gradingResult = JSON.parse(rawText);
        } catch(e) {
            return res.status(500).json({ error: "AI returned invalid JSON format for grading." });
        }

        const tokensToDeduct = calculateVirtualTokens(result.response.usageMetadata);
        await req.tokenWallet.deductTokens(tokensToDeduct);

        res.json({
            grading: gradingResult,
            tokensUsed: tokensToDeduct,
            remainingTokens: req.tokenWallet.availableTokens - tokensToDeduct
        });
    } catch (e) {
        next(e);
    }
};

export const ideaSpark = async (req, res, next) => {
    try {
        const { topic } = req.body;
        if (!topic) return res.status(400).json({ error: "topic is required" });

        const promptText = `You are an expert Teacher's Assistant. Generate creative, engaging, and modern classroom ideas for the following topic:
"${topic}"

Include:
- 2 creative hook ideas to introduce the topic.
- 3 engaging activity or project ideas.
- 3 discussion questions to spark debate.

CRITICAL INSTRUCTION: Write the response entirely in plain, natural human text. DO NOT use any Markdown formatting. DO NOT use asterisks (*), hashes (#), or any special formatting symbols. Use natural paragraph spacing.`;

        const model = getFlashModel();
        const result = await generateContentWithRetry(model, promptText, req.tokenWallet);
        
        const tokensToDeduct = calculateVirtualTokens(result.response.usageMetadata);
        await req.tokenWallet.deductTokens(tokensToDeduct);

        res.json({
            content: result.response.text(),
            tokensUsed: tokensToDeduct,
            remainingTokens: req.tokenWallet.availableTokens - tokensToDeduct
        });
    } catch (e) {
        next(e);
    }
};

import { getNextMidnight } from '../middlewares/token.middleware.js';

export const getTokenInfo = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { virtualTokens: true, lastTokenReset: true }
        });
        
        let tokens = user ? user.virtualTokens : 500;
        
        if (user) {
            const now = new Date();
            const lastReset = new Date(user.lastTokenReset);
            const isDifferentDay =
              lastReset.getDate() !== now.getDate() ||
              lastReset.getMonth() !== now.getMonth() ||
              lastReset.getFullYear() !== now.getFullYear();
              
            if (isDifferentDay) {
                tokens = 500;
            }
        }
        
        res.json({
            remainingTokens: tokens,
            nextResetAt: getNextMidnight(),
        });
    } catch (e) {
        next(e);
    }
};
