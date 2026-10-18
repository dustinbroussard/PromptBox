import React from 'react';
import { NotificationItem } from '../types';

interface NotificationToastProps {
  notifications: NotificationItem[];
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ notifications }) => {
  return (
    <div id="notification-container" className="notification-container">
      {notifications.map(n => (
        <div key={n.id} className={`notification ${n.type}`}>
          {n.message}
        </div>
      ))}
    </div>
  );
};
