import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Pi, Shield } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../utils/helpers';

const ONBOARDING_KEY = 'taxi_pro_onboarded';

export function hasSeenOnboarding(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === '1'; } catch { return false; }
}

function markOnboardingSeen(): void {
  try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* quota / private mode */ }
}

interface Slide {
  icon: React.ReactNode;
  titleKey: string;
  bodyKey: string;
}

const SLIDES: Slide[] = [
  {
    icon: <MapPin size={56} className="text-primary" />,
    titleKey: 'onboarding.slide1Title',
    bodyKey: 'onboarding.slide1Body',
  },
  {
    icon: <Pi size={56} className="text-warning" />,
    titleKey: 'onboarding.slide2Title',
    bodyKey: 'onboarding.slide2Body',
  },
  {
    icon: <Shield size={56} className="text-success" />,
    titleKey: 'onboarding.slide3Title',
    bodyKey: 'onboarding.slide3Body',
  },
];

interface Props {
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const next = (): void => {
    if (isLast) {
      markOnboardingSeen();
      onDone();
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-between px-8 py-12 surface">
      {/* Slides */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/10">
          {slide.icon}
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-bold">{t(slide.titleKey)}</h2>
          <p className="text-base opacity-60 leading-relaxed">{t(slide.bodyKey)}</p>
        </div>
      </div>

      {/* Dots */}
      <div className="flex gap-2 py-4">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={cn(
              'h-2 rounded-full transition-all',
              i === index ? 'w-6 bg-primary' : 'w-2 bg-primary/25'
            )}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="w-full space-y-2">
        <Button fullWidth onClick={next}>
          {isLast ? t('onboarding.start') : t('onboarding.next')}
        </Button>
        {!isLast && (
          <Button
            fullWidth
            variant="ghost"
            onClick={() => {
              markOnboardingSeen();
              onDone();
            }}
          >
            {t('onboarding.skip')}
          </Button>
        )}
      </div>
    </div>
  );
}
