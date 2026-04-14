import { API_BASE_URL } from './constants';

export const trackEvent = async (type: string, properties: Record<string, any> = {}) => {
  try {
    const sessionId = localStorage.getItem('analytics_session_id') || Math.random().toString(36).substring(7);
    localStorage.setItem('analytics_session_id', sessionId);

    await fetch(`${API_BASE_URL}/analytics/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        pathname: window.location.pathname,
        properties: {
          ...properties,
          referrer: document.referrer || 'direct',
          region: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screen: `${window.innerWidth}x${window.innerHeight}`,
        },
        sessionId,
        platform: 'web',
      }),
    });
  } catch (error) {
    console.error('Analytics tracking failed:', error);
  }
};

export const trackPageView = () => trackEvent('pageview');
