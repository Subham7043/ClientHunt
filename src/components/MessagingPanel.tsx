import React, { useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Conversation, ConversationMessage } from '../types/domain';

export function MessagingPanel({ mode }: { mode: 'freelancer' | 'business' }) {
  const { firebaseUser, account } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    const field = mode === 'business' ? 'businessId' : 'freelancerId';
    const q = query(collection(db, 'conversations'), where(field, '==', firebaseUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Conversation[];
        setConversations(list);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'conversations')
    );
    return () => unsub();
  }, [firebaseUser, mode, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'conversations', selectedId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ConversationMessage[]);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `conversations/${selectedId}/messages`)
    );
    return () => unsub();
  }, [selectedId]);

  const activeConv = conversations.find((c) => c.id === selectedId);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeConv || !draft.trim()) return;
    setSending(true);
    const body = draft.trim().slice(0, 2500);
    try {
      await addDoc(collection(db, 'conversations', activeConv.id, 'messages'), {
        senderId: firebaseUser.uid,
        senderName: account?.displayName || firebaseUser.displayName || 'User',
        body,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'conversations', activeConv.id), {
        lastMessage: body.slice(0, 200),
        lastSenderId: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });

      const recipientId = mode === 'business' ? activeConv.freelancerId : activeConv.businessId;
      await addDoc(collection(db, 'notifications'), {
        userId: recipientId,
        type: 'message',
        title: `New message from ${account?.displayName || 'ClientHunt User'}`.slice(0, 155),
        message: body.slice(0, 120),
        read: false,
        createdAt: serverTimestamp(),
      });

      setDraft('');
    } catch (err) {
      toast('Failed to send message', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  };

  if (conversations.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-10 text-center">
        <MessageSquare className="w-8 h-8 text-slate-400 mx-auto" />
        <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">No Conversations Yet</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          {mode === 'freelancer'
            ? 'Submit a proposal on a business project to open a direct conversation with the hiring team.'
            : 'Open any applicant proposal under Applications and click Message Applicant to start a secure thread.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] overflow-hidden min-h-[540px]">
      <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[540px]">
        {conversations.map((conv) => {
          const peerName = mode === 'business' ? conv.freelancerName : conv.businessName;
          const unread = conv.lastSenderId && conv.lastSenderId !== firebaseUser?.uid;
          return (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={`w-full text-left p-4 transition-colors cursor-pointer ${
                selectedId === conv.id
                  ? 'bg-blue-50/70 dark:bg-blue-950/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{peerName}</p>
                {unread && <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">New</span>}
              </div>
              {conv.projectTitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{conv.projectTitle}</p>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-1">{conv.lastMessage}</p>
            </button>
          );
        })}
      </div>

      <div className="lg:col-span-8 flex flex-col justify-between h-[540px]">
        {activeConv ? (
          <>
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {mode === 'business' ? activeConv.freelancerName : activeConv.businessName}
              </p>
              {activeConv.projectTitle && (
                <p className="text-xs text-slate-500 dark:text-slate-400">Project: {activeConv.projectTitle}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.map((m) => {
                const mine = m.senderId === firebaseUser?.uid;
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <span className="text-[11px] text-slate-400 mb-1">{m.senderName}</span>
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                        mine
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {m.body}
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={sendMessage} className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message..."
                className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1221] text-sm"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
