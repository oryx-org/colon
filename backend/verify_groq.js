const https = require('https');
require('dotenv').config();

async function testGroq() {
    console.log('Testing Groq API Key...');
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;

    const body = JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: "Say 'Groq is Lightning Fast!'" }],
        max_tokens: 20
    });

    const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.choices?.[0]) {
                    console.log('RESPONSE:', json.choices[0].message.content);
                    console.log('STATUS: SUCCESS ✅');
                } else {
                    console.log('STATUS: FAILED ❌');
                    console.log('ERROR:', json.error ? json.error.message : 'Unknown error');
                }
            } catch (e) {
                console.log('STATUS: FAILED ❌');
                console.log('PARSE ERROR:', e.message);
                console.log('DATA:', data);
            }
        });
    });

    req.on('error', (e) => {
        console.log('STATUS: FAILED ❌');
        console.log('REQUEST ERROR:', e.message);
    });

    req.write(body);
    req.end();
}

testGroq();
