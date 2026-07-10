// ===== Notification Service =====
//
// Creates, reads, and updates community notifications on QDN.
// Notifications are DOCUMENT resources with identifier: notif-<timestamp>-<random>

import { publishJsonResource, searchResources, fetchJsonResource } from './qdnService';

export type NotificationType = 'new_post' | 'new_comment' | 'new_poll' | 'new_project' | 'poll_vote' | 'forum_thread' | 'forum_reply';

export interface Notification {
  id: string;
  type: NotificationType;
  text: string;
  link?: string;
  createdAt: string;
  read: boolean;
}

/** Publish a notification to QDN. */
export const createNotification = async (params: {
  type: NotificationType;
  text: string;
  link?: string;
}): Promise<void> => {
  const notification: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: params.type,
    text: params.text,
    link: params.link,
    createdAt: new Date().toISOString(),
    read: false,
  };

  try {
    await publishJsonResource({
      service: 'DOCUMENT',
      identifier: notification.id,
      payload: notification,
      title: `Notification: ${params.type}`,
      filename: `${notification.id}.json`,
    });
  } catch (err) {
    console.warn('[notifications] Failed to publish notification:', err);
  }
};

/** Mark a single notification as read by re-publishing it with read:true. */
export const markNotificationRead = async (notification: Notification): Promise<void> => {
  try {
    await publishJsonResource({
      service: 'DOCUMENT',
      identifier: notification.id,
      payload: { ...notification, read: true },
      title: `Notification: ${notification.type}`,
      filename: `${notification.id}.json`,
    });
  } catch (err) {
    console.warn('[notifications] Failed to mark as read:', err);
  }
};

/** Mark all given notifications as read. */
export const markAllNotificationsRead = async (notifications: Notification[]): Promise<void> => {
  for (const n of notifications) {
    if (!n.read) {
      await markNotificationRead(n).catch(() => {});
    }
  }
};

/** Fetch all notifications from QDN. */
export const fetchNotifications = async (): Promise<Notification[]> => {
  try {
    const results = await searchResources({
      service: 'DOCUMENT',
      identifier: 'notif-',
      prefix: true,
      limit: 30,
      reverse: true,
      includeMetadata: true,
    });

    if (!Array.isArray(results) || results.length === 0) return [];

    const notifications: Notification[] = [];
    for (const item of results) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const name = typeof r.name === 'string' ? r.name : '';
      const identifier = typeof r.identifier === 'string' ? r.identifier : '';
      if (!name || !identifier) continue;

      try {
        const notif = await fetchJsonResource<Notification>('DOCUMENT', name, identifier);
        if (notif && notif.id && notif.text) {
          notifications.push(notif);
        }
      } catch {
        // Skip malformed notifications
      }
    }

    return notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
};
