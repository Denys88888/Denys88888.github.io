import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CreditCard, Clock } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { useToast } from '../hooks/useToast';
import { useRouter } from '../store/useRouter';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { isNonEmpty, isValidPlate } from '../utils/validators';
import { fileToAvatarDataUrl } from '../utils/image';
import { cn } from '../utils/helpers';
import type { VehicleType } from '../types';

const STEP_KEYS = ['register.step1', 'register.step2', 'register.step3', 'register.step4'];

// 4-step driver onboarding wizard: personal → vehicle → documents → review.
export function DriverRegistrationScreen() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const back = useRouter((s) => s.back);
  const user = useAppStore((s) => s.user);
  const updateUser = useAppStore((s) => s.updateUser);
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    brand: '',
    model: '',
    color: '',
    number: '',
    vehicleType: 'economy' as VehicleType,
    vehiclePhoto: '',
    licensePhoto: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const uploadAvatar = async (file: File): Promise<void> => {
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      const updated = await api.updateProfile({ avatar: dataUrl });
      updateUser({ avatar: updated.avatar });
      addToast('success', t('profile.saved'));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const uploadVehiclePhoto = async (file: File): Promise<void> => {
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 512);
      setForm((f) => ({ ...f, vehiclePhoto: dataUrl }));
      addToast('success', t('register.vehiclePhotoSaved'));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const uploadLicensePhoto = async (file: File): Promise<void> => {
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 512);
      setForm((f) => ({ ...f, licensePhoto: dataUrl }));
      addToast('success', t('register.licensePhotoSaved'));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  // A profile photo is required before a driver can be verified.
  const canNext =
    step === 0
      ? isNonEmpty(form.name) && isNonEmpty(form.phone)
      : step === 1
        ? isNonEmpty(form.brand) && isNonEmpty(form.model) && isValidPlate(form.number)
        : step === 2
          ? !!user?.avatar && !!form.vehiclePhoto && !!form.licensePhoto
          : true;

  const submit = async (): Promise<void> => {
    try {
      // Persist the name/phone captured in step 1 onto the profile.
      await api.updateProfile({ name: form.name, phone: form.phone });
      updateUser({ name: form.name, phone: form.phone });
      await api.registerDriver({
        vehicleType: form.vehicleType,
        brand: form.brand,
        model: form.model,
        color: form.color || 'N/A',
        number: form.number,
        vehiclePhoto: form.vehiclePhoto,
        licensePhoto: form.licensePhoto,
      });
      setSubmitted(true);
    } catch {
      addToast('error', t('common.error'));
    }
  };

  if (submitted) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Clock size={56} className="text-warning" strokeWidth={1.5} />
        <h2>{t('register.pending')}</h2>
        <p className="opacity-70">{t('register.pendingDesc')}</p>
        <Button onClick={back}>{t('common.back')}</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="surface p-4">
        <h2>{t('register.title')}</h2>
        <div className="mt-3 flex gap-2">
          {STEP_KEYS.map((_, i) => (
            <div
              key={i}
              className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-black/10 dark:bg-white/10')}
            />
          ))}
        </div>
        <p className="mt-2 text-sm opacity-60">{t(STEP_KEYS[step])}</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {step === 0 && (
          <Card className="space-y-3">
            <Input label={t('register.name')} value={form.name} onChange={(e) => set('name', e.target.value)} />
            <Input label={t('register.phone')} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Card>
        )}
        {step === 1 && (
          <Card className="space-y-3">
            <Input label={t('register.brand')} value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            <Input label={t('register.model')} value={form.model} onChange={(e) => set('model', e.target.value)} />
            <Input label={t('register.color')} value={form.color} onChange={(e) => set('color', e.target.value)} />
            <Input label={t('register.plate')} value={form.number} onChange={(e) => set('number', e.target.value)} />
          </Card>
        )}
        {step === 2 && (
          <Card className="space-y-4">
            {/* Profile photo — required before a driver can be verified. */}
            <div className="flex items-center gap-3">
              <Avatar name={form.name || user?.name || '?'} src={user?.avatar} size={56} />
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-btn border border-primary px-4 py-2 text-sm font-semibold text-primary">
                <Camera size={16} />
                {user?.avatar ? t('profile.uploadAvatar') : t('register.title')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                />
              </label>
              {!user?.avatar && <span className="text-xs text-danger">*</span>}
            </div>

            {/* Vehicle photo */}
            <div className="space-y-2">
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-black/15 dark:border-white/15 text-sm opacity-70 hover:border-primary hover:opacity-100">
                {form.vehiclePhoto ? (
                  <img src={form.vehiclePhoto} alt="Vehicle" className="h-20 w-full object-contain" />
                ) : (
                  <>
                    <Camera size={20} /> {t('register.vehiclePhoto')}
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadVehiclePhoto(e.target.files[0])}
                />
              </label>
              {form.vehiclePhoto && <p className="text-xs text-success">{t('register.vehiclePhotoSaved')}</p>}
              {!form.vehiclePhoto && <span className="text-xs text-danger">*</span>}
            </div>

            {/* License photo */}
            <div className="space-y-2">
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-black/15 dark:border-white/15 text-sm opacity-70 hover:border-primary hover:opacity-100">
                {form.licensePhoto ? (
                  <img src={form.licensePhoto} alt="License" className="h-20 w-full object-contain" />
                ) : (
                  <>
                    <CreditCard size={20} /> {t('register.licensePhoto')}
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadLicensePhoto(e.target.files[0])}
                />
              </label>
              {form.licensePhoto && <p className="text-xs text-success">{t('register.licensePhotoSaved')}</p>}
              {!form.licensePhoto && <span className="text-xs text-danger">*</span>}
            </div>
          </Card>
        )}
        {step === 3 && (
          <Card className="space-y-2 text-sm">
            <p><b>{t('register.name')}:</b> {form.name}</p>
            <p><b>{t('register.phone')}:</b> {form.phone}</p>
            <p><b>{t('register.brand')}:</b> {form.brand} {form.model}</p>
            <p><b>{t('register.plate')}:</b> {form.number}</p>
            {form.vehiclePhoto && (
              <div>
                <p className="opacity-60">{t('register.vehiclePhoto')}:</p>
                <img src={form.vehiclePhoto} alt="Vehicle" className="mt-1 h-24 rounded-lg object-contain" />
              </div>
            )}
            {form.licensePhoto && (
              <div>
                <p className="opacity-60">{t('register.licensePhoto')}:</p>
                <img src={form.licensePhoto} alt="License" className="mt-1 h-24 rounded-lg object-contain" />
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="surface flex gap-3 border-t border-black/5 dark:border-white/10 p-4">
        <Button variant="ghost" onClick={() => (step === 0 ? back() : setStep((s) => s - 1))}>
          {t('common.back')}
        </Button>
        {step < 3 ? (
          <Button fullWidth disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            {t('common.next')}
          </Button>
        ) : (
          <Button fullWidth onClick={submit}>
            {t('register.submit')}
          </Button>
        )}
      </div>
    </div>
  );
}
