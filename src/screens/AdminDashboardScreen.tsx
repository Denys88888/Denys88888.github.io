import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../hooks/useToast';
import { api } from '../services/api';
import { formatPi } from '../utils/formatters';
import { cn } from '../utils/helpers';
import type { User } from '../types';

interface Stats {
  totalRides: number;
  activeUsers: number;
  platformEarnings: number;
  pendingReports: number;
}
type Tab = 'stats' | 'users' | 'drivers' | 'settings';

// Admin console: KPI cards, user moderation, driver verification, fee control.
export function AdminDashboardScreen() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [pending, setPending] = useState<User[]>([]);
  const [fee, setFee] = useState(10);

  useEffect(() => {
    api.adminStats().then(setStats).catch(() => {});
    api.adminSettings().then((s) => setFee(s.platformFeePercent)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'users') api.adminUsers().then(setUsers).catch(() => {});
    if (tab === 'drivers') api.adminPendingDrivers().then(setPending).catch(() => {});
  }, [tab]);

  const toggleBlock = async (u: User): Promise<void> => {
    await api.adminBlockUser(u.uid, !u.isBlocked, 'admin action');
    setUsers((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, isBlocked: !x.isBlocked } : x)));
  };

  const verify = async (u: User, approve: boolean): Promise<void> => {
    await api.adminVerifyDriver(u.uid, approve);
    setPending((prev) => prev.filter((x) => x.uid !== u.uid));
    addToast('success', approve ? t('admin.approve') : t('admin.reject'));
  };

  const saveFee = async (): Promise<void> => {
    await api.adminUpdateSettings({ platformFeePercent: fee });
    addToast('success', t('common.success'));
  };

  const tabs: Tab[] = ['stats', 'users', 'drivers', 'settings'];

  return (
    <div className="flex h-full flex-col">
      <header className="surface p-4">
        <h2>{t('admin.dashboard')}</h2>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {tabs.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={cn(
                'whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium',
                tab === tb ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10'
              )}
            >
              {t(`admin.${tb === 'stats' ? 'dashboard' : tb === 'drivers' ? 'pendingDrivers' : tb}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {tab === 'stats' && stats && (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="text-xs opacity-60">{t('admin.totalRides')}</p>
              <p className="text-2xl font-bold">{stats.totalRides}</p>
            </Card>
            <Card>
              <p className="text-xs opacity-60">{t('admin.activeUsers')}</p>
              <p className="text-2xl font-bold">{stats.activeUsers}</p>
            </Card>
            <Card>
              <p className="text-xs opacity-60">{t('admin.platformEarnings')}</p>
              <p className="text-2xl font-bold">{formatPi(stats.platformEarnings)}</p>
            </Card>
            <Card>
              <p className="text-xs opacity-60">{t('admin.pendingReports')}</p>
              <p className="text-2xl font-bold">{stats.pendingReports}</p>
            </Card>
          </div>
        )}

        {tab === 'users' &&
          users.map((u) => (
            <Card key={u.uid} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{u.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={u.role === 'admin' ? 'primary' : u.role === 'driver' ? 'info' : 'neutral'}>
                    {u.role}
                  </Badge>
                  {u.isBlocked && <Badge tone="danger">blocked</Badge>}
                </div>
              </div>
              <Button
                variant={u.isBlocked ? 'success' : 'danger'}
                onClick={() => toggleBlock(u)}
                className="px-4 py-2"
              >
                {u.isBlocked ? t('admin.unblock') : t('admin.block')}
              </Button>
            </Card>
          ))}

        {tab === 'drivers' && (
          <>
            {pending.length === 0 && <p className="pt-6 text-center text-sm opacity-50">—</p>}
            {pending.map((u) => (
              <Card key={u.uid} className="space-y-2">
                <p className="font-medium">{u.name}</p>
                <p className="text-sm opacity-70">
                  {u.driverInfo?.brand} {u.driverInfo?.model} · {u.driverInfo?.number}
                </p>
                <div className="flex gap-2">
                  <Button variant="success" fullWidth onClick={() => verify(u, true)}>
                    {t('admin.approve')}
                  </Button>
                  <Button variant="danger" fullWidth onClick={() => verify(u, false)}>
                    {t('admin.reject')}
                  </Button>
                </div>
              </Card>
            ))}
          </>
        )}

        {tab === 'settings' && (
          <Card className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-medium">{t('admin.commission')}</span>
                <span className="text-2xl font-bold text-primary">{fee}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                value={fee}
                onChange={(e) => setFee(Number(e.target.value))}
                className="mt-3 w-full accent-primary"
              />
              <p className="mt-1 text-xs opacity-50">{t('admin.feeHint')}</p>
            </div>
            <Button fullWidth onClick={saveFee}>
              {t('common.save')}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
