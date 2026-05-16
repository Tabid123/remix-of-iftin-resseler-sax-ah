import { OnlinePaymentsDashboard } from './OnlinePaymentsDashboard';

/**
 * WaafiPay-only dashboard. Reuses OnlinePaymentsDashboard but filters
 * strictly to payment_source = 'waafipay_api' (iPhone WaafiPay HPS USTPB flow).
 */
export const WaafiPayDashboard = () => {
  return (
    <OnlinePaymentsDashboard
      paymentSources={['waafipay_api']}
      titleOverride={{
        so: 'WaafiPay API Dalabyo (iPhone)',
        en: 'WaafiPay API Orders (iPhone)',
      }}
      descriptionOverride={{
        so: 'Dalabyadii lacag-bixinta WaafiPay API ee iPhone-ka oo keliya',
        en: 'Orders paid via WaafiPay API (iPhone HPS USTPB) only',
      }}
    />
  );
};

export default WaafiPayDashboard;
