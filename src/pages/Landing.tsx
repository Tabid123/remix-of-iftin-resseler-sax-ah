import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Zap,
  ShieldCheck,
  WifiOff,
  Clock,
  Smartphone,
  ArrowRight,
  Phone,
  MessageCircle,
  Check,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBrand, shadeHex } from '@/hooks/useBrand';

interface Provider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
}

const FEATURES = [
  {
    icon: Zap,
    title: 'Gaarsiin Degdeg ah',
    text: 'Xirmadaada waxaa lagu gaarsiiyaa ilbidhiqsiyo gudahood, si otomaatig ah 24/7.',
  },
  {
    icon: WifiOff,
    title: 'Offline ayuu Shaqeeyaa',
    text: 'Xitaa adigoon internet haysan, USSD ayaad ku dalban kartaa.',
  },
  {
    icon: ShieldCheck,
    title: 'Lacag Bixin Ammaan ah',
    text: 'EVC Plus, e-Dahab iyo Jeeb — lacag bixin toos ah oo la hubiyay.',
  },
  {
    icon: Clock,
    title: 'Adeeg 24 Saac',
    text: 'Habeen iyo maalin — nidaamku waa firfircoon yahay waqti kasta.',
  },
];

const STEPS = [
  { n: '1', title: 'Dooro Shirkadda', text: 'Hormuud, Somtel, Somnet ama Amtel.' },
  { n: '2', title: 'Geli Lambarka', text: 'Lambarka aad rabto in lagu shubo.' },
  { n: '3', title: 'Bixi Lacagta', text: 'USSD kaliya hal taabasho.' },
  { n: '4', title: 'Hel Xirmadaada', text: 'Si otomaatig ah ayaa laguu gaarsiiyaa.' },
];

const Landing = () => {
  const navigate = useNavigate();
  const { logoUrl, name: brandName, primary, primaryDeep } = useBrand();

  useEffect(() => {
    document.title = `${brandName} — Jumlo Internet & Bixin Degdeg ah`;
  }, [brandName]);

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ['landing-providers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_providers');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-[#f5f7fa]">
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/85 border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt={`${brandName} logo`} className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-extrabold text-white"
                style={{ backgroundColor: primary }}
              >
                {brandName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-base font-extrabold tracking-tight text-gray-900">{brandName}</span>
          </div>
          <button
            onClick={() => navigate('/providers')}
            className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: primary }}
          >
            Bilow
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden" style={{ backgroundColor: primary }}>
        <div
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}
        />
        <div
          className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-white md:py-24">
          <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold backdrop-blur">
            Jumlo Internet • Somalia
          </span>
          <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
            Internet-ka Jumlada ah <br className="hidden md:block" /> ee ugu Qiimaha Jaban
          </h1>
          <p className="mt-4 max-w-xl text-base font-medium text-white/85 md:text-lg">
            {brandName} wuxuu kuu keenaa xirmooyin internet ah oo tayo sare leh, qiimo jumlo ah,
            gaarsiin otomaatig ah — xitaa offline.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/providers')}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold shadow-lg transition hover:scale-[1.03]"
              style={{ color: primary }}
            >
              Hadda Bilow <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate('/download-app')}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-6 py-3 text-sm font-bold text-white ring-1 ring-white/30 transition hover:bg-white/25"
            >
              <Smartphone className="h-4 w-4" /> Soo Dejiso App-ka
            </button>
          </div>

          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[
              { k: '24/7', v: 'Adeeg' },
              { k: '<60s', v: 'Gaarsiin' },
              { k: '100%', v: 'Otomaatig' },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur">
                <p className="text-xl font-extrabold md:text-2xl">{s.k}</p>
                <p className="text-[11px] font-medium text-white/75">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROVIDERS */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">
          Shirkadaha aan la shaqeyno
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Dhammaan shabakadaha waaweyn ee Soomaaliya hal meel.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate('/providers')}
              className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-gray-100">
                {p.provider_logo ? (
                  <img src={p.provider_logo} alt={`${p.provider_name} logo`} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-sm font-extrabold text-gray-700">
                    {p.provider_name.slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-sm font-bold text-gray-900">{p.provider_name}</span>
            </button>
          ))}
          {providers.length === 0 &&
            ['Hormuud', 'Somtel', 'Somnet', 'Amtel'].map((n) => (
              <div key={n} className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-gray-100">
                <span className="text-sm font-bold text-gray-900">{n}</span>
              </div>
            ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">
            Maxaad noogu kalsoonaan kartaa?
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl bg-[#f7f9fc] p-5 ring-1 ring-gray-100 transition hover:-translate-y-1 hover:shadow-md"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: primary }}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-gray-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">
          Sidee u shaqeeyaa?
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="relative rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white"
                style={{ backgroundColor: primaryDeep }}
              >
                {s.n}
              </span>
              <h3 className="mt-3.5 text-base font-bold text-gray-900">{s.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RESELLER CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div
          className="relative overflow-hidden rounded-3xl p-8 text-white md:p-12"
          style={{ backgroundColor: shadeHex(primary, 0.15) }}
        >
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
          <div className="relative max-w-xl">
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              Ma rabtaa inaad noqoto Reseller?
            </h2>
            <p className="mt-2 text-sm text-white/85 md:text-base">
              Hel dashboard gaar ah, calaamad shirkadaada u gaar ah, iyo faa'iido joogto ah.
            </p>
            <ul className="mt-5 space-y-2">
              {['Dashboard gaar ah', 'Logo & midab shirkadaada', 'Gaarsiin otomaatig ah', 'Taageero degdeg ah'].map(
                (i) => (
                  <li key={i} className="flex items-center gap-2 text-sm font-medium">
                    <Check className="h-4 w-4 shrink-0" /> {i}
                  </li>
                )
              )}
            </ul>
            <a
              href="https://wa.link/ake9qi"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold shadow-lg transition hover:scale-[1.03]"
              style={{ color: shadeHex(primary, 0.2) }}
            >
              <MessageCircle className="h-4 w-4" /> Nala Soo Xiriir
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} {brandName}. Dhammaan xuquuqda way dhowran tahay.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="tel:+252617195659"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: primary }}
              aria-label="Wac"
            >
              <Phone className="h-4 w-4" />
            </a>
            <a
              href="https://wa.link/ake9qi"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white"
              aria-label="WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <button
              onClick={() => navigate('/privacy-policy')}
              className="text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              Privacy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;