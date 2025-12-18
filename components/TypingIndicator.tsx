import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex space-x-1 p-2 bg-gray-200 rounded-br-xl rounded-tr-xl rounded-bl-xl w-fit">
      <div className="w-2 h-2 bg-gray-500 rounded-full typing-dot"></div>
      <div className="w-2 h-2 bg-gray-500 rounded-full typing-dot"></div>
      <div className="w-2 h-2 bg-gray-500 rounded-full typing-dot"></div>
    </div>
  );
};
