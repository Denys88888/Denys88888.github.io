import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PiPaymentCallbacks, PiIncompletePayment } from '../types/pi';

// Three ways paying could fail without ever saying so, all found while chasing
// "оплатить штраф не работает". None of them are reachable from a unit test of
// our own code alone — they are properties of the Pi SDK, so they are pinned
// here against a stand-in that behaves the way the real one does.

const mocks = vi.hoisted(() => ({
  createPayment: vi.fn(),
  approvePayment: vi.fn(),
  completePayment: vi.fn(),
  cancelPayment: vi.fn(),
  cancelUnknownPiPayment: vi.fn(),
}));

vi.mock('./api', () => ({ api: mocks }));

function installPi() {
  const createPayment = vi.fn();
  const authenticate = vi
    .fn()
    .mockResolvedValue({ accessToken: 'tok', user: { uid: 'u1', username: 'rider' } });
  window.Pi = {
    init: vi.fn(),
    authenticate,
    createPayment,
    nativeFeaturesList: vi.fn(),
    openShareDialog: vi.fn(),
  };
  return { createPayment, authenticate };
}

/**
 * A fresh copy of the module, so its "has this session authenticated" flag
 * resets. The fee module has to come from the same reload or it would keep a
 * reference to the previous copy — and pay through a session that never armed.
 */
async function loadSdk() {
  vi.resetModules();
  const sdk = await import('./piSdk');
  const fee = await import('./cancellationFeePayment');
  return { ...sdk, ...fee };
}

const PREPARED = { paymentId: 'pay_1', amount: 1.1, memo: 'fee', metadata: { paymentId: 'pay_1' } };

function callbacksOf(createPayment: ReturnType<typeof vi.fn>, call = 0): PiPaymentCallbacks {
  return createPayment.mock.calls[call][1] as PiPaymentCallbacks;
}

