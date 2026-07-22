import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { RideStatusBadge } from '../components/ride/RideStatusBadge';
import { useToast } from '../hooks/useToast';
import { api, type AdminRide, type AdminDriver, type AdminAnalytics } from '../services/api';
import { formatPi, formatDate } from '../utils/formatters';
import { cn } from '../utils/helpers';
import type { User, RideStatus, Report } from '../types';

interface Stats {
  totalRides: number;
  activeUsers: number;
  platformEarnings: number;
  pendingReports: number;
}
type Tab = 'stats' | 'rides' | 'users' | 'drivers' | 'analytics' | 'reports' | 'settings';
type RideFilter = 'all' | 'active' | 'completed' | 'cancelled';
type DriverFilter = 'all' | 'pending' | 'approved' | 'rejected';
type ReportFilter = 'open' | 'resolved' | 'dismissed' | 'all';

const ACTIVE_STATUSES: RideStatus[] = ['searching', 'assigned', 'arrived', 'in_progress'];

// Admin console: KPIs, all rides, user moderation, driver applications,
// analytics charts, and pricing/fee settings.
export function AdminDashboardScreen() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [rideFilter, setRideFilter] = useState<RideFilter>('all');
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [driverFilter, setDriverFilter] = useState<DriverFilter>('pending');
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportFilter, setReportFilter] = useState<ReportFilter>('open');
  const [docPhoto, setDocPhoto] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // Settings.
  const [fee, setFee] = useState(10);
  const [minFare, setMinFare] = useState(1.5);
  const [perKm, setPerKm] = useState(0.5);
  const [surgeEnabled, setSurgeEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.adminStats()
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((err) => console.error('[admin] stats:', err));
    api.adminSettings()
      .then((s) => {
        if (!cancelled) {
          setFee(s.platformFeePercent ?? 10);
          setMinFare(s.minFare ?? 1.5);
          setPerKm(s.baseFarePerKm ?? 0.5);
          setSurgeEnabled(s.surgeEnabled !== false);
        }
      })
      .catch((err) => console.error('[admin] settings:', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const DATA_TABS = ['users', 'rides', 'drivers', 'analytics', 'reports'] as const;
    if (!(DATA_TABS as readonly string[]).includes(tab)) return;
    setTabLoading(true);
    const done = () => { if (!cancelled) setTabLoading(false); };
    const fail = () => { done(); addToast('error', t('common.error')); };
    if (tab === 'users') api.adminUsers().then((u) => { if (!cancelled) setUsers(u); done(); }).catch(fail);
    if (tab === 'rides') api.adminRides().then((r) => { if (!cancelled) setRides(r); done(); }).catch(fail);
    if (tab === 'drivers') api.adminDrivers().then((d) => { if (!cancelled) setDrivers(d); done(); }).catch(fail);
    if (tab === 'analytics') api.adminAnalytics().then((a) => { if (!cancelled) setAnalytics(a); done(); }).catch(fail);
    if (tab === 'reports') api.adminReports().then((r) => { if (!cancelled) setReports(r); done(); }).catch(fail);
    return () => { cancelled = true; };
  }, [tab, addToast, t]);

  const toggleBlock = async (u: User): Promise<void> => {
    try {
      await api.adminBlockUser(u.uid, !u.isBlocked, 'admin action');
      const flip = (x: User) => (x.uid === u.uid ? { ...x, isBlocked: !x.isBlocked } : x);
      setUsers((prev) => prev.map(flip));
      setDrivers((prev) => prev.map(flip) as AdminDriver[]);
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const verify = async (u: User, approve: boolean): Promise<void> => {
    try {
      await api.adminVerifyDriver(u.uid, approve);
      setDrivers((prev) =>
        prev.map((d) =>
          d.uid === u.uid ? { ...d, applicationStatus: approve ? 'approved' : 'rejected' } : d
        )
      );
      addToast('success', approve ? t('admin.approve') : t('admin.reject'));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const resolveReport = async (r: Report, status: 'resolved' | 'dismissed'): Promise<void> => {
    try {
      await api.adminResolveReport(r.id, status);
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
      setStats((prev) => (prev ? { ...prev, pendingReports: Math.max(0, prev.pendingReports - 1) } : prev));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const saveSettings = async (): Promise<void> => {
    try {
      await api.adminUpdateSettings({
        platformFeePercent: fee,
        minFare,
        baseFarePerKm: perKm,
        surgeEnabled,
      });
      addToast('success', t('common.success'));
    } catch {
      addToast('error', t('common.error'));
    }
  };

  const filteredRides = rides.filter((r) => {
    if (rideFilter === 'all') return true;
    if (rideFilter === 'active') return ACTIVE_STATUSES.includes(r.status);
    return r.status === rideFilter;
  });
  const filteredDrivers = drivers.filter(
    (d) => driverFilter === 'all' || d.applicationStatus === driverFilter
  );
  const filteredReports = reports.filter(
    (r) => reportFilter === 'all' || r.status === reportFilter
  );

  const shortAddr = (a?: string) => (a ?? '?').split(',')[0];
  const maxHour = analytics ? Math.max(1, ...analytics.ridesByHour) : 1;
  const maxRevenue = analytics ? Math.max(0.1, ...analytics.revenueByDay.map((d) => d.revenue)) : 1;

  const tabs: Tab[] = ['stats', 'rides', 'users', 'drivers', 'analytics', 'reports', 'settings'];
  const tabLabel: Record<Tab, string> = {
    stats: t('admin.dashboard'),
    rides: t('admin.rides'),
    users: t('admin.users'),
    drivers: t('admin.driversTab'),
    analytics: t('admin.analytics'),
    reports: t('admin.reports'),
    settings: t('admin.settings'),
  };

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
              {tabLabel[tb]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {tabLoading && (
          <div className="flex justify-center pt-10 opacity-50">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
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
            <Card
              className={stats.pendingReports > 0 ? 'cursor-pointer' : undefined}
              onClick={() => stats.pendingReports > 0 && setTab('reports')}
            >
              <p className="text-xs opacity-60">{t('admin.pendingReports')}</p>
              <p className={cn('text-2xl font-bold', stats.pendingReports > 0 && 'text-danger')}>
                {stats.pendingReports}
              </p>
            </Card>
          </div>
        )}

        {/* ── All rides with filters ── */}
        {tab === 'rides' && (
          <>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {(['all', 'active', 'completed', 'cancelled'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRideFilter(f)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium',
                    rideFilter === f ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10'
                  )}
                >
                  {t(`admin.filter_${f}`)}
                </button>
              ))}
            </div>
            {filteredRides.length === 0 && (
              <p className="pt-6 text-center text-sm opacity-50">—</p>
            )}
            {filteredRides.map((r) => (
              <Card key={r.id} className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs opacity-50">{r.id.slice(-12)}</span>
                  <RideStatusBadge status={r.status} />
                </div>
                <p>
                  <b>{r.passengerName}</b>
                  {r.driverName ? <> → <b>{r.driverName}</b></> : null}
                </p>
                <p className="flex items-center gap-1.5 truncate text-xs opacity-70">
                  <Circle size={8} className="shrink-0 fill-success text-success" />
                  {shortAddr(r.pickup.address)}
                  <Circle size={8} className="shrink-0 fill-danger text-danger" />
                  {shortAddr(r.destination.address)}
                </p>
                <div className="flex items-center justify-between text-xs opacity-60">
                  <span>{formatDate(r.createdAt)}</span>
                  <b>
                    {formatPi(r.fare)}
                    {!!r.surgeMultiplier && r.surgeMultiplier > 1 ? ` ⚡×${r.surgeMultiplier}` : ''}
                  </b>
                </div>
              </Card>
            ))}
          </>
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
                  {u.isBlocked && <Badge tone="danger">{t('admin.blocked')}</Badge>}
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

        {/* ── Driver applications with status filter + documents ── */}
        {tab === 'drivers' && (
          <>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setDriverFilter(f)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium',
                    driverFilter === f ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10'
                  )}
                >
                  {t(`admin.driver_${f}`)}
                </button>
              ))}
            </div>
            {filteredDrivers.length === 0 && (
              <p className="pt-6 text-center text-sm opacity-50">—</p>
            )}
            {filteredDrivers.map((u) => (
              <Card key={u.uid} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{u.name}</p>
                  <Badge
                    tone={
                      u.applicationStatus === 'approved'
                        ? 'success'
                        : u.applicationStatus === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {t(`admin.driver_${u.applicationStatus}`)}
                  </Badge>
                </div>
                <p className="text-sm opacity-70">
                  {u.driverInfo?.brand} {u.driverInfo?.model} · {u.driverInfo?.number}
                </p>
                {u.driverInfo?.licensePhoto && (
                  <button
                    onClick={() => setDocPhoto(u.driverInfo!.licensePhoto!)}
                    className="block"
                  >
                    <img
                      src={u.driverInfo.licensePhoto}
                      alt={t('register.licensePhoto')}
                      className="h-16 rounded-lg object-cover"
                    />
                  </button>
                )}
                <div className="flex gap-2">
                  {u.applicationStatus !== 'approved' && (
                    <Button variant="success" fullWidth onClick={() => verify(u, true)}>
                      {t('admin.approve')}
                    </Button>
                  )}
                  {u.applicationStatus === 'pending' && (
                    <Button variant="danger" fullWidth onClick={() => verify(u, false)}>
                      {t('admin.reject')}
                    </Button>
                  )}
                  <Button
                    variant={u.isBlocked ? 'success' : 'outline'}
                    fullWidth
                    onClick={() => toggleBlock(u)}
                  >
                    {u.isBlocked ? t('admin.unblock') : t('admin.block')}
                  </Button>
                </div>
              </Card>
            ))}
          </>
        )}

        {/* ── Analytics ── */}
        {tab === 'analytics' && analytics && (
          <>
            <Card>
              <p className="mb-3 text-sm font-medium opacity-70">{t('admin.ridesByHour')}</p>
              <div className="flex h-24 items-end gap-0.5">
                {analytics.ridesByHour.map((v, h) => (
                  <div
                    key={h}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{ height: `${(v / maxHour) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
                    title={`${h}:00 — ${v}`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] opacity-50">
                <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
              </div>
            </Card>
            <Card>
              <p className="mb-3 text-sm font-medium opacity-70">{t('admin.revenueByDay')}</p>
              <div className="flex h-24 items-end gap-1">
                {analytics.revenueByDay.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 rounded-t bg-success/70"
                    style={{
                      height: `${(d.revenue / maxRevenue) * 100}%`,
                      minHeight: d.revenue > 0 ? 2 : 0,
                    }}
                    title={`${d.date}: ${formatPi(d.revenue)}`}
                  />
                ))}
              </div>
            </Card>
            <Card className="space-y-1.5">
              <p className="text-sm font-medium opacity-70">{t('admin.topDrivers')}</p>
              {analytics.topDrivers.length === 0 && <p className="text-sm opacity-50">—</p>}
              {analytics.topDrivers.map((d, i) => (
                <div key={d.uid} className="flex items-center justify-between text-sm">
                  <span>{i + 1}. {d.name}</span>
                  <span className="opacity-70">
                    {d.rides} · <b>{formatPi(d.earnings)}</b>
                  </span>
                </div>
              ))}
            </Card>
            <Card className="space-y-1.5">
              <p className="text-sm font-medium opacity-70">{t('admin.topRoutes')}</p>
              {analytics.topRoutes.length === 0 && <p className="text-sm opacity-50">—</p>}
              {analytics.topRoutes.map((r, i) => (
                <div key={r.route} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{i + 1}. {r.route}</span>
                  <b className="shrink-0">{r.count}</b>
                </div>
              ))}
            </Card>
          </>
        )}

        {/* ── Reports / SOS moderation queue ── */}
        {tab === 'reports' && (
          <>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {(['open', 'resolved', 'dismissed', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setReportFilter(f)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium',
                    reportFilter === f ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10'
                  )}
                >
                  {t(`admin.reportFilter_${f}`)}
                </button>
              ))}
            </div>
            {filteredReports.length === 0 && (
              <p className="pt-6 text-center text-sm opacity-50">—</p>
            )}
            {filteredReports.map((r) => (
              <Card key={r.id} className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs opacity-50">{r.rideId.slice(-12)}</span>
                  <Badge
                    tone={
                      r.status === 'open' ? 'warning' : r.status === 'resolved' ? 'success' : 'neutral'
                    }
                  >
                    {t(`admin.reportFilter_${r.status}`)}
                  </Badge>
                </div>
                <p className="font-medium">{r.reason}</p>
                {r.description && <p className="text-xs opacity-70">{r.description}</p>}
                <p className="text-xs opacity-50">
                  {t('admin.reporter')}: <span className="font-mono">{r.reporterId}</span>
                  {' · '}
                  {t('admin.reportedUser')}: <span className="font-mono">{r.reportedId}</span>
                </p>
                <div className="flex items-center justify-between text-xs opacity-60">
                  <span>{formatDate(r.createdAt)}</span>
                </div>
                {r.status === 'open' && (
                  <div className="flex gap-2 pt-1">
                    <Button variant="success" fullWidth onClick={() => resolveReport(r, 'resolved')}>
                      {t('admin.resolve')}
                    </Button>
                    <Button variant="outline" fullWidth onClick={() => resolveReport(r, 'dismissed')}>
                      {t('admin.dismiss')}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </>
        )}

        {/* ── Settings ── */}
        {tab === 'settings' && (
          <Card className="space-y-5">
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
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t('admin.minFare')}</span>
              <div className="flex w-28 items-center gap-1 rounded-lg border border-[#E0E0E0] dark:border-white/15 px-3 py-2">
                <span className="font-bold text-primary">π</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={minFare}
                  onChange={(e) => setMinFare(Number(e.target.value))}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t('admin.perKmRate')}</span>
              <div className="flex w-28 items-center gap-1 rounded-lg border border-[#E0E0E0] dark:border-white/15 px-3 py-2">
                <span className="font-bold text-primary">π</span>
                <input
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={perKm}
                  onChange={(e) => setPerKm(Number(e.target.value))}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </div>
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('admin.surgeToggle')}</span>
              <input
                type="checkbox"
                checked={surgeEnabled}
                onChange={(e) => setSurgeEnabled(e.target.checked)}
                className="h-5 w-5 accent-primary"
              />
            </label>
            <Button fullWidth onClick={saveSettings}>
              {t('common.save')}
            </Button>
          </Card>
        )}
      </div>

      {/* License photo viewer. */}
      <Modal open={!!docPhoto} title={t('register.licensePhoto')} onClose={() => setDocPhoto(null)}>
        {docPhoto && <img src={docPhoto} alt={t('admin.driverPhoto')} className="w-full rounded-lg" />}
      </Modal>
    </div>
  );
}
