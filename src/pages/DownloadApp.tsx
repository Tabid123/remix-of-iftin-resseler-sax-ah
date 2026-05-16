import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Smartphone, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function DownloadApp() {
  const { language } = useLanguage();
  const [latestApk, setLatestApk] = useState<{
    version: string;
    file_size: number;
    storage_path: string;
    created_at: string;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchLatestApk();
  }, []);

  const fetchLatestApk = async () => {
    const { data, error } = await supabase
      .from('apk_builds')
      .select('version, file_size, storage_path, created_at')
      .eq('is_latest', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching APK:', error);
      return;
    }

    setLatestApk(data);
  };

  const handleDownload = async () => {
    if (!latestApk) {
      toast.error("No APK available");
      return;
    }

    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from('apk-builds')
        .download(latestApk.storage_path.replace('apk-builds/', ''));

      if (error) throw error;

      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'iftin-delivery.apk';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(language === 'en' ? "Download started" : "Soo dajinta bilaabmay");
    } catch (error) {
      console.error('Download error:', error);
      toast.error(language === 'en' ? "Download failed" : "Soo dajinta fashilmay");
    } finally {
      setDownloading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const content = {
    en: {
      hero: {
        title: "Download Iftin Delivery App",
        subtitle: "Smart 3-retry system with 95%+ delivery guarantee • Dual-SIM USSD automation",
        downloadBtn: "Download APK",
        fileSize: "8.5 MB",
        version: "v1.1.0"
      },
      requirements: {
        title: "System Requirements",
        android: "Android 10 or higher",
        device: "Samsung M31 (Recommended)",
        storage: "At least 10MB free space",
        sims: "2 active SIM cards (Hormuud & Somnet)",
        permissions: "Phone calls, SMS, Internet access"
      },
      installation: {
        title: "Installation Guide",
        step1: {
          title: "Enable Unknown Sources",
          desc: "Go to Settings → Security → Unknown Sources and toggle ON to allow installation from sources other than Play Store."
        },
        step2: {
          title: "Download & Install APK",
          desc: "Click the download button above, wait for the file to download, then open it from your Downloads folder."
        },
        step3: {
          title: "Grant Permissions",
          desc: "The app will request permissions for phone calls, SMS, and internet. Grant all permissions for proper functionality."
        },
        step4: {
          title: "Insert SIM Cards",
          desc: "Insert Hormuud SIM in Slot 1 and Somnet SIM in Slot 2. Both must be active with balance."
        },
        step5: {
          title: "Disable Battery Optimization",
          desc: "Go to Settings → Apps → Iftin Delivery → Battery → Disable optimization to keep the service running."
        },
        step6: {
          title: "Start Service",
          desc: "Open the app and the USSD dialing service will start automatically. Keep the app running in background."
        }
      },
      checklist: {
        title: "Setup Checklist",
        items: [
          "Battery optimization disabled",
          "Both SIMs inserted and active",
          "Unknown sources enabled",
          "All permissions granted",
          "Service running in background"
        ]
      },
      support: {
        title: "Need Help?",
        whatsapp: "Contact via WhatsApp",
        docs: "Read Documentation"
      },
      features: {
        title: "Key Features",
        feature1: "🔄 Smart 3-Retry System - 95%+ success rate",
        feature2: "⚡ Exponential backoff (2s → 5s → 8s delays)",
        feature3: "🎯 Dual-SIM support (Hormuud & Somnet)",
        feature4: "🔁 Auto-polling every 5 seconds",
        feature5: "🔋 Battery optimization & offline queue"
      }
    },
    so: {
      hero: {
        title: "Soo Dejiso App-ka Iibinta",
        subtitle: "Nidaam casri ah oo 3-jeer isu celin kara • 95%+ xirmad garantii • Dual-SIM automatic",
        downloadBtn: "Soo Deji APK",
        fileSize: "8.5 MB",
        version: "v1.1.0"
      },
      requirements: {
        title: "Baahiyaha System-ka",
        android: "Android 10 ama ka sareeysa",
        device: "Samsung M31 (Waa la talinayaa)",
        storage: "Ugu yaraan 10MB oo bannaan",
        sims: "2 SIM oo shaqeynaya (Hormuud & Somnet)",
        permissions: "Wicitaan, SMS, Internet"
      },
      installation: {
        title: "Hagaha Rakibaadda",
        step1: {
          title: "Fur 'Unknown Sources'",
          desc: "Aad Settings → Security → Unknown Sources oo ON u saar si aad ka install gareysid meelo aan ahayn Play Store."
        },
        step2: {
          title: "Soo Deji oo Install Garee",
          desc: "Badhanka soo dejinta dusha sare taaban, sug file-ka uu soo dejiyo, kadibna fur Downloads folder-kaaga."
        },
        step3: {
          title: "Ogolow Permissions-ka",
          desc: "App-ku wuxuu weydiisan doonaa permissions wicitaan, SMS, iyo internet. Dhammaan ogolow si fiican u shaqeeyo."
        },
        step4: {
          title: "Geli SIM-yaasha",
          desc: "Hormuud SIM geli Slot 1 iyo Somnet SIM geli Slot 2. Labaduba waa inay shaqeeyaan balance la'."
        },
        step5: {
          title: "Jooji Battery Optimization",
          desc: "Aad Settings → Apps → Iftin Delivery → Battery → optimization jooji si service-ku u sii socdo."
        },
        step6: {
          title: "Bilow Service-ka",
          desc: "App-ka fur, USSD dialing service-ku automatic u bilaaban doonaa. App-ka background-ka ku hay."
        }
      },
      checklist: {
        title: "Liiska Hubinta",
        items: [
          "Battery optimization la joojiyay",
          "Labada SIM la geliyay oo shaqeeya",
          "Unknown sources la furay",
          "Permissions oo dhan la ogolaaday",
          "Service background-ka ku socda"
        ]
      },
      support: {
        title: "Ma u baahan tahay Caawimo?",
        whatsapp: "Nala soo xiriir WhatsApp",
        docs: "Akhri Dukumiintiga"
      },
      features: {
        title: "Sifooyinka Muhiimka ah",
        feature1: "🔄 Nidaam 3-Retry ah - 95%+ guul garantii",
        feature2: "⚡ Waqti sii kordhaya (2s → 5s → 8s)",
        feature3: "🎯 Dual-SIM support (Hormuud & Somnet)",
        feature4: "🔁 Auto-polling 5 ilbiriqsi walba",
        feature5: "🔋 Battery optimization & offline queue"
      }
    }
  };

  const t = content[language];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Smartphone className="w-12 h-12 text-primary" />
          </div>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          {t.hero.title}
        </h1>
        
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          {t.hero.subtitle}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-4">
          <Button 
            size="lg" 
            className="text-lg px-8 py-6"
            onClick={handleDownload}
            disabled={!latestApk || downloading}
          >
            <Download className="mr-2 h-5 w-5" />
            {downloading 
              ? (language === 'en' ? 'Downloading...' : 'Soo dajinaya...') 
              : t.hero.downloadBtn
            }
          </Button>
          
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm">
              {latestApk?.version || t.hero.version}
            </Badge>
            <Badge variant="outline" className="text-sm">
              {latestApk ? formatFileSize(latestApk.file_size) : t.hero.fileSize}
            </Badge>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          <AlertTriangle className="inline w-4 h-4 mr-1" />
          {language === 'en' ? 'Enable "Unknown Sources" before installing' : 'Fur "Unknown Sources" ka hor intaadan install garayn'}
        </p>
      </section>

      <div className="container mx-auto px-4 pb-16">
        {/* Requirements Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">{t.requirements.title}</CardTitle>
            <CardDescription>
              {language === 'en' ? 'Ensure your device meets these requirements' : 'Hubi in qalabkaagu buuxiyo shuruudahan'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">{language === 'en' ? 'Android Version' : 'Nooca Android'}</p>
                <p className="text-sm text-muted-foreground">{t.requirements.android}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">{language === 'en' ? 'Device' : 'Qalabka'}</p>
                <p className="text-sm text-muted-foreground">{t.requirements.device}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">{language === 'en' ? 'Storage' : 'Kaydka'}</p>
                <p className="text-sm text-muted-foreground">{t.requirements.storage}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">{language === 'en' ? 'SIM Cards' : 'SIM-yaasha'}</p>
                <p className="text-sm text-muted-foreground">{t.requirements.sims}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">{t.features.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {[t.features.feature1, t.features.feature2, t.features.feature3, t.features.feature4, t.features.feature5].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Installation Guide */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">{t.installation.title}</CardTitle>
            <CardDescription>
              {language === 'en' ? 'Follow these steps to install and configure the app' : 'Raac tallaabadan si aad u install gareysid app-ka'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {[1, 2, 3, 4, 5, 6].map((step) => (
                <AccordionItem key={step} value={`step-${step}`}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                        {step}
                      </span>
                      <span>{t.installation[`step${step}`].title}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-11 pr-4 py-2 text-muted-foreground">
                      {t.installation[`step${step}`].desc}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Setup Checklist */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">{t.checklist.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {t.checklist.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <CheckCircle className="w-5 h-5 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Support Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{t.support.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <Button variant="outline" className="flex-1" asChild>
              <a href="https://wa.me/252614444000" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                {t.support.whatsapp}
              </a>
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <a href="/android-app/SETUP_GUIDE.md" target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" />
                {t.support.docs}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator />
      <Footer />
    </div>
  );
}
