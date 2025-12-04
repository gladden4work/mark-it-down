/**
 * Configuration file for MarkItDown Chrome Extension
 * 
 * IMPORTANT: This file contains sensitive API keys.
 * DO NOT commit this file to version control.
 * 
 * Instructions:
 * 1. Copy this file: cp config.example.js config.js
 * 2. Replace the placeholder API key with your actual OpenAI API key
 * 3. Ensure config.js is in .gitignore (it should be by default)
 */

const CONFIG = {
    // Your OpenAI API key - get one at https://platform.openai.com/api-keys
    OPENAI_API_KEY: "sk-YOUR-OPENAI-KEY-HERE",
    
    // OpenAI model to use for image descriptions
    // Options: "gpt-4o-mini", "gpt-4o", "gpt-4-turbo", etc.
    OPENAI_MODEL: "gpt-4o-mini"
};

export default CONFIG;
