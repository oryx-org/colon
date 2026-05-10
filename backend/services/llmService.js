/**
 * LLM Service — Unified interface for OpenAI, Anthropic, Google Gemini, and Groq.
 *
 * Reads provider/key/model from environment:
 *   LLM_PROVIDER = "openai" | "anthropic" | "gemini" | "groq"
 *   LLM_API_KEY  = "<your key>"
 *   LLM_MODEL    = optional model override
 */

const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const DEFAULT_MODELS = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
    gemini: 'gemini-2.5-pro',
    groq: 'llama-3.3-70b-versatile',
};

/**
 * Load LLM config from process.env (set by loadEnv in main.js).
 */
function getConfig() {
    const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase().trim();
    const apiKey = (process.env.LLM_API_KEY || '').trim();
    const model = (process.env.LLM_MODEL || '').trim() || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
    return { provider, apiKey, model };
}

/**
 * Check if LLM is configured (has a real API key).
 */
function isConfigured() {
    const { provider, apiKey } = getConfig();
    if (provider === 'gemini') return true; // Gemini is routed through the proxy, no local key needed
    return apiKey && apiKey !== 'your-api-key-here' && apiKey.length > 10;
}

/**
 * Send a chat completion request to the configured LLM.
 * @param {string} systemPrompt — system message
 * @param {string} userPrompt — user message
 * @param {object} [opts] — { temperature, maxTokens }
 * @returns {Promise<string>} — assistant response text
 */
async function chatCompletion(systemPrompt, userPrompt, opts = {}) {
    const { provider, apiKey, model } = getConfig();
    const temperature = opts.temperature ?? 0.3;
    const maxTokens = opts.maxTokens ?? 4096;
    const forceJson = opts.forceJson ?? false;

    if (!isConfigured()) {
        throw new Error('LLM not configured. Set LLM_API_KEY in backend/.env');
    }

    switch (provider) {
        case 'openai':
            return callOpenAI(apiKey, model, systemPrompt, userPrompt, temperature, maxTokens);
        case 'anthropic':
            return callAnthropic(apiKey, model, systemPrompt, userPrompt, temperature, maxTokens);
        case 'gemini':
            return callGemini(apiKey, model, systemPrompt, userPrompt, temperature, maxTokens);
        case 'groq':
            return callGroq(apiKey, model, systemPrompt, userPrompt, temperature, maxTokens, forceJson);
        default:
            throw new Error(`Unknown LLM provider: "${provider}". Use openai, anthropic, gemini, or groq.`);
    }
}

/* ── OpenAI ── */
function callOpenAI(apiKey, model, system, user, temperature, maxTokens) {
    const body = JSON.stringify({
        model,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error(`OpenAI error: ${json.error.message}`));
                        return;
                    }
                    resolve(json.choices[0].message.content);
                } catch (e) {
                    reject(new Error(`OpenAI parse error: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(body);
        req.end();
    });
}

/* ── Anthropic ── */
function callAnthropic(apiKey, model, system, user, temperature, maxTokens) {
    const body = JSON.stringify({
        model,
        system,
        messages: [{ role: 'user', content: user }],
        temperature,
        max_tokens: maxTokens,
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error(`Anthropic error: ${json.error.message}`));
                        return;
                    }
                    const text = json.content?.find(c => c.type === 'text')?.text;
                    if (!text) reject(new Error('Anthropic: no text in response'));
                    else resolve(text);
                } catch (e) {
                    reject(new Error(`Anthropic parse error: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(body);
        req.end();
    });
}

/* ── Groq (OpenAI-compatible) ── */
function callGroq(apiKey, model, system, user, temperature, maxTokens, forceJson) {
    const payload = {
        model,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
    };

    if (forceJson) {
        payload.response_format = { type: 'json_object' };
    }

    const body = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error(`Groq error: ${json.error.message}`));
                        return;
                    }
                    resolve(json.choices[0].message.content);
                } catch (e) {
                    reject(new Error(`Groq parse error: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(body);
        req.end();
    });
}

async function callGemini(apiKey, model, system, user, temperature, maxTokens) {
    // We now route through our secure Cloudflare Worker proxy instead of hitting Google directly.
    // This prevents shipping the raw Gemini API key in the Electron desktop app.
    const proxyUrl = process.env.PROXY_URL || 'https://colon-llm-proxy.oryx-org.workers.dev';
    
    const body = JSON.stringify({
        model: model,
        contents: [{ role: 'user', parts: [{ text: user }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { temperature, maxOutputTokens: maxTokens }
    });

    return new Promise((resolve, reject) => {
        const reqUrl = new URL(proxyUrl);
        const req = https.request({
            hostname: reqUrl.hostname,
            path: reqUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error(`Proxy error: ${json.error.message || json.error}`));
                        return;
                    }
                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!text) throw new Error('Gemini Proxy: empty response');
                    resolve(text);
                } catch (e) {
                    reject(new Error(`Proxy parse error: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(body);
        req.end();
    });
}

module.exports = { chatCompletion, isConfigured, getConfig };
