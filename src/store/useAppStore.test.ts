import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';
import { storage } from '../services/storageService';

// The unread counter is the only notification that survives longer than the
// four-second toast, so it has to be right: it must count, it must clear when
// the chat is read, and it must never carry over to the next account.
describe('unread chat messages', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ unreadByChat: {} });
  });

  it('counts each message per chat', () => {
    const { bumpUnread } = useAppStore.getState();
    bumpUnread('chat_a');
    bumpUnread('chat_a');
    bumpUnread('chat_b');
    expect(useAppStore.getState().unreadByChat).toEqual({ chat_a: 2, chat_b: 1 });
  });

  it('drops the chat entirely once it is read', () => {
    const { bumpUnread, clearUnread } = useAppStore.getState();
    bumpUnread('chat_a');
    bumpUnread('chat_b');
    clearUnread('chat_a');
    expect(useAppStore.getState().unreadByChat).toEqual({ chat_b: 1 });
  });

  it('clearing a chat with nothing unread changes nothing', () => {
    const before = useAppStore.getState().unreadByChat;
    useAppStore.getState().clearUnread('chat_never_used');
    expect(useAppStore.getState().unreadByChat).toBe(before);
  });

  // The Pi Browser reloads the page whenever it likes; a badge that only lived
  // in memory took the message with it.
  it('survives a reload', () => {
    useAppStore.getState().bumpUnread('chat_a');
    useAppStore.getState().bumpUnread('chat_a');
    // What a freshly started app would read back off disk.
    expect(storage.getUnread()).toEqual({ chat_a: 2 });
  });

  it('leaves nothing on disk for a chat that has been read', () => {
    useAppStore.getState().bumpUnread('chat_a');
    useAppStore.getState().clearUnread('chat_a');
    expect(storage.getUnread()).toEqual({});
  });

  it('ignores junk left in storage instead of crashing on boot', () => {
    localStorage.setItem('taxipro_unread', '{"chat_a":"lots","chat_b":3,"chat_c":-1}');
    expect(storage.getUnread()).toEqual({ chat_b: 3 });
    localStorage.setItem('taxipro_unread', 'not json at all');
    expect(storage.getUnread()).toEqual({});
  });

  it('does not hand the previous account its badges back after logout', () => {
    useAppStore.getState().bumpUnread('chat_a');
    useAppStore.getState().logout();
    expect(useAppStore.getState().unreadByChat).toEqual({});
    // …and nothing is left on disk for the next person to sign in on this phone.
    expect(storage.getUnread()).toEqual({});
  });
});
