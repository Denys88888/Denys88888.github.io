// Pi SDK wrapper — window.Pi is loaded via CDN in index.html
// All Pi SDK calls go through this module for testability and error handling

function getPi() {
  if (typeof window === 'undefined' || !window.Pi) {
    throw new Error('Pi SDK not loaded. Ensure sdk.minepi.com/pi-sdk.js is in index.html.');
  }
  return window.Pi;
}

export async function initSdk(sandbox = false) {
  try {
    const timeout = new Promise(resolve => setTimeout(resolve, 3000));
    await Promise.race([getPi().init({ version: '2.0', sandbox }), timeout]);
  } catch (err) {
    console.warn('[Pi] SDK init:', err.message);
  }
}

export function authenticate(scopes = ['username', 'payments', 'wallet_address']) {
  return new Promise((resolve, reject) => {
    const Pi = getPi();
    Pi.authenticate(
      scopes,
      (payment) => {
        // Incomplete payment — auto-approve on server
        console.log('[Pi] Incomplete payment found:', payment.identifier);
        reject(Object.assign(new Error('incomplete_payment'), { payment }));
      }
    ).then(resolve).catch(reject);
  });
}

export function createPayment(amount, memo, metadata, onReadyForApproval, onReadyForCapture, onCancel, onError) {
  const Pi = getPi();
  return Pi.createPayment(
    { amount, memo, metadata },
    {
      onReadyForServerApproval: paymentId => {
        console.log('[Pi] Ready for approval:', paymentId);
        onReadyForApproval(paymentId);
      },
      onReadyForServerCompletion: (paymentId, txid) => {
        console.log('[Pi] Ready for completion:', paymentId, txid);
        onReadyForCapture(paymentId, txid);
      },
      onCancel: paymentId => {
        console.log('[Pi] Payment cancelled:', paymentId);
        onCancel(paymentId);
      },
      onError: (error, payment) => {
        console.error('[Pi] Payment error:', error);
        onError(error, payment);
      },
    }
  );
}

export function openAppConversation(title, conversationId) {
  try {
    getPi().openShareDialog(title, conversationId);
  } catch { /* not critical */ }
}
