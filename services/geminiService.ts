import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion, FileData, Language } from "../types.ts";

// Secure helper to access environment variables without crashing the browser
const getEnv = (key: string): string | undefined => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
  } catch (e) {
    // process is not defined
  }
  return undefined;
};

const getAI = () => {
  const apiKey = getEnv('API_KEY');
  if (!apiKey) {
    console.error("CRITICAL: API_KEY not found. Ensure it is set in Vercel Environment Variables.");
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateChatResponse = async (
  history: { role: string; parts: { text?: string }[] }[],
  lastMessage: string,
  fileData: FileData | undefined,
  language: Language
): Promise<string> => {
  try {
    const ai = getAI();
    const modelId = "gemini-3-flash-preview";
    const contents = [];
    
    if (fileData) {
      contents.push({
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: fileData.mimeType,
              data: fileData.data
            }
          },
          {
            text: language === 'es' 
              ? "Aquí está el documento del que estamos hablando." 
              : "Here is the document we are discussing."
          }
        ]
      });
    }

    history.forEach(h => {
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: h.parts
      });
    });

    contents.push({
      role: 'user',
      parts: [{ text: lastMessage }]
    });

    const systemInstructionEs = "Eres un facilitador de capacitación útil y profesional. Responde preguntas estrictamente basadas en el contenido del documento proporcionado. Si la respuesta no está en el documento, indica cortésmente que no puedes encontrar la información en el material proporcionado. Después de responder, SIEMPRE pregunta al usuario si tiene otra duda sobre el archivo.";
    const systemInstructionEn = "You are a helpful and professional training facilitator. Answer questions strictly based on the provided document content. If the answer is not in the document, politely state that you cannot find the information in the provided material. After answering, ALWAYS ask the user if they have another doubt about the file.";

    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        systemInstruction: language === 'es' ? systemInstructionEs : systemInstructionEn,
      }
    });

    return response.text || (language === 'es' ? "Lo siento, no pude generar una respuesta." : "I apologize, I couldn't generate a response.");
  } catch (err: any) {
    if (err.message === "API_KEY_MISSING") return language === 'es' ? "Error: Falta la API_KEY en la configuración de Vercel." : "Error: API_KEY missing in Vercel settings.";
    throw err;
  }
};

export const generateQuiz = async (fileData: FileData, language: Language): Promise<QuizQuestion[]> => {
  const ai = getAI();
  const modelId = "gemini-3-flash-preview";

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswer: { type: Type.STRING }
      },
      required: ["question", "options", "correctAnswer"]
    }
  };

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: fileData.mimeType, data: fileData.data } },
          { text: language === 'es' ? "Genera un quiz de 5 preguntas sobre este archivo en español." : "Generate a 5-question quiz about this file in English." }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.3,
    }
  });

  if (response.text) {
    try {
      return JSON.parse(response.text.trim()) as QuizQuestion[];
    } catch (e) {
      console.error("Failed to parse quiz JSON", e);
      return [];
    }
  }
  return [];
};