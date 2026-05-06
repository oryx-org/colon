/**
 * Gemini API verification script.
 * Reads API key from environment (.env) — never hardcode keys here.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGemini() {
    const apiKey = process.env.LLM_API_KEY;
    const modelName = process.env.LLM_MODEL || "gemini-2.5-flash";

    if (!apiKey || apiKey === 'your-api-key-here') {
        console.error("ERROR: Set LLM_API_KEY in backend/.env first.");
        process.exit(1);
    }

    console.log(`Testing Gemini API Key with model: ${modelName}`);

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent("Hello, are you working?");
        const response = await result.response;
        const text = response.text();

        console.log("SUCCESS! Gemini responded:");
        console.log(text);
    } catch (error) {
        console.error("FAILED! Gemini API error:");
        console.error(error.message);
        if (error.response) {
            console.error(JSON.stringify(error.response, null, 2));
        }
    }
}

testGemini();
