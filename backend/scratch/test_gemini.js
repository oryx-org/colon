const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGemini() {
    const apiKey = "AIzaSyAxP75qJKtoIivrc3kl_fdKvSslBo6BrDs";
    const modelName = "gemini-2.5-flash";

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
