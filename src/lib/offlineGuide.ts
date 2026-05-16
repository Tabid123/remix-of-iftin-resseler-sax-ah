export const hasSavedOfflineRegistration = (): boolean => {
  if (typeof window === 'undefined') return false;

  const senderPhone = localStorage.getItem('offlineSenderPhone');
  const receiverPhone = localStorage.getItem('offlineReceiverPhone');

  return Boolean(senderPhone && receiverPhone);
};
