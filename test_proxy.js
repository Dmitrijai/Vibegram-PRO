import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
    apiKey: 'fake',
    httpOptions: { baseUrl: 'https://corsproxy.io/?https://generativelanguage.googleapis.com' }
});

ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Hello'
}).then(console.log).catch(console.error);
