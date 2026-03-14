export const config = {
  apiKey: ''
};

export const setApiKey = (key: string) => {
  config.apiKey = key;
};

export const getApiKey = () => {
  return config.apiKey || process.env.GEMINI_API_KEY;
};
