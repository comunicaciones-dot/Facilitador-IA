import React, { useState } from 'react';
import { QuizQuestion, Language } from '../types';
import { CheckCircle, XCircle, Send, Award } from 'lucide-react';
import { translations } from '../utils/translations';

interface QuizInterfaceProps {
  questions: QuizQuestion[];
  onComplete: (answeredQuestions: QuizQuestion[]) => void;
  language: Language;
}

const QuizInterface: React.FC<QuizInterfaceProps> = ({ questions, onComplete, language }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localQuestions, setLocalQuestions] = useState<QuizQuestion[]>(questions);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const t = translations[language];

  // Safeguard against empty questions
  if (!questions || questions.length === 0) {
    return <div className="text-center p-4">No questions generated.</div>;
  }

  const currentQuestion = localQuestions[currentIndex];

  const handleOptionSelect = (option: string) => {
    if (isSubmitted) return;
    setSelectedOption(option);
  };

  const handleNext = () => {
    if (!selectedOption) return;

    // Save answer
    const updatedQuestions = [...localQuestions];
    updatedQuestions[currentIndex].userAnswer = selectedOption;
    setLocalQuestions(updatedQuestions);

    if (currentIndex < localQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
    } else {
      setIsSubmitted(true);
      onComplete(updatedQuestions);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl mx-auto border border-gray-100 mt-4">
      <div className="flex items-center justify-between mb-6 border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Award className="text-indigo-600" />
          {t.quizTitle}
        </h2>
        <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          {t.questionLabel} {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <div className="mb-6">
        <p className="text-lg text-gray-700 font-medium mb-4">{currentQuestion.question}</p>
        
        <div className="space-y-3">
          {currentQuestion.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleOptionSelect(option)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 flex items-center justify-between group
                ${selectedOption === option 
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                  : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }
              `}
            >
              <span className="font-medium">{option}</span>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                 ${selectedOption === option ? 'border-indigo-600' : 'border-gray-300'}
              `}>
                {selectedOption === option && (
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleNext}
          disabled={!selectedOption}
          className={`px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 text-white shadow-sm transition-all
            ${!selectedOption 
              ? 'bg-gray-300 cursor-not-allowed' 
              : 'bg-indigo-600 hover:bg-indigo-700 active:transform active:scale-95'
            }
          `}
        >
          {currentIndex === questions.length - 1 ? t.finishButton : t.nextButton}
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default QuizInterface;
