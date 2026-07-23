/**
 * ─── AI Feature Controller ────────────────────────────────────────────────────
 *
 * Handles all Gemini AI-powered features:
 *  - chatWithDocument     → RAG-style Q&A over a learning material file
 *  - generateActivity     → Creates quiz/coding/essay activities from a topic
 *  - generateStudyMaterial → Generates notes or a quiz from a learning material
 *  - gradeWithAI          → AI-assisted grading of a student submission
 *  - ideaSpark            → Generates creative teaching ideas for a topic
 *  - getTokenInfo         → Returns the user's current token balance
 *
 * ─── Authorization Model ─────────────────────────────────────────────────────
 * Every endpoint that accesses a learning material or submission MUST verify
 * that the requesting user has the appropriate role in the relevant classroom:
 *  - chatWithDocument, generateStudyMaterial → classroom MEMBER (student or teacher)
 *  - gradeWithAI → classroom OWNER (teacher) or activity creator
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getFlashModel, getProModel, calculateVirtualTokens, generateContentWithRetry } from '../services/ai.service.js';
import { SPREADSHEET_TEMPLATES } from '../utils/spreadsheetTemplates.js';
import { assertClassroomMember } from '../services/activity.service.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import mime from 'mime-types';
import officeParser from 'officeparser';

/**
 * Parses a file fetched from S3 into a format suitable for Gemini AI.
 *
 * - Images:      Returns an `inlineData` object (base64-encoded) for direct Gemini vision input.
 * - PDFs:        Extracts text via pdf-parse.
 * - Office docs: Extracts text via officeparser (supports .docx, .pptx, etc.).
 * - Plain text:  Reads the raw buffer as a UTF-8 string.
 *
 * @param {string} key         — The S3 object key (used to determine file type via extension)
 * @param {Uint8Array} fileBuffer — The raw file bytes fetched from S3
 * @returns {{ extractedText: string, inlineData: object|null }}
 */
export const parseFileForGemini = async (key, fileBuffer) => {
    const mimeType = mime.lookup(key) || 'application/octet-stream';
    let extractedText = '';
    let inlineData = null;

    if (mimeType.startsWith('image/')) {
        // For images, pass the raw base64 data directly to Gemini's vision model
        inlineData = {
            data: Buffer.from(fileBuffer).toString('base64'),
            mimeType
        };
    } else if (mimeType === 'application/pdf') {
        // Extract text from PDF using pdf-parse
        try {
            const pdfData = await pdf(Buffer.from(fileBuffer));
            extractedText = pdfData.text;
        } catch (e) {
            console.error('PDF parse error', e);
        }
    } else {
        // Try to extract text from Office documents (.docx, .pptx, etc.)
        try {
            const ext = key.split('.').pop().toLowerCase();
            const parsedData = await officeParser.parseOffice(Buffer.from(fileBuffer), { fileType: ext });
            // officeparser v7+ returns an object with a toText() method
            extractedText = typeof parsedData?.toText === 'function' ? parsedData.toText() : String(parsedData);
        } catch (e) {
            console.error('Office parser error', e);
            // Fallback: try to read plain text files (e.g., .txt, .csv) as UTF-8
            if (mimeType.startsWith('text/') || mimeType === 'text/csv') {
                extractedText = Buffer.from(fileBuffer).toString('utf-8');
            }
        }
    }

    return { extractedText, inlineData };
};

/**
 * Shared S3 client for fetching learning material files from Cloudflare R2.
 * Exported so the AI Studio controller can reuse it without creating a second instance.
 */
export const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
});

/**
 * POST /ai/chat-document
 *
 * RAG (Retrieval-Augmented Generation) endpoint: fetches a learning material
 * from S3, extracts its text, and uses it as context for a Gemini AI chat response.
 *
 * Authorization: The requesting user must be a MEMBER of the classroom that
 * owns the material. This prevents users from querying materials from classrooms
 * they haven't joined.
 */
