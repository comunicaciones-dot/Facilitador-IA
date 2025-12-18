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
  CloudUpload,
  AlertCircle,
  DatabaseZap
} from 'lucide-react';
import { AppStage, Message, UserData, FileData, QuizQuestion, Language } from './types.ts';
import { generateChatResponse, generateQuiz } from './services/geminiService.ts';
import { TypingIndicator } from './components/TypingIndicator.tsx';
import QuizInterface from './components/QuizInterface.tsx';
import { translations } from './utils/translations.ts';
import { supabase } from './services/supabaseClient.ts';

const QA_LIMIT = 5;

const App: React.FC = () => {
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
  
  const [userId, setUserId] = useState<string | null>(null);
  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'active' | 'error' | 'local'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const languageRef = useRef<Language>(language);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const t = translations[language];

  useEffect(() => {
    const initSupabase = async () => {
      if (!supabase) {
        setSyncStatus('local');
        setErrorMessage(language === 'es' ? "Modo Local: Claves de base de datos no configuradas." : "Local Mode: Database keys not configured.");
        return;
      }

      try {
        const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
        
        if (authError) {
          if (authError.message.includes("disabled")) {
            setSyncStatus('local');
            setErrorMessage(language === 'es' ? "Login Anónimo deshabilitado en el panel de Supabase." : "Anonymous login disabled in Supabase dashboard.");
          } else {
            throw authError;
          }
          return;
        }

        if (authData?.user) {
          const uid = authData.user.id;
          setUserId(uid);
          await supabase.from('users').upsert({ id: uid }).select();
          setSyncStatus('active');
        }
      } catch (err: any) {
        setSyncStatus('error');
        setErrorMessage(err.message || 'Error connecting to database');
        console.error("Supabase Initialization Error:", err.message || err);
      }
    };

    initSupabase();
  }, [language]);

  useEffect(() => {
    if (messages.length === 0) {
      addSystemMessage(translations[language].welcome);
    }
  }, []); 

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, stage]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (stage === AppStage.Q_AND_A) {
      inactivityTimerRef.current = setTimeout(() => {
        const currentLang = languageRef.current;
        handleTriggerQuiz(translations[currentLang].quizTriggerInactivity);
      }, 60000);
    }
  }, [stage]);

  useEffect(() => {
    resetInactivityTimer();
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
  }, [stage, resetInactivityTimer, messages]);

  const saveAnswerToDb = async (answerText: string, qId: string | null) => {
    if (!qId || !supabase || syncStatus !== 'active') return;
    try {
      await supabase.from('answers').insert({ question_id: qId, answer_text: answerText });
    } catch (err: any) {
      console.warn("Supabase: Error saving answer", err.message);
    }
  };

  const saveQuestionToDb = async (questionText: string): Promise<string | null> => {
    if (!userId || !supabase || syncStatus !== 'active') return null;
    try {
      const { data, error } = await supabase.from('questions').insert({ user_id: userId, question_text: questionText }).select('id').single();
      if (error) throw error;
      return data?.id || null;
    } catch (err: any) {
      console.warn("Supabase: Error saving question", err.message);
      return null;
    }
  };

  const addSystemMessage = (text: string) => {
    setIsTyping(true);
    setTimeout(async () => {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: text, timestamp: Date.now() }]);
      setIsTyping(false);
      if (lastQuestionId) await saveAnswerToDb(text, lastQuestionId);
    }, 600); 
  };

  const addUserMessage = async (text: string) => {
    const newMessage = { id: Date.now().toString(), role: 'user' as const, content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, newMessage]);
    const qId = await saveQuestionToDb(text);
    setLastQuestionId(qId);
    return qId;
  };

  const generateMailtoLink = () => {
    const subject = `Respuesta capacitación: ${userData.topic}`;
    const correctCount = quizResults.filter(r => r.userAnswer === r.correctAnswer).length;
    let body = `Datos del Usuario:\nNombre: ${userData.name}\nEmpresa: ${userData.company}\nCargo: ${userData.jobTitle}\nEmail: ${userData.email}\nTema: ${userData.topic}\n\nPuntaje: ${correctCount} / ${quizResults.length}\n\n`;
    quizResults.forEach((q, idx) => {
      body += `${idx + 1}. ${q.question}\nRespuesta: ${q.userAnswer} (${q.userAnswer === q.correctAnswer ? 'OK' : 'X'})\n\n`;
    });
    return `mailto:${facilitatorEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const toggleLanguage = () => setLanguage(prev => prev === 'es' ? 'en' : 'es');

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();
    setInputValue('');
    await addUserMessage(text);

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
        const affirmative = ['si', 'yes', 'sí', 'claro', 'ok'];
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
      default: break;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { addSystemMessage(t.fileTooLarge); return; }
    setStage(AppStage.PROCESSING_FILE);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      setFileData({ name: file.name, mimeType: file.type, data: base64Data });
      if (userId && supabase && syncStatus === 'active') {
        try { await supabase.from('files').insert({ user_id: userId, file_name: file.name, file_size: file.size, file_type: file.type }); } catch (e) {}
      }
      addSystemMessage(t.fileReceived.replace('{fileName}', file.name));
      setTimeout(() => { setStage(AppStage.Q_AND_A); addSystemMessage(t.fileReviewed); }, 2000);
    };
    reader.readAsDataURL(file);
  };

  const handleQandA = async (question: string) => {
    setIsTyping(true);
    try {
      if (!fileData) throw new Error("No file context");
      const chatHistory = messages.filter(m => m.timestamp > 0).map(m => ({ role: m.role, parts: [{ text: m.content }] }));
      const response = await generateChatResponse(chatHistory, question, fileData, language);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: response, timestamp: Date.now() }]);
      if (lastQuestionId) await saveAnswerToDb(response, lastQuestionId);
      const newCount = qaCount + 1;
      setQaCount(newCount);
      if (newCount >= QA_LIMIT) {
        setTimeout(() => { handleTriggerQuiz(translations[languageRef.current].quizTriggerCount); }, 2000);
      }
    } catch (error) { addSystemMessage(t.errorGeneric); } finally { setIsTyping(false); }
  };

  const handleTriggerQuiz = async (reason: string) => {
    if (stage === AppStage.QUIZ_LOADING || stage === AppStage.QUIZ_ACTIVE) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    setStage(AppStage.QUIZ_LOADING);
    addSystemMessage(`${reason} ${translations[languageRef.current].generatingQuiz}`);
    try {
      if (!fileData) throw new Error("No file loaded");
      const questions = await generateQuiz(fileData, languageRef.current);
      setQuizQuestions(questions);
      setStage(AppStage.QUIZ_ACTIVE);
    } catch (error) {
      addSystemMessage(translations[languageRef.current].quizError);
      setStage(AppStage.Q_AND_A);
      setQaCount(0); 
    }
  };

  const handleQuizComplete = (results: QuizQuestion[]) => {
    setQuizResults(results);
    setStage(AppStage.QUIZ_RESULTS);
    const correctCount = results.filter(r => r.userAnswer === r.correctAnswer).length;
    addSystemMessage(t.quizCompleted.replace('{correct}', correctCount.toString()).replace('{total}', results.length.toString()));
  };

  return (
    <div className="app-container bg-gray-50 max-w-4xl mx-auto shadow-2xl overflow-hidden font-sans">
      <header className="bg-gradient-to-r from-indigo-600 to-blue-500 p-3 sm:p-4 shadow-md flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-white p-1.5 sm:p-2 rounded-full shadow-sm">
            <Bot className="text-indigo-600" size={20} />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm sm:text-lg leading-tight">{t.headerTitle}</h1>
            <p className="text-indigo-100 text-[10px] sm:text-xs">{t.headerSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           {syncStatus === 'active' && (
             <div className="flex items-center gap-1 bg-green-500/20 px-1.5 py-1 rounded text-green-100 text-[9px] sm:text-[10px] font-bold">
               <div className="bg-green-400 w-1.5 h-1.5 rounded-full animate-pulse"></div>
               CLOUD
             </div>
           )}
           {syncStatus === 'local' && (
             <div className="flex items-center gap-1 bg-yellow-500/20 px-1.5 py-1 rounded text-yellow-100 text-[9px] sm:text-[10px] font-bold cursor-help group relative">
               <DatabaseZap size={10} />
               LOCAL
               <div className="absolute top-8 right-0 bg-gray-800 text-white text-[10px] p-2 rounded w-48 hidden group-hover:block z-50 border border-gray-700 shadow-xl font-normal">
                 {errorMessage}
               </div>
             </div>
           )}
           <button onClick={toggleLanguage} className="bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium transition backdrop-blur-sm">
             {language === 'es' ? 'ES' : 'EN'}
           </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-gray-50/50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div className={`max-w-[90%] sm:max-w-[75%] rounded-2xl p-3 sm:p-4 shadow-sm relative ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'}`}>
              <div className="flex items-center gap-2 mb-1 opacity-70 text-[10px]">
                {msg.role === 'assistant' ? <Bot size={10} /> : <User size={10} />}
                <span>{msg.role === 'assistant' ? 'Facilitador' : 'Tú'}</span>
              </div>
              <div className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base">{msg.content}</div>
            </div>
          </div>
        ))}
        {isTyping && <div className="flex justify-start"><TypingIndicator /></div>}
        {stage === AppStage.QUIZ_ACTIVE && <QuizInterface questions={quizQuestions} onComplete={handleQuizComplete} language={language} />}
        {stage === AppStage.QUIZ_RESULTS && (
          <div className="bg-white rounded-lg p-4 sm:p-6 border border-gray-200 shadow-sm mt-4">
            <h3 className="text-lg sm:text-xl font-bold mb-4 text-gray-800">{t.resultsTitle}</h3>
            <div className="space-y-3">
              {quizResults.map((q, idx) => {
                const isCorrect = q.userAnswer === q.correctAnswer;
                return (
                  <div key={idx} className={`p-3 rounded-lg border-l-4 ${isCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                    <p className="font-semibold text-gray-900 text-sm mb-1">{q.question}</p>
                    <div className="text-xs text-gray-600">
                      {t.yourAnswer} <span className="font-medium">{q.userAnswer}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => { setStage(AppStage.ASK_SEND_REPORT); addSystemMessage(t.askSendReport); }} className="mt-4 w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 flex items-center justify-center gap-2"><Mail size={18} /> {t.proceedReport}</button>
          </div>
        )}
        {stage === AppStage.COMPLETED && facilitatorEmail && (
           <div className="flex justify-center mt-4 pb-4">
             <a href={generateMailtoLink()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2 transition active:scale-95"><Mail size={18} /> {t.mailButton}</a>
           </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-3 sm:p-4 bg-white border-t border-gray-100 z-10 pb-[env(safe-area-inset-bottom)]">
        {stage === AppStage.FILE_UPLOAD && !fileData && (
          <div className="mb-3 p-4 sm:p-6 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50 text-center hover:bg-indigo-100 transition relative">
            <input type="file" accept=".txt,.pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
            <CloudUpload className="mx-auto text-indigo-500 mb-2" size={28} />
            <p className="text-indigo-800 font-medium text-sm">{t.uploadTitle}</p>
            <p className="text-indigo-400 text-xs mt-1">{t.uploadSubtitle}</p>
          </div>
        )}
        {stage === AppStage.PROCESSING_FILE && <div className="flex items-center justify-center gap-2 text-indigo-600 font-medium py-3 text-sm"><Loader2 className="animate-spin" size={16} /> {t.processing}</div>}
        {stage !== AppStage.QUIZ_ACTIVE && stage !== AppStage.FILE_UPLOAD && stage !== AppStage.PROCESSING_FILE && stage !== AppStage.QUIZ_RESULTS && stage !== AppStage.COMPLETED && (
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              autoComplete="off"
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
              placeholder={stage === AppStage.Q_AND_A ? t.inputPlaceholderChat : t.inputPlaceholderAnswer} 
              className="flex-1 p-2.5 sm:p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 text-gray-800 text-sm sm:text-base placeholder-gray-400" 
              disabled={isTyping || stage === AppStage.QUIZ_LOADING} 
            />
            <button 
              onClick={handleSend} 
              disabled={!inputValue.trim() || isTyping || stage === AppStage.QUIZ_LOADING} 
              className={`p-2.5 sm:p-3 rounded-xl transition-all ${!inputValue.trim() || isTyping ? 'bg-gray-200 text-gray-400' : 'bg-indigo-600 text-white shadow-md active:scale-90'}`}
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