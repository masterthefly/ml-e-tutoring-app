import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { ConnectionIndicator } from './components/WebSocket/ConnectionIndicator';
import './styles/global.css';

const App: React.FC = () => {
  return (
    <Router>
      <div className="app" role="application" aria-label="ML-E Learning Platform">
        <ConnectionIndicator />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ChatPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
          </Route>
        </Routes>
      </div>
    </Router>
  );
};

export default App;