import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useRouter } from './store/useRouter';
import { useWebSocket } from './hooks/useWebSocket';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RideProvider } from './context/RideContext';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { SplashScreen } from './components/layout/SplashScreen';
import { BottomNav } from './components/layout/BottomNav';
import { ToastContainer } from './components/ui/Toast';
import { OfflineBanner } from './components/ui/OfflineBanner';
import { MaintenanceBanner } from './components/ui/MaintenanceBanner';
import { CallOverlay } from './components/call/CallOverlay';
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
import { OnboardingScreen, hasSeenOnboarding } from './screens/OnboardingScreen';
import { SharedRideScreen } from './screens/SharedRideScreen';
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

  // Re-connect WebSocket immediately when the device comes back online.
  useWebSocket();

  // Drivers land on their own home screen.
  useEffect(() => {
    if (user?.role === 'driver' && screen === 'home') navigate('driver');
  }, [user?.role, screen, navigate]);

  // Route guard for the admin screen — navigation is a state update, so it
  // belongs in an effect, not in the render body.
  useEffect(() => {
    if (user && screen === 'admin' && user.role !== 'admin') {
      navigate(user.role === 'driver' ? 'driver' : 'home');
    }
  }, [user, screen, navigate]);

  if (!user) return <AuthScreen />;
  if (screen === 'admin' && user.role !== 'admin') return null;

  const Active = SCREENS[screen] ?? PassengerHomeScreen;
  const showNav = !FULLSCREEN.includes(screen);

  return (
    <div className="safe-top flex h-full flex-col">
      <main className="min-h-0 flex-1 overflow-hidden">
        <Active />
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}

// A share link points at the app's own URL with ?share=<token>. Read once, at
// module load: this decides which application the visitor is looking at, and it
// must not depend on auth state, onboarding, or the splash timer — the person
// following the link has no account here and nothing to log into.
const SHARE_TOKEN = new URLSearchParams(window.location.search).get('share');

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(!hasSeenOnboarding());

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Short-circuits everything below: no AuthProvider, no ride state, no splash.
  if (SHARE_TOKEN) {
    return (
      <ThemeProvider>
        <ErrorBoundary>
          <div className="safe-top mx-auto h-full max-w-md">
            <SharedRideScreen token={SHARE_TOKEN} />
          </div>
          <ToastContainer />
        </ErrorBoundary>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <RideProvider>
          <ErrorBoundary>
            <div className="mx-auto h-full max-w-md">
              {showSplash ? (
                <SplashScreen />
              ) : showOnboarding ? (
                <OnboardingScreen onDone={() => setShowOnboarding(false)} />
              ) : (
                <Shell />
              )}
              <ToastContainer />
              <OfflineBanner />
              <MaintenanceBanner />
              <CallOverlay />
            </div>
          </ErrorBoundary>
        </RideProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
