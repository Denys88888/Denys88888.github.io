import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';

// The unread counter is the only notification that survives longer than the
// four-second toast, so it has to be right: it must count, it must clear when
// the chat is read, and it must never carry over to the next account.
describe('unread chat messages', () => {
  beforeEach(() => useAppStore.setState({ unreadByChat: {} }));

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

  it('does not hand the previous account its badges back after logout', () => {
    useAppStore.getState().bumpUnread('chat_a');
    useAppStore.getState().logout();
    expect(useAppStore.getState().unreadByChat).toEqual({});
  });
});
