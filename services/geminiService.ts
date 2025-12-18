import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion, FileData, Language } from "../types.ts";

const getAI = () => {
  // Directly use process.env.API_KEY as per instructions and Vercel standards
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
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
    const contents: any[] = [];
    
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
    if (err.message === "API_KEY_MISSING") {
      return language === 'es' 
        ? "Error: No se detecta la API_KEY. Si ya la agregaste en Vercel, debes hacer un 'Redeploy' para que los cambios surtan efecto." 
        : "Error: API_KEY not detected. If you already added it in Vercel, you must trigger a 'Redeploy' for changes to take effect.";
    }
    console.error("Gemini API Error:", err);
    return language === 'es' ? "Ocurrió un error al consultar a la IA." : "An error occurred while querying the AI.";
  }
};

export const generateQuiz = async (fileData: FileData, language: Language): Promise<QuizQuestion[]> => {
  try {
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
            { text: language === 'es' ? "Genera un quiz de 5 preguntas sobre este archivo en español basándote solo en su contenido." : "Generate a 5-question quiz about this file in English based strictly on its content." }
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
      return JSON.parse(response.text.trim()) as QuizQuestion[];
    }
  } catch (e) {
    console.error("Failed to generate/parse quiz", e);
  }
  return [];
};