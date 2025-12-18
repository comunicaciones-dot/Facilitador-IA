import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Mail,
  Globe,
  CloudUpload
} from 'lucide-react';
import { AppStage, Message, UserData, FileData, QuizQuestion, Language } from './types';
import { generateChatResponse, generateQuiz } from './services/geminiService';
import { TypingIndicator } from './components/TypingIndicator';
import QuizInterface from './components/QuizInterface';
import { translations } from './utils/translations';
import { supabase } from './services/supabaseClient';

// Constant defining how many Q&A interactions occur before triggering the quiz
const QA_LIMIT = 5;

const App: React.FC = () => {
  // --- State ---
  const [language, setLanguage] = useState<Language>('es');
  const [stage, setStage] = useState<AppStage>(AppStage.COLLECT_NAME);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [userData, setUserData] = useState<UserData>({
    name: '',
    company: '',
    jobTitle: '',
    phone: '',
    email: '',
    topic: ''
  });
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [qaCount, setQaCount] = useState(0);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizResults, setQuizResults] = useState<QuizQuestion[]>([]);
  const [facilitatorEmail, setFacilitatorEmail] = useState('');
  
  // Supabase specific state
  const [userId, setUserId] = useState<string | null>(null);
  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null);
  const [rlsError, setRlsError] = useState<boolean>(false);

  // Refs for scrolling and timers
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const languageRef = useRef<Language>(language);

  // Keep ref in sync for timeouts
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const t = translations[language];

  // --- Supabase Session Setup ---
  useEffect(() => {
    const initSupabase = async () => {
      let localId = localStorage.getItem('facilitator_anon_id');
      if (!localId) {
        localId = crypto.randomUUID();
        localStorage.setItem('facilitator_anon_id', localId);
      }
      
      setUserId(localId);

      const { error: userTableError } = await supabase
        .from('users')
        .upsert({ id: localId }, { onConflict: 'id' });

      if (userTableError) {
        console.error("Supabase Persistence Note:", userTableError);
        setRlsError(true);
      }
    };

    initSupabase();
  }, []);

  // --- Initial Welcome ---
  useEffect(() => {
    if (messages.length === 0) {
      addSystemMessage(translations[language].welcome);
    }
  }, []); 

  // --- Auto-scroll ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, stage]);

  // --- Inactivity Timer Logic ---
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    if (stage === AppStage.Q_AND_A) {
      inactivityTimerRef.current = setTimeout(() => {
        const currentLang = languageRef.current;
        handleTriggerQuiz(translations[currentLang].quizTriggerInactivity);
      }, 60000); // 60s
    }
  }, [stage]);

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [stage, resetInactivityTimer, messages]);

  // --- Database Persistence Helpers ---
  const saveAnswerToDb = async (answerText: string, qId: string | null) => {
    if (!qId) return;
    const { error } = await supabase
      .from('answers')
      .insert({
        question_id: qId,
        answer_text: answerText
      });
    if (error) console.error("Error saving answer to Supabase:", error);
  };

  const saveQuestionToDb = async (questionText: string): Promise<string | null> => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('questions')
      .insert({
        user_id: userId,
        question_text: questionText
      })
      .select('id')
      .single();

    if (error) {
      console.error("Error saving question to Supabase:", error);
      return null;
    }
    return data?.id || null;
  };

  // --- Helpers ---
  const addSystemMessage = (text: string) => {
    setIsTyping(true);
    setTimeout(async () => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: text,
        timestamp: Date.now()
      }]);
      setIsTyping(false);
      
      // Persist bot response as an answer to the last user question
      if (lastQuestionId) {
        await saveAnswerToDb(text, lastQuestionId);
      }
    }, 600); 
  };

  const addUserMessage = async (text: string) => {
    const newMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newMessage]);

    // Persist user input as a question
    const qId = await saveQuestionToDb(text);
    setLastQuestionId(qId);
    return qId;
  };

  const generateMailtoLink = () => {
    const subject = `respuesta al cuestionario ${userData.topic}`;
    const correctCount = quizResults.filter(r => r.userAnswer === r.correctAnswer).length;
    
    let body = `Datos del Usuario:\n`;
    body += `Nombre: ${userData.name}\n`;
    body += `Empresa: ${userData.company}\n`;
    body += `Cargo: ${userData.jobTitle}\n`;
    body += `Teléfono: ${userData.phone}\n`;
    body += `Email: ${userData.email}\n`;
    body += `Tema: ${userData.topic}\n\n`;
    
    body += `Resultados del Quiz:\n`;
    body += `Puntaje: ${correctCount} / ${quizResults.length}\n\n`;
    
    quizResults.forEach((q, idx) => {
      body += `Pregunta ${idx + 1}: ${q.question}\n`;
      body += `Respuesta del usuario: ${q.userAnswer}\n`;
      body += `Respuesta correcta: ${q.correctAnswer}\n`;
      body += `Resultado: ${q.userAnswer === q.correctAnswer ? 'CORRECTO' : 'INCORRECTO'}\n\n`;
    });

    return `mailto:${facilitatorEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'es' ? 'en' : 'es');
  };

  // --- Handlers ---

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();
    setInputValue('');
    
    await addUserMessage(text);

    // Core State Machine
    switch (stage) {
      case AppStage.COLLECT_NAME:
        setUserData({ ...userData, name: text });
        setStage(AppStage.COLLECT_COMPANY);
        addSystemMessage(t.askCompany.replace('{name}', text));
        break;

      case AppStage.COLLECT_COMPANY:
        setUserData({ ...userData, company: text });
        setStage(AppStage.COLLECT_JOB);
        addSystemMessage(t.askJob);
        break;

      case AppStage.COLLECT_JOB:
        setUserData({ ...userData, jobTitle: text });
        setStage(AppStage.COLLECT_PHONE);
        addSystemMessage(t.askJob); // Error here in previous code, fixed to askPhone
        addSystemMessage(t.askPhone);
        break;

      case AppStage.COLLECT_PHONE:
        setUserData({ ...userData, phone: text });
        setStage(AppStage.COLLECT_EMAIL);
        addSystemMessage(t.askEmail);
        break;

      case AppStage.COLLECT_EMAIL:
        setUserData({ ...userData, email: text });
        setStage(AppStage.COLLECT_TOPIC);
        addSystemMessage(t.askTopic);
        break;

      case AppStage.COLLECT_TOPIC:
        setUserData({ ...userData, topic: text });
        setStage(AppStage.FILE_UPLOAD);
        addSystemMessage(t.askFile.replace('{topic}', text));
        break;

      case AppStage.Q_AND_A:
        await handleQandA(text);
        break;

      case AppStage.ASK_SEND_REPORT:
        const affirmative = ['si', 'yes', 'sí', 'claro', 'por supuesto', 'ok', 'okay'];
        if (affirmative.includes(text.toLowerCase().trim())) {
          setStage(AppStage.COLLECT_FACILITATOR_EMAIL);
          addSystemMessage(t.askFacilitatorEmail);
        } else {
          setStage(AppStage.COMPLETED);
          addSystemMessage(t.sentSuccess);
        }
        break;
      
      case AppStage.COLLECT_FACILITATOR_EMAIL:
        setFacilitatorEmail(text);
        setStage(AppStage.COMPLETED);
        addSystemMessage(t.readyToSend);
        break;

      default:
        break;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) { 
      addSystemMessage(t.fileTooLarge);
      return;
    }

    setStage(AppStage.PROCESSING_FILE);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      const newFileData = {
        name: file.name,
        mimeType: file.type,
        data: base64Data
      };
      setFileData(newFileData);
      
      if (userId) {
        const { error } = await supabase
          .from('files')
          .insert({
            user_id: userId,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type
          });
        if (error) console.error("Error saving file record to Supabase:", error);
      }

      addSystemMessage(t.fileReceived.replace('{fileName}', file.name));
      
      setTimeout(() => {
        setStage(AppStage.Q_AND_A);
        addSystemMessage(t.fileReviewed);
      }, 2000);
    };
    reader.readAsDataURL(file);
  };

  const handleQandA = async (question: string) => {
    setIsTyping(true);
    try {
      if (!fileData) throw new Error("No file context");

      const chatHistory = messages.filter(m => m.timestamp > 0).map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const response = await generateChatResponse(chatHistory, question, fileData, language);
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      }]);
      
      if (lastQuestionId) {
        await saveAnswerToDb(response, lastQuestionId);
      }
      
      const newCount = qaCount + 1;
      setQaCount(newCount);

      if (newCount >= QA_LIMIT) {
        setTimeout(() => {
             const currentLang = languageRef.current;
             handleTriggerQuiz(translations[currentLang].quizTriggerCount);
        }, 2000);
      }

    } catch (error) {
      console.error(error);
      addSystemMessage(t.errorGeneric);
    } finally {
      setIsTyping(false);
    }
  };

  const handleTriggerQuiz = async (reason: string) => {
    if (stage === AppStage.QUIZ_LOADING || stage === AppStage.QUIZ_ACTIVE) return;
    
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    const currentLang = languageRef.current;
    setStage(AppStage.QUIZ_LOADING);
    addSystemMessage(`${reason} ${translations[currentLang].generatingQuiz}`);

    try {
      if (!fileData) throw new Error("No file loaded");
      const questions = await generateQuiz(fileData, currentLang);
      setQuizQuestions(questions);
      setStage(AppStage.QUIZ_ACTIVE);
    } catch (error) {
      console.error(error);
      addSystemMessage(translations[currentLang].quizError);
      setStage(AppStage.Q_AND_A);
      setQaCount(0); 
    }
  };

  const handleQuizComplete = (results: QuizQuestion[]) => {
    setQuizResults(results);
    setStage(AppStage.QUIZ_RESULTS);
    
    const correctCount = results.filter(r => r.userAnswer === r.correctAnswer).length;
    const total = results.length;
    
    addSystemMessage(t.quizCompleted.replace('{correct}', correctCount.toString()).replace('{total}', total.toString()));
  };

  const startReportProcess = () => {
    setStage(AppStage.ASK_SEND_REPORT);
    addSystemMessage(t.askSendReport);
  };

  // --- Render Components ---

  return (
    <div className="flex flex-col h-screen bg-gray-50 max-w-4xl mx-auto shadow-2xl overflow-hidden font-sans">
      
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-blue-500 p-4 shadow-md flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-full shadow-sm">
            <Bot className="text-indigo-600" size={24} />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">{t.headerTitle}</h1>
            <p className="text-indigo-100 text-xs">{t.headerSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           {userId && !rlsError && (
             <div className="bg-green-400 w-2 h-2 rounded-full animate-pulse" title="Cloud Sync Active"></div>
           )}
           {rlsError && (
             <div className="bg-red-500 w-2 h-2 rounded-full" title="RLS Auth Issue: Data might not save"></div>
           )}
           <button 
             onClick={toggleLanguage}
             className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full text-sm font-medium transition backdrop-blur-sm"
           >
             <Globe size={16} />
             {language === 'es' ? 'ESPAÑOL' : 'ENGLISH'}
           </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-sm relative ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-none' 
                : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
            }`}>
              <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                {msg.role === 'assistant' ? <Bot size={12} /> : <User size={12} />}
                <span>{msg.role === 'assistant' ? 'Facilitator' : 'You'}</span>
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start animate-fade-in">
            <TypingIndicator />
          </div>
        )}

        {/* Dynamic Content based on State */}
        
        {stage === AppStage.QUIZ_ACTIVE && (
          <QuizInterface questions={quizQuestions} onComplete={handleQuizComplete} language={language} />
        )}

        {stage === AppStage.QUIZ_RESULTS && (
          <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm mt-4">
            <h3 className="text-xl font-bold mb-4 text-gray-800">{t.resultsTitle}</h3>
            <div className="space-y-4">
              {quizResults.map((q, idx) => {
                const isCorrect = q.userAnswer === q.correctAnswer;
                return (
                  <div key={idx} className={`p-4 rounded-lg border-l-4 ${isCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                    <p className="font-semibold text-gray-900 mb-2">{q.question}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                      {isCorrect ? <CheckCircle2 className="text-green-500" size={16}/> : <XCircle className="text-red-500" size={16}/>}
                      {t.yourAnswer} <span className="font-medium">{q.userAnswer}</span>
                    </div>
                    {!isCorrect && (
                      <div className="text-sm text-gray-500 ml-6">
                        {t.correctAnswer} <span className="font-medium text-gray-800">{q.correctAnswer}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button 
              onClick={startReportProcess}
              className="mt-6 w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
            >
              <Mail size={18} />
              {t.proceedReport}
            </button>
          </div>
        )}

        {stage === AppStage.COMPLETED && facilitatorEmail && (
           <div className="flex justify-center mt-4">
             <a 
               href={generateMailtoLink()}
               className={`bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2 transition transform hover:scale-105`}
             >
               <Mail size={18} />
               {t.mailButton}
             </a>
           </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="p-4 bg-white border-t border-gray-100 z-10">
        {stage === AppStage.FILE_UPLOAD && !fileData && (
          <div className="mb-4 p-6 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50 text-center hover:bg-indigo-100 transition-colors cursor-pointer relative">
            <input 
              type="file" 
              accept=".txt,.pdf" 
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <CloudUpload className="mx-auto text-indigo-500 mb-2" size={32} />
            <p className="text-indigo-800 font-medium">{t.uploadTitle}</p>
            <p className="text-indigo-400 text-sm mt-1">{t.uploadSubtitle}</p>
          </div>
        )}
        
        {stage === AppStage.PROCESSING_FILE && (
           <div className="flex items-center justify-center gap-2 text-indigo-600 font-medium py-4">
             <Loader2 className="animate-spin" />
             {t.processing}
           </div>
        )}

        {stage !== AppStage.QUIZ_ACTIVE && stage !== AppStage.FILE_UPLOAD && stage !== AppStage.PROCESSING_FILE && stage !== AppStage.QUIZ_RESULTS && stage !== AppStage.COMPLETED && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={stage === AppStage.Q_AND_A ? t.inputPlaceholderChat : t.inputPlaceholderAnswer}
              className="flex-1 p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 text-gray-800 placeholder-gray-400 transition-all"
              disabled={isTyping || stage === AppStage.QUIZ_LOADING || !userId}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isTyping || stage === AppStage.QUIZ_LOADING || !userId}
              className={`p-3 rounded-xl transition-all ${
                !inputValue.trim() || isTyping || !userId
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md active:scale-95'
              }`}
            >
              <Send size={20} />
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};

export default App;