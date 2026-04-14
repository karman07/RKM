'use client';

import React, { useState, useEffect, useRef } from 'react';
import { XIcon, SparklesIcon, ArrowRightIcon } from './Icons';
import styles from './ChatAssistant.module.css';
import Link from 'next/link';
import { trackEvent } from '@/app/analytics';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  products?: any[];
  suggestions?: string[];
  timestamp: number;
}

const STORAGE_KEY = 'rkm_chat_history';
const MAX_QUESTIONS = 10;

/** Simple inline markdown: **bold**, *italic*, `backtick` (hides product links) */
function renderMarkdown(text: string): React.ReactNode {
  // Strip lines that are just a product URL (plain text or after a colon)
  const lines = text.split('\n').filter(line => {
    const trimmed = line.trim();
    // Drop lines that are purely a /product or /products path
    if (/^`?\/products?\/[^\s`]+`?\.?$/.test(trimmed)) return false;
    // Drop "You can view/explore … here: /product/..." trailing lines
    if (/(?:view|explore|find|see|visit|details?)\s+(?:more\s+)?(?:details?)?\s*(?:here|at)?\s*:?\s*`?\/products?\//.test(trimmed.toLowerCase())) return false;
    return true;
  });
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
        return <em key={j}>{part.slice(1, -1)}</em>;
      if (part.startsWith('`') && part.endsWith('`')) {
        const inner = part.slice(1, -1);
        // Hide inline product paths — the product card does the linking
        if (/^\/products?\//.test(inner)) return null;
        return <code key={j} className={styles.inlineCode}>{inner}</code>;
      }
      // Strip bare /product(s)/... tokens embedded in plain-text lines
      const cleaned = part.replace(/\/products?\/\S+/g, '').replace(/\s{2,}/g, ' ').trimEnd();
      return <span key={j}>{cleaned}</span>;
    });
    return (
      <React.Fragment key={i}>
        {rendered}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export default function ChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMessages(parsed);
        setQuestionCount(parsed.filter((m: Message) => m.role === 'user').length);
      } catch {
        // ignore parse errors
      }
    } else {
      setMessages([{
        role: 'assistant',
        content: "Welcome to RKM Jewellers. I am your personal AI concierge. How may I assist you in finding the perfect piece of luxury jewellery today?",
        timestamp: Date.now(),
      }]);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading, isOpen]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (questionCount >= MAX_QUESTIONS) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "You've reached our 10-question consultation limit for this session. Please visit our showroom or contact our specialists for further assistance.",
        timestamp: Date.now(),
      }]);
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
    setInput('');
    setIsLoading(true);
    setQuestionCount(prev => prev + 1);

    trackEvent('chatbot_interaction', { query: text });

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        products: data.products,
        suggestions: data.suggestions,
        timestamp: Date.now(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I apologize, but I am having trouble connecting to our boutique's database. Please try again in a moment.",
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setMessages([{
      role: 'assistant',
      content: "Welcome back to RKM Jewellers. How may I help you today?",
      timestamp: Date.now(),
    }]);
    setQuestionCount(0);
  };

  return (
    <>
      {/* Floating trigger */}
      {!isOpen && (
        <button className={styles.chatButton} onClick={() => setIsOpen(true)} aria-label="Open RKM AI">
          <SparklesIcon />
          <span>Ask RKM AI</span>
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className={styles.chatWindow}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerInfo}>
              <div className={styles.avatarWrap}><SparklesIcon /></div>
              <div>
                <h3>RKM Concierge</h3>
                <p className={styles.onlineStatus}>
                  <span className={styles.dot} />
                  {MAX_QUESTIONS - questionCount} sessions left
                </p>
              </div>
            </div>
            <div className={styles.headerActions}>
              <button onClick={clearHistory} className={styles.clearBtn} title="Clear Conversation">Reset</button>
              <button onClick={() => setIsOpen(false)} className={styles.closeBtn} aria-label="Close"><XIcon /></button>
            </div>
          </div>

          {/* Messages */}
          <div className={styles.messageArea} ref={scrollRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.assistantRow}`}>
                {msg.role === 'assistant' && (
                  <div className={styles.assistantAvatar}><SparklesIcon /></div>
                )}
                <div className={styles.messageContent}>
                  <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.assistantBubble}`}>
                    {renderMarkdown(msg.content)}
                  </div>

                  {/* Product cards */}
                  {msg.products && msg.products.length > 0 && (
                    <div className={msg.products.length === 1 ? styles.singleProduct : styles.productGrid}>
                      {msg.products.map((p, j) => (
                        <Link
                          key={j}
                          href={p.url || '#'}
                          className={msg.products!.length === 1 ? styles.featuredCard : styles.miniCard}
                        >
                          <div className={styles.cardImg}>
                            {p.image ? (
                              <img
                                src={p.image}
                                alt={p.name}
                              />
                            ) : (
                              <div className={styles.imgPlaceholder}>RKM</div>
                            )}
                          </div>
                          <div className={styles.cardInfo}>
                            <h4>{p.name}</h4>
                            <p className={styles.cardPrice}>₹{p.price?.toLocaleString('en-IN')}</p>
                            {msg.products!.length === 1 && (
                              <span className={styles.viewBtn}>View details →</span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Suggestions (only on the last assistant message) */}
                  {i === messages.length - 1 && msg.suggestions && msg.suggestions.length > 0 && !isLoading && (
                    <div className={styles.suggestionBox}>
                      {msg.suggestions.map((s, k) => (
                        <button key={k} onClick={() => handleSend(s)} className={styles.suggestionBtn}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className={`${styles.messageRow} ${styles.assistantRow}`}>
                <div className={styles.assistantAvatar}><SparklesIcon /></div>
                <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                  <div className={styles.loadingDots}><span /><span /><span /></div>
                </div>
              </div>
            )}

            {questionCount >= MAX_QUESTIONS && (
              <div className={styles.limitWarning}>Session Limit Reached ({MAX_QUESTIONS}/{MAX_QUESTIONS})</div>
            )}
          </div>

          {/* Input */}
          <form className={styles.footer} onSubmit={e => { e.preventDefault(); handleSend(input); }}>
            <input
              type="text"
              placeholder={questionCount < MAX_QUESTIONS ? "Ask about our jewellery collection..." : "Limit reached"}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isLoading || questionCount >= MAX_QUESTIONS}
              autoComplete="off"
            />
            <button type="submit" disabled={!input.trim() || isLoading || questionCount >= MAX_QUESTIONS}>
              <ArrowRightIcon />
            </button>
          </form>

          <div className={styles.branding}>Exclusively by RKM Jewellers</div>
        </div>
      )}
    </>
  );
}
