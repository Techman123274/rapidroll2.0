import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Games from './pages/Games';
import Originals from './pages/Originals';
import Slots from './pages/Slots';
import TableGames from './pages/TableGames';
import Promotions from './pages/Promotions';
import Vip from './pages/Vip';
import Login from './pages/Login';
import Register from './pages/Register';
import Wallet from './pages/Wallet';
import DailyBonus from './pages/DailyBonus';
import GamePlay from './pages/GamePlay';
import Settings from './pages/Settings';
import Tournaments from './pages/Tournaments';
import Leaderboard from './pages/Leaderboard';
import Challenges from './pages/Challenges';
import Admin from './pages/Admin';
import InfoPage from './pages/InfoPage';
import NotFound from './pages/NotFound';
import { useAuth } from './context/AuthContext';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin' && user.role !== 'owner') {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/games" element={<Games />} />
      <Route path="/originals" element={<Originals />} />
      <Route path="/slots" element={<Slots />} />
      <Route path="/table-games" element={<TableGames />} />
      <Route path="/promotions" element={<Promotions />} />
      <Route
        path="/tournaments"
        element={
          <ProtectedRoute>
            <Tournaments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <ProtectedRoute>
            <Leaderboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/challenges"
        element={
          <ProtectedRoute>
            <Challenges />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/:gameSlug"
        element={
          <ProtectedRoute>
            <GamePlay />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vip"
        element={
          <ProtectedRoute>
            <Vip />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wallet"
        element={
          <ProtectedRoute>
            <Wallet />
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily"
        element={
          <ProtectedRoute>
            <DailyBonus />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <Admin />
          </AdminRoute>
        }
      />
      <Route
        path="/terms"
        element={<InfoPage title="Terms of Service" text="Terms and platform rules content will be maintained here." />}
      />
      <Route
        path="/privacy"
        element={<InfoPage title="Privacy Policy" text="Privacy and data handling details will be maintained here." />}
      />
      <Route
        path="/faq"
        element={<InfoPage title="FAQ" text="Frequently asked questions and support topics will be maintained here." />}
      />
      <Route
        path="/responsible-gambling"
        element={
          <InfoPage
            title="Responsible Gambling"
            text="Responsible play resources, limits, and support links will be maintained here."
          />
        }
      />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
