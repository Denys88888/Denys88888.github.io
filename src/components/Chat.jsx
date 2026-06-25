import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ws from '../lib/ws.js';

const QUICK_REPLIES = ["On my way", "I'm outside", "Coming down", "5 minutes"];

export default function Chat({ rideId, myId, myName, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    ws.send({ type: 'join_chat', chatId: rideId });
    const off1 = ws.on('chat:history', d => { if (d.chatId === rideId) setMessages(d.messages || []); });
    const off2 = ws.on('chat:message', d => {
      if (d.message?.rideId === rideId) setMessages(prev => [...prev, d.message]);
    });
    return () => { off1(); off2(); };
  }, [rideId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function send(msgText) {
    if (!msgText.trim()) return;
    ws.send({ type: 'chat:message', rideId, chatId: rideId, sender: myId, senderName: myName, text: msgText.trim() });
    setText('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="row-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <h3>Chat</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AnimatePresence initial={false}>
          {messages.map(m => {
            const isMine = m.sender === myId;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}
              >
                <div style={{
                  maxWidth: '75%',
                  background: isMine ? 'var(--primary)' : 'var(--bg3)',
                  color: isMine ? '#fff' : 'var(--text)',
                  padding: '8px 12px',
                  borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize: 14,
                }}>
                  {!isMine && <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{m.senderName || m.sender}</div>}
                  {m.text}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', overflowX: 'auto' }}>
        {QUICK_REPLIES.map(q => (
          <button key={q} onClick={() => send(q)} style={{
            whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: 99,
            border: '1.5px solid var(--border)', background: 'none',
            color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
          }}>{q}</button>
        ))}
      </div>

      {/* Input */}
      <div className="row" style={{ padding: '8px 16px 16px', gap: 8 }}>
        <input
          className="input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(text)}
          placeholder="Type a message..."
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary btn-sm" onClick={() => send(text)} style={{ width: 'auto', padding: '10px 16px' }}>
          Send
        </button>
      </div>
    </div>
  );
}