export const chatWithDocument = async (req, res, next) => {
    try {
        const { message, materialId, modelType = 'flash' } = req.body;

        // 1. Fetch the learning material from the database
        const material = await prisma.learningMaterial.findUnique({
            where: { id: materialId }
        });

        if (!material) {
            return res.status(404).json({ error: 'Material not found' });
        }

        // SECURITY: Verify the user is a member of the classroom this material belongs to.
        // This prevents users from chatting with materials from classrooms they haven't joined.
        await assertClassroomMember(material.classroomId, req.user.id);

        // 2. Extract the S3 object key from the stored public URL and fetch the file
        const key = material.fileUrl.replace(env.R2_PUBLIC_URL + '/', '');
        const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
        const s3Response = await s3Client.send(command);
        const fileBuffer = await s3Response.Body.transformToByteArray();

        // 3. Parse the file into text or image data for Gemini
        const { extractedText, inlineData } = await parseFileForGemini(key, fileBuffer);

        if (!extractedText && !inlineData) {
            return res.status(400).json({ error: 'Could not parse document text. Unsupported format.' });
        }

        // 4. Build the prompt with the extracted document as context
        const model = modelType === 'pro' ? getProModel() : getFlashModel();

        let prompt = `You are a helpful AI tutor for a learning platform. Be direct, concise, and to the point. Do not use filler words unless necessary.

CRITICAL INSTRUCTION: Write the response entirely in plain, natural human text. DO NOT use any Markdown formatting. DO NOT use asterisks (*), hashes (#), or any special formatting symbols. Use natural paragraph spacing.

Student's Question: ${message}

Answer the student's question based ONLY on the context document or image provided in this prompt. If the answer cannot be found in the provided text or image, say "I cannot find the answer in the provided material."`;

        if (extractedText) {
            // Trim to 30,000 chars to stay within safe token limits
            const textStr = typeof extractedText === 'string' ? extractedText : String(extractedText);
            prompt += `\n\nContext Document:\n"""\n${textStr.substring(0, 30000)}\n"""`;
        }

        const parts = [];
        if (inlineData) parts.push({ inlineData }); // Include image for vision-capable models
        parts.push({ text: prompt });

        // 5. Call Gemini AI (with exponential backoff retry logic)
        const result = await generateContentWithRetry(model, parts, req.tokenWallet);
        const responseText = result.response.text();
        const usageMetadata = result.response.usageMetadata;

        // 6. Deduct tokens from the user's daily wallet based on actual usage
        const tokensToDeduct = calculateVirtualTokens(usageMetadata);
        await req.tokenWallet.deductTokens(tokensToDeduct);

        res.json({
            reply: responseText,
            tokensUsed: tokensToDeduct,
            remainingTokens: req.tokenWallet.availableTokens - tokensToDeduct
        });

    } catch (error) {
        console.error('Chat with doc error:', error);
        next(error);
    }
};

/**
 * POST /ai/generate-activity
 *
 * Generates a structured activity (quiz, coding problem, essay, etc.) for a
 * given topic and grade level. The generated content is returned as JSON that
 * the frontend uses to pre-fill the activity creation form.
 *
 * Authorization: Any authenticated user with sufficient tokens can generate
 * activity content (the classroom membership check happens at activity creation time).
 */
