import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallModal: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      // @ts-expect-error standalone property on navigator for iOS
      const isAppInstalled = window.navigator.standalone || isStandalone;

      if (!isAppInstalled && !sessionStorage.getItem('installPromptShown')) {
        setShowModal(true);
        sessionStorage.setItem('installPromptShown', 'true');
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      sessionStorage.removeItem('installPromptShown');
      localStorage.removeItem('installPromptDismissed');
      setShowModal(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (!showModal || !deferredPrompt) return null;

  const handleInstall = async () => {
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowModal(false);
      }
    } catch (err) {
      console.error('Install error:', err);
    }
    setShowModal(false);
  };

  const handleCancel = () => {
    setShowModal(false);
  };

  return (
    <div className="install-modal">
      <div className="install-modal-content">
        <h3>Install PromptBox</h3>
        <p>Add PromptBox to your home screen for quick access and offline use!</p>
        <div className="install-actions">
          <button
            type="button"
            id="install-button"
            className="action-btn primary"
            onClick={handleInstall}
          >
            Install
          </button>
          <button
            type="button"
            id="cancel-install"
            className="action-btn secondary"
            onClick={handleCancel}
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};
