import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { BottomNavigation } from '@/components/BottomNavigation';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { generateInvoiceImage } from '@/utils/invoiceGenerator';
import { downloadBlobInBrowser } from '@/utils/downloadFile';

// Helper function to get invoice image - uses cached URL if available, otherwise generates on-demand
const getInvoiceBlob = async (order: any): Promise<Blob> => {
  // If order has a cached invoice URL, fetch it
  if (order.invoice_url) {
    try {
      const response = await fetch(order.invoice_url);
      if (response.ok) {
        return await response.blob();
      }
    } catch (error) {
      console.log('Failed to fetch cached invoice, generating on-demand:', error);
    }
  }
  
  // Fallback: Generate invoice on-demand
  return generateInvoiceImage(order);
};

const normalizeSomaliPhone = (phone?: string | null) => (phone || '').replace(/^\+252/, '').trim();

const OrderHistory = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Show AdMob banner on mount, hide on unmount
  useEffect(() => {
    showBannerAd();
    return () => {
      hideBannerAd();
    };
  }, []);

  useEffect(() => {
    const fetchOrderHistory = async () => {
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      const offlineSenderPhone = localStorage.getItem('offlineSenderPhone');
      
      if (!verifiedPhone && !offlineSenderPhone) {
        setLoading(false);
        return;
      }
      try {
        // Get all possible phone numbers to search for
        const phonesToSearch = [...new Set([
          normalizeSomaliPhone(verifiedPhone),
          normalizeSomaliPhone(offlineSenderPhone)
        ].filter(Boolean))];

        const orderChunks = await Promise.all(
          phonesToSearch.map(async (phone) => {
            const { data, error } = await (supabase as any).rpc('get_customer_order_history', {
              customer_phone_number: phone
            });

            if (error) throw error;
            return data || [];
          })
        );

        const ordersData = [...new Map(
          orderChunks
            .flat()
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((order: any) => [order.id, order])
        ).values()];
        
        const formattedHistory = ordersData.map((order: any) => {
          const orderDate = new Date(order.created_at);
          
          // Calculate expiry date by adding validity period from the package to the order date
          let expiryDate = new Date(orderDate);
          if (order.validity_days) {
            const validityString = String(order.validity_days).toLowerCase().trim();
            const validityMatch = validityString.match(/\d+/);
            
            if (validityMatch) {
              const validityValue = parseInt(validityMatch[0], 10);
              if (!isNaN(validityValue) && validityValue > 0) {
                // Check if it's hours (saac in Somali or hour/hours in English) - CHECK FIRST
                if (validityString.includes('saac') || validityString.includes('hour')) {
                  // Add hours
                  expiryDate = new Date(orderDate.getTime() + (validityValue * 60 * 60 * 1000));
                  console.log('Adding hours:', validityValue, 'to', orderDate, 'result:', expiryDate);
                } 
                // Check if it's weeks (usbuuc in Somali or week in English)
                else if (validityString.includes('usbuuc') || validityString.includes('week')) {
                  // Add weeks
                  expiryDate = new Date(orderDate.getTime() + (validityValue * 7 * 24 * 60 * 60 * 1000));
                  console.log('Adding weeks:', validityValue);
                }
                // Check if it's months (bil in Somali or month in English)
                else if (validityString.includes('bil') || validityString.includes('month')) {
                  // Add months
                  expiryDate = new Date(orderDate);
                  expiryDate.setMonth(expiryDate.getMonth() + validityValue);
                  console.log('Adding months:', validityValue);
                }
                else {
                  // Default to days (maalin in Somali or day in English)
                  expiryDate = new Date(orderDate.getTime() + (validityValue * 24 * 60 * 60 * 1000));
                  console.log('Adding days:', validityValue);
                }
              }
            }
          }
          
          return {
            id: order.id,
            provider: order.provider_name || 'Unknown',
            logo: order.provider_logo || null,
            package: order.package_name,
            phone: order.receiver_phone,
            senderPhone: order.sender_phone || order.customer_phone,
            receiverPhone: order.receiver_phone,
            price: `$${order.selling_price}`,
            date: format(orderDate, 'dd/MM/yyyy'),
            dateTime: format(orderDate, 'dd/MM/yyyy-hh:mmaaa'),
            expiryDateTime: format(expiryDate, 'dd/MM/yyyy-hh:mmaaa'),
            transactionId: order.id.slice(0, 8).toUpperCase(),
            status: order.status,
            delivery_status: order.delivery_status || order.status,
            invoice_url: order.invoice_url || null
          };
        });
        setOrderHistory(formattedHistory);
      } catch (error) {
        console.error('Error fetching orders:', error);
        toast({
          title: 'Error',
          description: 'Failed to load order history',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };
    fetchOrderHistory();
    
    const verifiedPhone = localStorage.getItem('verifiedPhone');
    const offlineSenderPhone = localStorage.getItem('offlineSenderPhone');
    
    if (!verifiedPhone && !offlineSenderPhone) return;
    
    const phonesToListen = [];
    if (verifiedPhone) {
      phonesToListen.push(normalizeSomaliPhone(verifiedPhone));
    }
    if (offlineSenderPhone) {
      phonesToListen.push(normalizeSomaliPhone(offlineSenderPhone));
    }
    
    const channel = supabase.channel('order-changes').on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'orders'
    }, (payload) => {
      // Check if the change is relevant to any of our phone numbers
      const order = payload.new as any;
      if (order && (
        phonesToListen.includes(normalizeSomaliPhone(order.customer_phone)) || 
        phonesToListen.includes(normalizeSomaliPhone(order.sender_phone))
      )) {
        fetchOrderHistory();
      }
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);
  return <div className="min-h-screen bg-background pb-24">
      {/* Header with safe-area padding for Android 12+ */}
      <div style={{
        backgroundColor: '#0099ff',
        paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))',
        boxSizing: 'border-box' as const
      }} className="text-white py-4 px-4">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20 mr-4">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-medium">Dhaq dhaqaaqaaga</h1>
        </div>
      </div>

      {/* History List */}
      <div className="p-4 space-y-3">
        {loading ? <div className="text-center py-8">
            <p className="text-muted-foreground">Loading...</p>
          </div> : orderHistory.length === 0 ? <div className="text-center py-8 space-y-3">
            <p className="text-muted-foreground">Wali dalabo ma samayn lambarkaan</p>
            <p className="text-xs text-muted-foreground">
              Lambarka: {localStorage.getItem('verifiedPhone')}
            </p>
            <Button onClick={() => navigate('/providers')} className="gradient-button text-white">
              Bilow Iibsashada
            </Button>
          </div> : orderHistory.map((item: any) => <div key={item.id} className="bg-card rounded-xl p-3 border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedOrder(item)}>
              <div className="flex items-start justify-between gap-4">
                {/* Left side - Logo and Details */}
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-full border-2 border-green-500 flex items-center justify-center p-2 flex-shrink-0">
                    {item.logo ? <img src={item.logo} alt={item.provider} className="w-full h-full object-contain" /> : <div className="w-full h-full bg-primary/20 rounded-full flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">{item.provider.charAt(0)}</span>
                      </div>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="font-semibold text-foreground text-base">
                      {item.package}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>{item.provider}</span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                          <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
                          <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
                          <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                        </svg>
                        {item.date}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Right side - Price and Status */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="text-lg font-bold text-primary">
                    {item.price}
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    item.delivery_status === 'delivered' ? 'bg-green-100 text-green-700' : 
                    item.delivery_status === 'pending' || item.delivery_status === 'processing' ? 'bg-yellow-100 text-yellow-700' : 
                    'bg-red-100 text-red-700'
                  }`}>
                    {item.delivery_status === 'delivered' ? 'Delivered' : 
                     item.delivery_status === 'pending' || item.delivery_status === 'processing' ? 'Pending' : 'Failed'}
                  </div>
                </div>
              </div>
            </div>)}
      </div>

      {/* Invoice Modal */}
      {selectedOrder && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-md relative">
            <button onClick={() => setSelectedOrder(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
              ✕
            </button>
            
            {/* Provider Logo */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-green-500 flex items-center justify-center p-4">
                {selectedOrder.logo ? <img src={selectedOrder.logo} alt={selectedOrder.provider} className="w-full h-full object-contain" /> : <div className="w-full h-full bg-primary/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary">{selectedOrder.provider.charAt(0)}</span>
                  </div>}
              </div>
            </div>

            {/* Invoice Details */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Xirmada:</span>
                <span className="font-medium text-foreground">{selectedOrder.package}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Lambarka aad Lacagta Ka dirtay:</span>
                <span className="font-medium text-foreground">{selectedOrder.senderPhone}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Habka Lacag Bixinta:</span>
                <span className="font-medium text-foreground">EVC</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Lambarka aad xirmada u rabtid:</span>
                <span className="font-medium text-foreground">{selectedOrder.receiverPhone}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Lacagta:</span>
                <span className="font-medium text-foreground">{selectedOrder.price}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Lacagta aad Dirtay:</span>
                <span className="font-medium text-foreground">$0.0</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Xaalada Lacag bixinta:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  selectedOrder.delivery_status === 'delivered' ? 'bg-green-100 text-green-700' : 
                  selectedOrder.delivery_status === 'pending' || selectedOrder.delivery_status === 'processing' ? 'bg-yellow-100 text-yellow-700' : 
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedOrder.delivery_status === 'delivered' ? 'Delivered' : 
                   selectedOrder.delivery_status === 'pending' || selectedOrder.delivery_status === 'processing' ? 'Pending' : 'Failed'}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Tariikhda Dalabka:</span>
                <span className="font-medium text-foreground">{selectedOrder.dateTime}</span>
              </div>
              
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-muted-foreground text-sm">Status:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  selectedOrder.delivery_status === 'delivered' ? 'bg-green-100 text-green-700' : 
                  selectedOrder.delivery_status === 'pending' || selectedOrder.delivery_status === 'processing' ? 'bg-yellow-100 text-yellow-700' : 
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedOrder.delivery_status === 'delivered' ? 'Delivered' : 
                   selectedOrder.delivery_status === 'pending' || selectedOrder.delivery_status === 'processing' ? 'Pending' : 'Failed'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <Button 
                onClick={async () => {
                  try {
                    toast({
                      title: 'Preparing...',
                      description: 'Creating invoice image',
                    });

                    const imageBlob = await getInvoiceBlob(selectedOrder);
                    const url = URL.createObjectURL(imageBlob);
                    
                    // Check if on mobile and WhatsApp is available
                    if (navigator.share) {
                      const file = new File([imageBlob], `invoice-${selectedOrder.transactionId}.jpg`, { type: 'image/jpeg' });
                      await navigator.share({
                        title: 'Invoice - ' + selectedOrder.package,
                        text: `Invoice for ${selectedOrder.package} - ${selectedOrder.price}`,
                        files: [file]
                      });
                    } else {
                      // Fallback: Create WhatsApp URL with text
                      const whatsappText = `Invoice - ${selectedOrder.package}%0A%0ATransaction ID: ${selectedOrder.transactionId}%0AProvider: ${selectedOrder.provider}%0AAmount: ${selectedOrder.price}%0APhone: ${selectedOrder.receiverPhone}%0ADate: ${selectedOrder.dateTime}`;
                      window.open(`https://wa.me/?text=${whatsappText}`, '_blank');
                      
                      toast({
                        title: 'Note',
                        description: 'Image sharing not supported on this device. Text sent instead.',
                      });
                    }
                    
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error('Error sharing:', error);
                    toast({
                      title: 'Error',
                      description: 'Failed to share invoice',
                      variant: 'destructive',
                    });
                  }
                }}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              >
                Share WhatsApp
              </Button>
              
              <Button 
                onClick={async () => {
                  try {
                    toast({
                      title: 'Waa la sameynayaa...',
                      description: 'Sawirka invoice-ka ayaa la keydinayaa',
                    });

                    const imageBlob = await getInvoiceBlob(selectedOrder);
                    const fileName = `invoice-${selectedOrder.transactionId}.jpg`;

                    const isNativeApp = Capacitor.isNativePlatform();
                    if (isNativeApp) {
                      const androidVersionMatch = navigator.userAgent.match(/Android\s(\d+)/i);
                      const androidVersion = androidVersionMatch ? parseInt(androidVersionMatch[1], 10) : 0;

                      await Filesystem.requestPermissions().catch(() => null);

                      const base64String = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const result = reader.result as string;
                          if (!result || !result.includes(',')) {
                            reject(new Error('Failed to convert image to base64'));
                            return;
                          }
                          resolve(result.split(',')[1]);
                        };
                        reader.onerror = () => reject(new Error('Failed to read image blob'));
                        reader.readAsDataURL(imageBlob);
                      });

                      const useLegacyExternalStorage = androidVersion > 0 && androidVersion <= 9;

                      if (useLegacyExternalStorage) {
                        await Filesystem.writeFile({
                          path: `Pictures/IftinInvoices/${fileName}`,
                          data: base64String,
                          directory: Directory.ExternalStorage,
                          recursive: true,
                        });
                        toast({
                          title: 'Waa la keydiyay! ✅',
                          description: 'Gallery > Pictures > IftinInvoices',
                        });
                      } else {
                        await Filesystem.mkdir({
                          path: 'IftinInvoices',
                          directory: Directory.Documents,
                          recursive: true,
                        }).catch(() => null);

                        await Filesystem.writeFile({
                          path: `IftinInvoices/${fileName}`,
                          data: base64String,
                          directory: Directory.Documents,
                          recursive: true,
                        });

                        toast({
                          title: 'Waa la keydiyay! ✅',
                          description: `Documents/IftinInvoices/${fileName}`,
                        });
                      }
                    } else {
                      // Website browser - use native download
                      await downloadBlobInBrowser(imageBlob, fileName);

                      toast({
                        title: 'Waa la keydiyay! ✅',
                        description: 'Invoice-ka waa lagu keydiyay Downloads folder-ka',
                      });
                    }

                  } catch (error) {
                    console.error('Error:', error);
                    toast({
                      title: 'Khalad!',
                      description: 'Sawirka lama keydin karin. Fadlan isku day mar kale.',
                      variant: 'destructive',
                    });
                  }
                }}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              >
                Save Invoice
              </Button>
            </div>
          </div>
        </div>}

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>;
};
export default OrderHistory;