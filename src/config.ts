export const config = {
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    chatModel: process.env.OLLAMA_CHAT_MODEL || 'llama2',
    embedModel: process.env.OLLAMA_EMBED_MODEL || 'llama2',
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
  },
};
