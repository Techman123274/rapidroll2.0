import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { AdminProvider } from './context/AdminContext';
import { SoundProvider } from './context/SoundContext';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SoundProvider>
          <AdminProvider>
            <App />
          </AdminProvider>
        </SoundProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
