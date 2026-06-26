import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'fake-key-for-local');
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

async function test() {
    try {
        const prompt = "Generate a quiz about java loops";
        const countResult = await model.countTokens(prompt);
        console.log("Count result:", countResult);
    } catch (e) {
        console.error("Error in countTokens:", e);
    }
}
test();
