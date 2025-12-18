import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const rootElement = document.getElementById('root');

const displayError = (err: any) => {
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; text-align: center;">
        <h1 style="color: #ef4444;">Error de Carga</h1>
        <p style="color: #4b5563;">La aplicación no pudo iniciarse correctamente.</p>
        <pre style="background: #f3f4f6; padding: 20px; border-radius: 8px; display: inline-block; text-align: left; max-width: 90%;">
${err?.message || err}
        </pre>
        <p style="font-size: 14px; color: #9ca3af; margin-top: 20px;">
          Asegúrate de haber configurado <b>API_KEY</b> en Vercel y que las variables de Supabase sean correctas.
        </p>
      </div>
    `;
  }
};

if (!rootElement) {
  console.error("Could not find root element to mount to");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Critical error during React mount:", error);
    displayError(error);
  }
}

// Global error handler for uncaught module errors
window.addEventListener('error', (event) => {
  if (event.message.includes('Script error') || event.message.includes('MIME type')) {
    displayError("Error de carga de scripts. Verifica que los archivos .tsx se estén transpilando correctamente.");
  }
});