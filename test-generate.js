import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'fake-key-for-local');
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

async function test() {
    try {
        const promptString = "Write a 10 word story.";
        // Format 1: Just string
        let req1 = {
            contents: [{ role: 'user', parts: [{ text: promptString }] }],
            generationConfig: { maxOutputTokens: 5 }
        };
        const result1 = await model.generateContent(req1);
        console.log("Result 1 (string capped to 5 tokens):", result1.response.text());

        const promptParts = [{ text: "Write a 10 word story." }];
        let req2 = {
            contents: [{ role: 'user', parts: promptParts }],
            generationConfig: { maxOutputTokens: 5 }
        };
        const result2 = await model.generateContent(req2);
        console.log("Result 2 (parts capped to 5 tokens):", result2.response.text());

    } catch (e) {
        console.error("Error:", e);
    }
}
test();
