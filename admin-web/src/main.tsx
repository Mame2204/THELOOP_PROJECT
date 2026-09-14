import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { PermissionsProvider } from './context/PermissionsContext';
import { AdminCountryProvider } from './context/AdminCountryContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PermissionsProvider>
          <AdminCountryProvider>
            <App />
          </AdminCountryProvider>
        </PermissionsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
