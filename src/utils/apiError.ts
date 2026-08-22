import { isAxiosError } from 'axios';

/**
 * Which sentence to show the user for a failed request.
 *
 * "Something went wrong" reads the same whether the phone is in a tunnel, the
 * server is asleep, or we have a bug — and the three have different answers.
 * A driver who taps "go online" and reads it cannot tell whether to move to
 * where there is signal, wait a minute, or stop trying; the one thing they can
 * be sure of is that the app is not telling them anything.
 */
export function apiErrorKey(err: unknown): string {
  if (!isAxiosError(err)) return 'common.error';
  // No response at all — and two very different causes look identical from
  // here. The phone may have no network, or the server may be unreachable in
  // a way the browser will not let us read: a suspended Render service answers
  // with a plain HTML page carrying no CORS header, so the response is blocked
  // before axios ever sees a status. Told "no internet connection" while the
  // wifi bar is full, a driver reboots the phone and blames themselves for an
  // outage that is ours. navigator.onLine is wrong about a great many things,
  // but "the radio is off" is the one it gets right, so trust it only for that
  // and stay honest about the rest.
  if (!err.response) {
    return navigator.onLine ? 'common.cantReachServer' : 'common.offline';
  }
  // The edge answered but the app behind it did not. Render returns these while
  // a sleeping instance wakes, and for as long as a service is suspended —
  // which is the user's whole experience of an outage, not a passing blip.
  if ([502, 503, 504].includes(err.response.status)) return 'common.serverDown';
  return 'common.error';
}