describe('paying through the Pi SDK', () => {
  beforeEach(() => {
    mocks.approvePayment.mockResolvedValue({});
    mocks.completePayment.mockResolvedValue({});
    mocks.cancelPayment.mockResolvedValue({});
    mocks.cancelUnknownPiPayment.mockResolvedValue({});
  });

  afterEach(() => {
    delete window.Pi;
    vi.clearAllMocks();
  });

  it('opens the wallet on the tap itself, with no server call in between', async () => {
    // The bug: paying the fee asked our backend for the payment record first.
    // Pi only opens its sheet while the tap that asked for it is still counted
    // as user activation, and a cold Render instance outlasts that easily — so
    // the sheet never appeared, no callback ever fired, and the button span
    // forever. A backend that never answers stands in for that here.
    const { createPayment } = installPi();
    const sdk = await loadSdk();
    await sdk.ensurePiPayments();
    mocks.createPayment.mockReturnValue(new Promise(() => {}));

    void sdk.payForRide(PREPARED);

    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('prepares the fee separately from paying it', async () => {
    const { createPayment } = installPi();
    const sdk = await loadSdk();
    await sdk.ensurePiPayments();
    mocks.createPayment.mockResolvedValue({
      paymentId: 'pay_9',
      amount: 1.1,
      memo: 'Taxi Pro cancellation fee',
      metadata: { paymentId: 'pay_9' },
    });

    const prepared = await sdk.prepareCancellationFee('ride_1');
    expect(mocks.createPayment).toHaveBeenCalledWith('ride_1', { type: 'fee' });
    expect(prepared.paymentId).toBe('pay_9');

    // And paying that record must not go back to the server for it again.
    mocks.createPayment.mockClear();
    void sdk.payCancellationFee(prepared);
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('authenticates a session restored from storage before paying', async () => {
    // The SDK keeps consented scopes on its own instance and throws
    // 'Cannot create a payment without "payments" scope' if that instance never
    // authenticated. Ours is rebuilt on every page load while the JWT comes
    // back from storage, so reopening the app broke every payment — fare, tip
    // and fee — until the passenger logged out and in again.
    const { authenticate } = installPi();
    const sdk = await loadSdk();

    void sdk.payForRide(PREPARED);
    await vi.waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1));
    expect(authenticate.mock.calls[0][0]).toContain('payments');
  });

  it('does not re-authenticate once the session is armed', async () => {
    const { authenticate } = installPi();
    const sdk = await loadSdk();
    await sdk.ensurePiPayments();
    await sdk.ensurePiPayments();
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('does not start a second authenticate while the first is still running', async () => {
    // Arming happens on boot, but the screen is usable before it answers — a tap
    // in that gap used to raise a second consent dialog racing the first.
    const { authenticate } = installPi();
    let admit: (v: unknown) => void = () => {};
    authenticate.mockReturnValue(new Promise((r) => { admit = r; }));
    const sdk = await loadSdk();

    const boot = sdk.ensurePiPayments();
    void sdk.payForRide(PREPARED);
    expect(authenticate).toHaveBeenCalledTimes(1);

    admit({ accessToken: 'tok', user: { uid: 'u1', username: 'rider' } });
    await boot;
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('clears a leftover payment the SDK refuses to pay past, then retries', async () => {
    // The SDK reports this through onError and hands over the payment itself,
    // then calls its own onIncompletePaymentFound — which only authenticate()
    // ever arms. We dropped the argument, so on a restored session the leftover
    // was never settled and blocked every future payment permanently.
    const { createPayment } = installPi();
    const sdk = await loadSdk();
    await sdk.ensurePiPayments();

    const stuck: PiIncompletePayment = {
      identifier: 'pi_stuck',
      metadata: { paymentId: 'pay_old' },
      transaction: null,
    };

    const paid = sdk.payForRide(PREPARED);
    callbacksOf(createPayment).onError(new Error('A pending payment needs to be handled.'), stuck);

    await vi.waitFor(() => expect(createPayment).toHaveBeenCalledTimes(2));
    expect(mocks.cancelPayment).toHaveBeenCalledWith('pay_old', 'pi_stuck');

    callbacksOf(createPayment, 1).onReadyForServerCompletion('pi_new', 'tx_1');
    await expect(paid).resolves.toEqual({ txid: 'tx_1' });
  });

  it('finishes a leftover payment that already reached the chain', async () => {
    // It has a txid, so the money moved — completing is what a normal
    // successful payment does. Cancelling it would strand a real transfer.
    const { createPayment } = installPi();
    const sdk = await loadSdk();
    await sdk.ensurePiPayments();

    void sdk.payForRide(PREPARED);
    callbacksOf(createPayment).onError(new Error('A pending payment needs to be handled.'), {
      identifier: 'pi_stuck',
      metadata: { paymentId: 'pay_old' },
      transaction: { txid: 'tx_old', verified: true },
    });

    await vi.waitFor(() =>
      expect(mocks.completePayment).toHaveBeenCalledWith('pay_old', 'pi_stuck', 'tx_old')
    );
    expect(mocks.cancelPayment).not.toHaveBeenCalled();
  });

  it('surfaces an error with no leftover attached instead of retrying', async () => {
    const { createPayment } = installPi();
    const sdk = await loadSdk();
    await sdk.ensurePiPayments();

    const paid = sdk.payForRide(PREPARED);
    callbacksOf(createPayment).onError(new Error('Wallet unavailable'));

    await expect(paid).rejects.toThrow('Wallet unavailable');
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('refuses outside the Pi Browser rather than hanging', async () => {
    const sdk = await loadSdk();
    await expect(sdk.payForRide(PREPARED)).rejects.toThrow(/Pi Browser/);
  });

  describe('when the Pi bridge goes quiet', () => {
    // The failure the owner actually hit: "оплатить штраф не работает". Not an
    // error, not a refusal — the SDK simply never called anything back, so the
    // promise never settled and the button spun until the screen was closed.
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('gives up on a wallet that never opens instead of spinning forever', async () => {
      installPi(); // createPayment is a stub that calls nothing back, like a dead bridge.
      const sdk = await loadSdk();
      await sdk.ensurePiPayments();

      const paid = sdk.payForRide(PREPARED);
      const settled = expect(paid).rejects.toMatchObject({ code: 'PI_WALLET_SILENT' });
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
    });

    it('gives up on a login the Pi app never answers', async () => {
      const { authenticate } = installPi();
      authenticate.mockReturnValue(new Promise(() => {}));
      const sdk = await loadSdk();

      const armed = sdk.ensurePiPayments();
      const settled = expect(armed).rejects.toMatchObject({ code: 'PI_WALLET_SILENT' });
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
    });

    it('lets the passenger read the sheet as long as they like once it has opened', async () => {
      // The deadline guards the silence, not the decision. onReadyForServerApproval
      // fires while the sheet is still waiting to be confirmed, so anything after
      // it must be allowed to take minutes without the payment being torn down.
      const { createPayment } = installPi();
      const sdk = await loadSdk();
      await sdk.ensurePiPayments();

      const paid = sdk.payForRide(PREPARED);
      callbacksOf(createPayment).onReadyForServerApproval('pi_1');
      await vi.advanceTimersByTimeAsync(120_000);

      callbacksOf(createPayment).onReadyForServerCompletion('pi_1', 'tx_1');
      await expect(paid).resolves.toEqual({ txid: 'tx_1' });
    });

    it('does not mistake backing out of the sheet for a silent wallet', async () => {
      // Cancelling is a choice and keeps its own message; only silence earns the
      // "open the app in the Pi Browser" advice.
      const { createPayment } = installPi();
      const sdk = await loadSdk();
      await sdk.ensurePiPayments();

      const paid = sdk.payForRide(PREPARED);
      callbacksOf(createPayment).onCancel('pi_1');

      const err = await paid.catch((e: unknown) => e);
      expect((err as Error).message).toBe('Payment cancelled');
      expect(sdk.isWalletSilent(err)).toBe(false);
    });

    it('tags being outside the Pi Browser as the same silence', async () => {
      const sdk = await loadSdk();
      const err = await sdk.payForRide(PREPARED).catch((e: unknown) => e);
      expect(sdk.isWalletSilent(err)).toBe(true);
    });
  });
});