export const generateActivity = async (req, res, next) => {
    try {
        const {
            topic, gradeLevel, type = 'quiz', additionalInstructions = '',
            cssFramework = 'native', codingLanguage = 'javascript',
            difficulty = 'intermediate',
            quizCount = 5, quizType = 'multiple_choice',
            problemCount = 3,
            wordCount = 300,
            spreadsheetColumns = 4, spreadsheetTask = 'mixed',
        } = req.body;
        
        const model = getFlashModel();

        // ─── Shared system context ───────────────────────────────────────────────
        // This prompt establishes the app context so the AI never mentions CDNs,
        // installation steps, or any sign that the content was AI-generated.
        const systemContext = `You are a curriculum designer writing activities directly inside a learning platform called Likhâ.
The platform automatically handles all framework CDNs, dependencies, and tooling — students never install anything themselves.
NEVER mention: CDN links, npm, yarn, script tags, link tags, installation instructions, "via CDN", "from CDN", or any setup steps.
NEVER use phrases like "AI-generated", "as an AI", "I generated", "here is", "certainly", "sure", or any filler opener.
NEVER use Markdown formatting (no **, ##, *, \`\`\`, etc.) inside content strings.
Write instructions in a direct, professional tone exactly as a teacher would write them — clear, concise, and action-oriented.
${additionalInstructions ? `Teacher's additional instructions: "${additionalInstructions}"` : ''}`;

        let prompt = `${systemContext}

Generate a ${type} activity for grade level: ${gradeLevel}
Topic: "${topic}"

FORMATTING RULES:
- Write the \`content\` field entirely in plain text.
- DO NOT use markdown bolding (like **text**) or italics.
- Use standard dashes (-) or numbers for bulleted lists.
- Use properly escaped newlines (\\n\\n) to separate paragraphs. DO NOT use literal unescaped line breaks inside the JSON strings.
- DO NOT output a single dense paragraph.

`;

        if (type === 'CODING') {
            const langNames = { javascript: 'JavaScript', python: 'Python', java: 'Java', cpp: 'C++' };
            const langDisplay = langNames[codingLanguage] || codingLanguage;
            const langComment = codingLanguage === 'python' ? '#' : '//';
            prompt += `Return a JSON array with exactly one object:
[
  {
    "id": "1",
    "questionType": "coding_problem",
    "content": "Write a clear, step-by-step ${difficulty}-level problem statement as a teacher would give it. Describe what the student must build or solve, expected inputs/outputs, and any constraints. Do NOT mention the language or environment.",
    "points": 100,
    "config": {
      "language": "${codingLanguage}",
      "starterCode": "${langComment} ${difficulty === 'easy' ? 'Beginner-friendly starter code' : difficulty === 'hard' ? 'Advanced starter code with some structure provided' : 'Intermediate starter code'} in ${langDisplay}. Include function signatures, class templates, or data structure scaffolding appropriate to the difficulty.",
      "expectedOutput": ""
    }
  }
]
Generate the starterCode in ${langDisplay}. Follow ${langDisplay} syntax exactly. Difficulty: ${difficulty}.
Return raw JSON only. No markdown fences.`;

        } else if (type === 'SPREADSHEET') {
            const businessTypes = ['balance_sheet', 'income_statement', 'cash_flow', 't_account', 'trial_balance', 'journal_entries', 'budget', 'inventory'];
            const isBusinessTask = businessTypes.includes(spreadsheetTask);

            const taskDescriptions = {
                formulas:          'formula-based tasks using SUM, AVERAGE, IF, VLOOKUP, and other spreadsheet functions',
                charts:            'data entry and analysis that would feed into charts or graphs',
                data_entry:        'structured data entry and record-keeping',
                mixed:             'mixed tasks combining data entry, formulas, and analysis',
                balance_sheet:     'a Balance Sheet showing Assets, Liabilities, and Owner\'s Equity',
                income_statement:  'an Income Statement showing Revenues, Expenses, and Net Income',
                cash_flow:         'a Cash Flow Statement with Operating, Investing, and Financing activities',
                t_account:         'a T-Account ledger showing Debit and Credit entries',
                trial_balance:     'a Trial Balance listing all accounts with their Debit or Credit balances',
                journal_entries:   'a General Journal with dated accounting entries showing Debits and Credits',
                budget:            'a Budget Plan comparing Budgeted vs Actual amounts with Variance',
                inventory:         'an Inventory Ledger tracking Units In, Units Out, and Balance',
            };
            const taskDesc = taskDescriptions[spreadsheetTask] || 'mixed spreadsheet tasks';

            let colHeaders, emptyRow, businessInstruction;

            if (isBusinessTask) {
                const templateStr = JSON.stringify(SPREADSHEET_TEMPLATES[spreadsheetTask]);
                businessInstruction = `
IMPORTANT: This is a ${taskDesc} task. The student will be provided with this EXACT spreadsheet template:
${templateStr}

Your job is to write the \`content\` (the task description). You MUST provide a realistic scenario and all the raw numbers (e.g. "Cash is ₱50,000", "Sales Revenue is ₱120,000") directly in the \`content\` text, so the student can read your instructions and fill out the provided template. DO NOT invent account names that aren't in the template. Present the raw data clearly using bullet points.`;
            } else {
                const colCount = Number(spreadsheetColumns) || 4;
                colHeaders = Array.from({ length: colCount }, (_, i) => `{"value": "Column ${String.fromCharCode(65 + i)}"}`).join(', ');
                emptyRow   = Array.from({ length: colCount }, () => `{"value": ""}`).join(', ');
                businessInstruction = `Populate starterData with realistic, topic-relevant headers and sample values.`;
            }

            prompt += `Return a JSON array with exactly one object:
[
  {
    "id": "1",
    "questionType": "spreadsheet_problem",
    "content": "Write a clear task description providing the student with all the raw numbers and data they need to fill out the spreadsheet.",
    "points": 100,
    "config": {
      "starterData": ${isBusinessTask ? "[]" : `[
        [${colHeaders}],
        [${emptyRow}],
        [${emptyRow}],
        [${emptyRow}]
      ]`}
    }
  }
]
${businessInstruction}
Task type: ${spreadsheetTask}.
Return raw JSON only. No markdown fences.`;


        } else if (type === 'FRONTEND') {
            const frameworkContext = cssFramework === 'tailwind'
                ? 'The student writes HTML using Tailwind CSS utility classes. The Tailwind framework is already active — they just use classes directly in HTML. starterCss should be empty unless absolutely necessary.'
                : cssFramework === 'bootstrap'
                ? 'The student writes HTML using Bootstrap 5 component classes (container, row, col, btn, card, etc.). Bootstrap is already active — they just use classes in HTML. starterCss should be empty unless custom overrides are needed.'
                : 'The student writes plain HTML and CSS. All styling goes in starterCss using regular CSS rules.';
            const difficultyNote = difficulty === 'beginner'
                ? 'Keep the UI simple: 1-2 components, basic layout, minimal interaction.'
                : difficulty === 'advanced'
                ? 'Design a complex UI with multiple sections, responsiveness, and interactive JavaScript behavior.'
                : 'Design a moderate UI with a few components and basic interactivity.';

            prompt += `Return a JSON array with exactly one object:
[
  {
    "id": "1",
    "questionType": "frontend_problem",
    "content": "Write a clear, numbered list of UI requirements for a ${difficulty}-level task, exactly as a teacher would assign them. Describe layout, components, colors, and interactions. Do NOT mention the framework, CDN, or setup.",
    "points": 100,
    "config": {
      "cssFramework": "${cssFramework}",
      "starterHtml": "<!-- Meaningful ${difficulty}-level starter HTML for ${cssFramework === 'tailwind' ? 'Tailwind CSS' : cssFramework === 'bootstrap' ? 'Bootstrap 5' : 'plain HTML/CSS'} -->",
      "starterCss": "${cssFramework === 'tailwind' ? '' : '/* Add your CSS styles here */'}",
      "starterJs": "// Add JavaScript here (optional)"
    }
  }
]
Framework: ${frameworkContext}
Difficulty: ${difficulty}. ${difficultyNote}
Make starterHtml genuinely useful for the student to start immediately.
Return raw JSON only. No markdown fences.`;

        } else if (type === 'QUIZ') {
            const count = Math.min(20, Math.max(1, Number(quizCount) || 5));
            const qtNote = quizType === 'true_false'
                ? 'ALL questions must be True/False. Use "questionType": "multiple_choice" with exactly 2 options: {"id":"opt-1","text":"True"} and {"id":"opt-2","text":"False"}.'
                : quizType === 'mixed'
                ? 'Mix multiple-choice (4 options) and true/false (2 options: True/False) questions roughly equally.'
                : 'ALL questions must be multiple_choice with exactly 4 options each.';
            prompt += `Return a JSON array of exactly ${count} questions. Difficulty: ${difficulty}.
[
  {
    "id": "1",
    "questionType": "multiple_choice",
    "content": "Question text — concise, max 1 sentence, ${difficulty} level",
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
${qtNote}
Keep each question and all options brief (1 sentence max). Return raw JSON only. No markdown fences.`;

        } else if (type === 'PROBLEM_SET') {
            const count = Math.min(10, Math.max(2, Number(problemCount) || 3));
            const pts = Math.round(100 / count);
            prompt += `Return a JSON array of exactly ${count} problems. Difficulty: ${difficulty}.
[
  {
    "id": "1",
    "questionType": "short_answer",
    "content": "Problem statement written as a teacher would phrase it — ${difficulty} level, direct, clear, actionable.",
    "points": ${pts}
  }
]
Return raw JSON only. No markdown fences.`;

        } else if (type === 'ESSAY') {
            prompt += `Return a JSON array with exactly one essay prompt:
[
  {
    "id": "1",
    "questionType": "essay",
    "content": "Write a rich, thought-provoking essay prompt a teacher would give at the ${difficulty === 'easy' ? 'introductory' : difficulty === 'hard' ? 'advanced' : 'intermediate'} level. Include the main question, perspective to explore, and requirements: target word count of ${wordCount} words, expected structure (introduction, body, conclusion), and any specific evaluation criteria.",
    "points": 100
  }
]
Return raw JSON only. No markdown fences.`;

        } else if (type === 'CASE_STUDY') {
            const complexityNote = difficulty === 'simple'
                ? 'Keep the scenario short and straightforward with 1-2 focused questions.'
                : difficulty === 'complex'
                ? 'Write a detailed multi-paragraph scenario with 3-4 deep analytical questions.'
                : 'Write a moderate scenario with 2-3 analytical questions.';
            prompt += `Return a JSON array with exactly one case study:
[
  {
    "id": "1",
    "questionType": "essay",
    "content": "Write a realistic, believable scenario description followed by analysis questions. ${complexityNote} Frame questions so students must apply critical thinking.",
    "points": 100
  }
]
Return raw JSON only. No markdown fences.`;

        } else if (type === 'PRESENTATION') {
            prompt += `Return a JSON array with exactly one file submission prompt:
[
  {
    "id": "1",
    "questionType": "file_upload",
    "content": "Write a clear submission brief a teacher would give. Describe what the student should create and submit — topic, required sections, format expectations (slides, pages, etc.), and evaluation criteria.",
    "points": 100
  }
]
Return raw JSON only. No markdown fences.`;

        } else {
            prompt += `Write the activity content in plain, direct prose exactly as a teacher would write it. No markdown, no filler phrases.`;
        }

        if (prompt.includes('JSON array')) {
            prompt += `\n\nCRITICAL: Instead of returning just the array, you MUST WRAP your final JSON array inside a root object that provides a creative, AI-generated title based on the topic (max 6 words). Exactly like this format:
{
  "title": "Your Creative Title Here",
  "questions": [ ... your generated array of objects here ... ]
}
Make sure you return exactly this JSON structure.`;
        }

        const result = await generateContentWithRetry(model, prompt, req.tokenWallet);
        let responseText = result.response.text();
        
        // Post-process spreadsheet business tasks to ensure the exact template is used
        const businessTypes = ['balance_sheet', 'income_statement', 'cash_flow', 't_account', 'trial_balance', 'journal_entries', 'budget', 'inventory'];
        if (type === 'SPREADSHEET' && businessTypes.includes(spreadsheetTask)) {
            try {
                let cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanJson);
                
                let targetArray = null;
                if (Array.isArray(parsed)) targetArray = parsed;
                else if (parsed.questions && Array.isArray(parsed.questions)) targetArray = parsed.questions;

                if (targetArray && targetArray[0]?.config) {
                    targetArray[0].config.starterData = SPREADSHEET_TEMPLATES[spreadsheetTask];
                    responseText = JSON.stringify(parsed, null, 2);
                }
            } catch (err) {
                console.error("Failed to post-process spreadsheet template", err);
            }
        }

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

/**
 * POST /ai/generate-study-material
 *
 * Generates AI study materials (notes or a practice quiz) based on the content
 * of a specific learning material document.
 *
 * Authorization: The requesting user must be a MEMBER of the classroom that
 * owns the material. This prevents users from generating content from materials
 * in classrooms they haven't joined.
 */
export const generateStudyMaterial = async (req, res, next) => {
    try {
        const { materialId, type } = req.body; // type = 'quiz' or 'notes'

        // 1. Fetch the learning material
        const material = await prisma.learningMaterial.findUnique({ where: { id: materialId } });
        if (!material) return res.status(404).json({ error: 'Material not found' });

        // SECURITY: Verify the user is a member of the classroom this material belongs to.
        // This prevents users from generating study materials from classrooms they haven't joined.
        await assertClassroomMember(material.classroomId, req.user.id);

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
            const randomSeed = Math.floor(Math.random() * 100000);
            prompt = `You are Likhâ, a friendly and highly accurate human-like tutor. Based ONLY on the following document context, create a multiple choice review quiz to help the user practice.
To ensure variety, focus on random, diverse concepts scattered throughout the document (Seed: ${randomSeed}).

CRITICAL INSTRUCTION: You MUST generate EXACTLY 5 questions.
CRITICAL INSTRUCTION: You MUST respond strictly in the following JSON format. Do not include any other text or markdown:
{
  "questions": [
    {
      "question": "The question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why this is correct."
    }
  ]
}
Note: Ensure there are exactly 5 objects inside the "questions" array.`;
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

        let finalContent = result.response.text();
        if (type === 'quiz') {
            finalContent = finalContent.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        }

        res.json({
            content: finalContent,
            tokensUsed: tokensToDeduct,
            remainingTokens: req.tokenWallet.availableTokens - tokensToDeduct
        });
    } catch (e) {
        next(e);
    }
};

/**
 * POST /ai/grade-submission
 *
 * Uses Gemini AI to suggest scores and feedback for each answer in a student
 * submission. Returns a grading recommendation that the teacher can accept or
 * adjust — it does NOT automatically apply the grades.
 *
 * Authorization: Only the activity CREATOR or the classroom OWNER (teacher)
 * can request AI grading. Students cannot grade their own submissions.
 */
export const gradeWithAI = async (req, res, next) => {
    try {
        const { submissionId } = req.body;

        // 1. Fetch the submission with its activity, questions, and answers
        const submission = await prisma.submission.findUnique({
            where: { id: submissionId },
            include: {
                Activity: { include: { questions: true } },
                answers: true
            }
        });

        if (!submission) return res.status(404).json({ error: 'Submission not found' });

        // SECURITY: Only the activity creator or classroom owner can use AI grading.
        // Students must not be able to AI-grade their own submissions.
        const activity = submission.Activity;
        if (activity.createdBy !== req.user.id) {
            const member = await prisma.classroomUser.findUnique({
                where: { classroomId_userId: { classroomId: activity.classroomId, userId: req.user.id } }
            });
            if (!member || member.role !== 'OWNER') {
                return res.status(403).json({
                    error: 'Only the activity creator or classroom owner can use AI-assisted grading'
                });
            }
        }

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
                promptText += `\n--- Answer ID: ${ans.id} ---\nQuestion (${q.points} Pts): ${q.content}\nStudent Answer: ${JSON.stringify(ans.content)}\n`;
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

/**
 * POST /ai/idea-spark
 *
 * Generates creative teaching ideas for a given topic: hook ideas, activity
 * suggestions, and discussion questions. Useful for teacher brainstorming.
 *
 * Authorization: Any authenticated user with sufficient tokens can use this.
 */
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

/**
 * GET /ai/token-info
 *
 * Returns the authenticated user's current token balance and the time at
 * which their daily token quota will next reset. Does NOT deduct tokens.
 * Used by the frontend to display the token counter in the UI.
 */
export const getTokenInfo = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { virtualTokens: true, lastTokenReset: true }
        });
        
        let tokens = user ? user.virtualTokens : 50000;
        
        if (user) {
            const now = new Date();
            const lastReset = new Date(user.lastTokenReset);
            const isDifferentDay =
              lastReset.getDate() !== now.getDate() ||
              lastReset.getMonth() !== now.getMonth() ||
              lastReset.getFullYear() !== now.getFullYear();
              
            if (isDifferentDay) {
                tokens = 50000;
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
