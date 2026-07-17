import { supabase } from './supabase';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalSDK) => void | Promise<void>>;
  }
}

interface OneSignalSDK {
  init(opts: {
    appId: string;
    notifyButton?: { enable: boolean };
    allowLocalhostAsSecureOrigin?: boolean;
  }): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  Notifications: {
    requestPermission(): Promise<boolean>;
    permissionNative: NotificationPermission;
  };
}

function deferred(fn: (os: OneSignalSDK) => void | Promise<void>) {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

export function initOneSignal() {
  deferred(async (os) => {
    await os.init({
      appId: import.meta.env.VITE_ONESIGNAL_APP_ID as string,
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: import.meta.env.DEV as boolean,
    });
  });
}

export function loginOneSignal(userId: string) {
  deferred(async (os) => {
    await os.login(userId);
  });
}

export function logoutOneSignal() {
  deferred(async (os) => {
    await os.logout();
  });
}

export async function requestPushPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (granted: boolean) => {
      if (settled) return;
      settled = true;
      resolve(granted);
    };
    deferred(async (os) => {
      try {
        const granted = await os.Notifications.requestPermission();
        finish(granted);
      } catch {
        finish(false);
      }
    });
    // Safety net: if the OneSignal SDK's queue never gets processed (seen after
    // an installed PWA resumes from background on iOS), don't hang the toggle
    // forever — fall back to whatever the browser's native permission already is.
    setTimeout(() => finish(getPushPermission() === 'granted'), 8000);
  });
}

export function getPushPermission(): NotificationPermission {
  return window.Notification?.permission ?? 'default';
}

export async function sendPush(params: {
  to: 'user' | 'staff';
  userId?: string;
  excludeId?: string;
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: params });
  } catch {
    // Push failures are non-critical — never block the primary action
  }
}

export async function sendLcpFamilyPush(params: {
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-push-lcp', { body: params });
  } catch {
    // Push failures are non-critical — never block the primary action
  }
}
