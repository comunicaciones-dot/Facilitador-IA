import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion, FileData, Language } from "../types";

// Helper to get AI instance safely using named parameters and environment variable API_KEY
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY not found in environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateChatResponse = async (
  history: { role: string; parts: { text?: string }[] }[],
  lastMessage: string,
  fileData: FileData | undefined,
  language: Language
): Promise<string> => {
  const ai = getAI();
  
  // Using gemini-3-flash-preview for basic text and document Q&A as recommended
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

  // Add conversation history to maintain context
  history.forEach(h => {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: h.parts
    });
  });

  // Add the current user message
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

  // Extracting text as a property, not calling it as a method
  return response.text || (language === 'es' ? "Lo siento, no pude generar una respuesta." : "I apologize, I couldn't generate a response.");
};

export const generateQuiz = async (fileData: FileData, language: Language): Promise<QuizQuestion[]> => {
  const ai = getAI();
  const modelId = "gemini-3-flash-preview";

  // Recommended schema configuration for JSON output
  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: {
          type: Type.STRING,
          description: 'The quiz question.'
        },
        options: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
          description: 'Exactly 3 options for the question.'
        },
        correctAnswer: {
          type: Type.STRING, 
          description: "Must be exactly one of the strings in the options array." 
        }
      },
      required: ["question", "options", "correctAnswer"],
      propertyOrdering: ["question", "options", "correctAnswer"]
    }
  };

  const promptEn = "Generate a quiz based on this document. Create between 5 and 10 questions depending on the length and complexity of the content. Each question must have exactly 3 options with only one correct answer.";
  const promptEs = "Genera un quiz basado en este documento. Crea entre 5 y 10 preguntas dependiendo de la longitud y complejidad del contenido. Cada pregunta debe tener exactamente 3 opciones con una sola respuesta correcta.";

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: fileData.mimeType,
              data: fileData.data
            }
          },
          {
            text: language === 'es' ? promptEs : promptEn
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.3,
    }
  });

  // Extracting text as a property
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
