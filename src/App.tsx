import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useRouter } from './store/useRouter';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RideProvider } from './context/RideContext';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { SplashScreen } from './components/layout/SplashScreen';
import { BottomNav } from './components/layout/BottomNav';
import { ToastContainer } from './components/ui/Toast';
import { AuthScreen } from './screens/AuthScreen';
import { PassengerHomeScreen } from './screens/PassengerHomeScreen';
import { DriverHomeScreen } from './screens/DriverHomeScreen';
import { RideDetailsScreen } from './screens/RideDetailsScreen';
import { ChatScreen } from './screens/ChatScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { DriverRegistrationScreen } from './screens/DriverRegistrationScreen';
import { EarningsScreen } from './screens/EarningsScreen';
import { AdminDashboardScreen } from './screens/AdminDashboardScreen';
import type { ScreenName } from './store/useRouter';

const SCREENS: Record<ScreenName, () => JSX.Element | null> = {
  home: PassengerHomeScreen,
  driver: DriverHomeScreen,
  ride: RideDetailsScreen,
  chat: ChatScreen,
  history: HistoryScreen,
  profile: ProfileScreen,
  register: DriverRegistrationScreen,
  earnings: EarningsScreen,
  admin: AdminDashboardScreen,
};

// Screens that render their own header/full layout and should hide the bottom nav.
const FULLSCREEN: ScreenName[] = ['ride', 'chat', 'register'];

function Shell() {
  const user = useAppStore((s) => s.user);
  const screen = useRouter((s) => s.screen);
  const navigate = useRouter((s) => s.navigate);

  // Drivers land on their own home screen.
  useEffect(() => {
    if (user?.role === 'driver' && screen === 'home') navigate('driver');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  if (!user) return <AuthScreen />;

  const Active = SCREENS[screen] ?? PassengerHomeScreen;
  const showNav = !FULLSCREEN.includes(screen);

  return (
    <div className="flex h-full flex-col">
      <main className="min-h-0 flex-1 overflow-hidden">
        <Active />
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <RideProvider>
          <ErrorBoundary>
            <div className="mx-auto h-full max-w-md">
              {showSplash ? <SplashScreen /> : <Shell />}
              <ToastContainer />
            </div>
          </ErrorBoundary>
        </RideProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
