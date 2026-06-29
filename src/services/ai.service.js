/**
 * ─── AI Service ───────────────────────────────────────────────────────────────
 *
 * This service handles communication with the Google Generative AI (Gemini) API.
 * It provides utility functions for estimating token counts and wrapping
 * generation requests with exponential backoff and fallback models to
 * gracefully handle rate limits or service overloads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || 'fake-key-for-local');

// Select default models
export const getFlashModel = () => genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
export const getProModel = () => genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

/**
 * A utility to estimate tokens to deduct based on response metadata.
 * Usage metadata isn't always perfectly 1:1 with virtual tokens, 
 * but we can use totalTokenCount as a rough metric.
 */
export const calculateVirtualTokens = (usageMetadata) => {
    if (!usageMetadata) return 10; // Base fallback
    // We can simply charge 1 virtual token per actual token
    return usageMetadata.totalTokenCount || 10;
};

/**
 * Wraps model.generateContent with exponential backoff for 503/429 errors
 */
export const generateContentWithRetry = async (primaryModel, prompt, tokenWallet, maxRetries = 2) => {
    let maxAllowedOutputTokens = undefined;

    // Pre-flight token check
    if (tokenWallet) {
        // Hard minimum buffer: prevent starting any generation if balance is critically low
        const requiredBuffer = 400;
        if (tokenWallet.availableTokens < requiredBuffer) {
            const err = new ApiError(402, `Not enough tokens. You need at least ${requiredBuffer} tokens to generate AI content, but you only have ${tokenWallet.availableTokens}.`);
            err.status = 402;
            throw err;
        }

        try {
            const countResult = await primaryModel.countTokens(prompt);
            const estimatedTokens = countResult.totalTokens;
            // Assume at least 400 tokens needed for the output to prevent truncated JSON
            if (tokenWallet.availableTokens < estimatedTokens + requiredBuffer) {
                const err = new ApiError(402, `Not enough tokens. You need at least ~${estimatedTokens + requiredBuffer} tokens for this generation to complete successfully, but you only have ${tokenWallet.availableTokens}.`);
                err.status = 402;
                throw err;
            }
            // Strictly cap output to whatever tokens are left, so we never go negative
            maxAllowedOutputTokens = Math.max(1, tokenWallet.availableTokens - estimatedTokens);
        } catch (error) {
            if (error.statusCode === 402 || error.status === 402) throw error;
            console.warn("Failed to estimate tokens:", error);
            // Default cap if countTokens somehow fails but not 402
            maxAllowedOutputTokens = Math.max(50, tokenWallet.availableTokens - 50);
        }
    }

    let requestPayload;
    if (typeof prompt === 'string') {
         requestPayload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    } else if (Array.isArray(prompt)) {
         requestPayload = { contents: [{ role: 'user', parts: prompt }] };
    } else {
         requestPayload = { ...prompt };
    }

    if (maxAllowedOutputTokens) {
         requestPayload.generationConfig = {
              ...(requestPayload.generationConfig || {}),
              maxOutputTokens: maxAllowedOutputTokens
         };
    }

    // Define fallbacks in case the primary model is overloaded (503) or rate-limited (429)
    const fallbackModels = [
        primaryModel,
        genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })
    ];

    let lastError = null;

    for (let model of fallbackModels) {
        let retries = 0;
        while (retries <= maxRetries) {
            try {
                return await model.generateContent(requestPayload);
            } catch (error) {
                lastError = error;
                retries++;
                const status = error?.status;
                const message = error?.message || '';
                const isRetryable = status === 503 || status === 429 || message.includes('503') || message.includes('429') || message.includes('fetch failed');
                
                if (!isRetryable) {
                    // Not a rate-limit or overload, so throw immediately
                    throw error;
                }

                if (retries > maxRetries) {
                    console.warn(`[Fallback] Model ${model.model} exhausted retries. Switching to next fallback...`);
                    break; // Break the while loop, proceed to the next model in the fallback array
                }
                
                const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
                console.log(`[${model.model}] AI request failed (retry ${retries}/${maxRetries}), waiting ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // If we exhausted all fallback models
    throw new Error("The AI is currently experiencing exceptionally high demand across all endpoints. Please try again in a few moments.");
};
