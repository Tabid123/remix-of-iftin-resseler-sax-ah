import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket,
  ArrowRight,
  Zap,
  PiggyBank,
  UserCog,
  CheckCircle2,
  LayoutDashboard,
  Check,
} from 'lucide-react';
import { useBrand } from '@/hooks/useBrand';
import ContactDialog from '@/components/landing/ContactDialog';
import heroDashboard from '@/assets/landing/hero-dashboard.jpg';
import missionYouth from '@/assets/landing/mission-youth.jpg';
import automationFlow from '@/assets/landing/automation-flow.jpg';

const BRAND = '#004ac6';
const font = { fontFamily: '"Hanken Grotesk", system-ui, sans-serif' };

const FEATURES = [
  { icon: Zap, title: 'Automation Degdeg ah', text: 'Nidaam si toos ah ugu dira Data Bundles-ka macaamiisha ilbiriqsiyo gudahood.' },
  { icon: PiggyBank, title: 'Qiimaha Jumlada', text: 'Hel qiimaha ugu jaban ee jumlada ah ee 5-ta shirkadood ee ugu waaweyn isgaarsiinta.' },
  { icon: UserCog, title: 'Maareyn 24/7 ah', text: 'Maamul xisaabtaada, warbixinaha, iyo iibka waqti kasta iyo goob kasta.' },
];

const CARRIERS = ['Hormuud', 'Somtel', 'Telesom', 'Golis', 'SomNet'];

const NAV = [
  { label: 'Adeegyada', href: '#adeegyada' },
  { label: 'Qiimaha', href: '#qiimaha' },
  { label: 'Shirkadaha', href: '#shirkadaha' },
  { label: 'Ku Saabsan', href: '#kusaabsan' },
];

const Landing = () => {
  const navigate = useNavigate();
  const { logoUrl } = useBrand();
  const brandName = 'Iftin Resellers';

  useEffect(() => {
    document.title = `${brandName} — Nidaamka Tooska ah ee Data Bundles-ka Jumlada`;
  }, []);

  return (
    <div className="min-h-screen scroll-smooth bg-[#f8f9ff] text-[#0b1c30]" style={font}>
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-[#dbe1ff] bg-[#f8f9ff]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 md:px-20">
          <div className="flex items-center gap-2.5">
            {logoUrl && <img src={logoUrl} alt={`${brandName} logo`} className="h-8 w-8 rounded-lg object-cover" />}
            <span className="text-[17px] font-extrabold tracking-tight" style={{ color: BRAND }}>
              {brandName}
            </span>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-[15px] font-medium text-[#434655] transition hover:text-[#004ac6]">
                {n.label}
              </a>
            ))}
          </nav>
          <ContactDialog
            trigger={
              <button
                className="rounded-[10px] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: '#2563eb' }}
              >
                Nala soo xiriir
              </button>
            }
          />
        </div>
      </header>

      {/* HERO */}
      <section className="bg-[#eff4ff]">
        <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-20 md:grid-cols-2 md:px-20 md:py-[120px]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-lg bg-[#dbe1ff] px-3 py-1.5 text-xs font-semibold text-[#003ea8]">
              <Rocket className="h-3.5 w-3.5" /> SaaS Platform loogu talagalay Jumlada
            </span>
            <h1 className="mt-6 text-[38px] font-extrabold leading-[1.1] tracking-tight md:text-[56px] md:leading-[1.08]">
              Nidaamka Tooska ah ee{' '}
              <span style={{ color: BRAND }}>Data Bundles-ka Jumlad ah</span>
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-7 text-[#434655]">
              Waxaan bixinaa nidaam si toos ah u bixiya xirmooyinka internet-ka jumlada ah ee 5-ta shirkadood ee
              waaweyn: Hormuud, Somtel, Telesom, Golis, iyo SomNet.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/providers')}
                className="inline-flex items-center gap-2 rounded-[10px] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
                style={{ backgroundColor: '#2563eb' }}
              >
                Bilow Hadda <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#adeegyada"
                className="inline-flex items-center rounded-[10px] border border-[#c3c6d7] bg-white px-6 py-3 text-sm font-semibold text-[#434655] transition hover:bg-[#eff4ff]"
              >
                Sida ay u shaqeyso
              </a>
            </div>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-[0_20px_60px_-25px_rgba(0,74,198,0.45)] ring-1 ring-[#dbe1ff]">
            <div className="rounded-lg bg-[#dce9ff] p-6">
              <div className="flex items-center gap-1.5">
                {['#ba1a1a', '#e0b400', '#1f9d55'].map((c) => (
                  <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="mt-4 space-y-3">
                <div className="h-24 rounded-lg bg-white/80" />
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-lg bg-white/80" />
                  ))}
                </div>
                <div className="h-8 w-2/3 rounded-lg bg-white/80" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="adeegyada" className="bg-white py-20 md:py-[120px]">
        <div className="mx-auto max-w-[1280px] px-5 md:px-20">
          <h2 className="text-center text-[28px] font-bold tracking-tight md:text-[32px]">
            Maxaad u dooraneysaa {brandName}?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-[#434655]">
            Nidaam toos ah, qiimo jaban, iyo taageero joogto ah si aad u guuleysato.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl bg-[#eff4ff] p-6 ring-1 ring-[#dbe1ff]">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: '#2563eb' }}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-[18px] font-bold">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-[#434655]">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MISSION */}
      <section id="kusaabsan" className="bg-[#dce9ff] py-20 md:py-[120px]">
        <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 md:grid-cols-2 md:px-20">
          <div className="h-72 rounded-xl bg-[#b4c5ff] md:h-96" />
          <div>
            <h2 className="text-[28px] font-bold leading-tight tracking-tight md:text-[32px]">
              Dhiirigelinta Dhalinyarada
            </h2>
            <p className="mt-5 text-[15px] leading-7 text-[#434655]">
              {brandName} ma aha kaliya shirkad bixisa adeegyo farsamo. Hadafkayaga ugu weyn waa inaan awoodsiino
              dhalinyarada shaqo la'aanta ah.
            </p>
            <p className="mt-4 text-[15px] leading-7 text-[#434655]">
              Waxaan siinaa qalabka iyo teknolojiyadda ay ugu baahan yihiin inay ku abuuraan ganacsiyo u gaar ah oo
              la xiriira internetka (Data Bundles). Adigoo adeegsanaya nidaamkayaga kireysiga, waxaad noqon kartaa
              maamule ganacsi adigoo gurigaaga jooga.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Sumeysi u gaar ah (White-label Apps)',
                'Maamul xogaha macaamiisha si sahlan',
                'Warbixino iyo dabagal ganacsi',
              ].map((i) => (
                <li key={i} className="flex items-center gap-2.5 text-[15px] font-medium text-[#0b1c30]">
                  <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: BRAND }} /> {i}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CARRIERS */}
      <section id="shirkadaha" className="bg-white py-20 md:py-[120px]">
        <div className="mx-auto max-w-[1280px] px-5 md:px-20">
          <h2 className="text-center text-[28px] font-bold tracking-tight md:text-[32px]">Shirkadaha Aan La Shaqeyno</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-[#434655]">
            Waxaan isku xirnay 5-ta shirkadood ee ugu waaweyn Isgaarsiinta Soomaaliya, si toos ah oo automated ah.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {CARRIERS.map((c) => (
              <div
                key={c}
                className="flex h-24 items-center justify-center rounded-xl bg-[#eff4ff] text-[15px] font-semibold ring-1 ring-[#dbe1ff]"
                style={{ color: BRAND }}
              >
                {c}
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-xl bg-white p-6 ring-1 ring-[#dbe1ff]">
            <p className="text-center text-[16px] font-semibold">Muuqaalka Nidaamka Tooska ah (Automated Dashboard)</p>
            <div className="mt-5 flex h-56 flex-col items-center justify-center gap-3 rounded-lg bg-[#dbe1ff] text-[#434655] md:h-72">
              <LayoutDashboard className="h-7 w-7" />
              <span className="text-xs font-medium">Dashboard Transaction Flow Simulation</span>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="qiimaha" className="bg-[#eff4ff] py-20 md:py-[120px]">
        <div className="mx-auto max-w-[1280px] px-5 md:px-20">
          <h2 className="text-center text-[28px] font-bold tracking-tight md:text-[32px]">Qorshaha Qiimaha</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-[#434655]">
            Dooro qorshaha ku habboon ganacsigaaga. Hufnaan iyo qiimo aan is-bedbedelin.
          </p>

          <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
            {/* Rent */}
            <div className="rounded-xl bg-white p-7 ring-1 ring-[#dbe1ff]">
              <h3 className="text-[20px] font-bold">Kireysi (Monthly)</h3>
              <p className="mt-2 text-[14px] leading-6 text-[#434655]">
                Ku habboon ganacsiyada yaryar iyo kuwa hadda bilaabaya nidaamka kireysiga.
              </p>
              <p className="mt-6 text-[38px] font-extrabold">
                $50 <span className="text-[14px] font-medium text-[#434655]">/bishii</span>
              </p>
              <ul className="mt-6 space-y-3">
                {['App diyaar ah dhowr maalmood', 'Hosting iyo Maintenance waa ku jiraan', 'Taageero Farsamo 24/7'].map(
                  (i) => (
                    <li key={i} className="flex items-start gap-2 text-[14px] text-[#434655]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} /> {i}
                    </li>
                  )
                )}
              </ul>
              <a
                href="https://wa.link/ake9qi"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 block rounded-[10px] border border-[#c3c6d7] py-3 text-center text-sm font-semibold text-[#0b1c30] transition hover:bg-[#eff4ff]"
              >
                Dalbo Kireysi
              </a>
            </div>

            {/* Buy */}
            <div className="relative rounded-xl bg-white p-7 ring-2" style={{ borderColor: BRAND, boxShadow: '0 20px 50px -30px rgba(0,74,198,.6)', ['--tw-ring-color' as string]: BRAND }}>
              <span
                className="absolute -top-3 right-6 rounded-full px-3 py-1 text-[11px] font-semibold text-white"
                style={{ backgroundColor: '#2563eb' }}
              >
                Lagu Taliyay
              </span>
              <h3 className="text-[20px] font-bold">Iib Toos ah</h3>
              <p className="mt-2 text-[14px] leading-6 text-[#434655]">
                Iibka rasmiga ah ee nidaamka. La yeelo lahaansho buuxda.
              </p>
              <p className="mt-6 text-[38px] font-extrabold">
                $800 <span className="text-[14px] font-medium text-[#434655]">/mar qura</span>
              </p>
              <ul className="mt-6 space-y-3">
                {['Lahaansho buuxda ee Nidaamka', 'Noocyo u gaar ah (Custom Features)', 'Taageero tababar bilowga'].map(
                  (i) => (
                    <li key={i} className="flex items-start gap-2 text-[14px] text-[#434655]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} /> {i}
                    </li>
                  )
                )}
              </ul>
              <a
                href="https://wa.link/ake9qi"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 block rounded-[10px] py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: '#2563eb' }}
              >
                Dalbo Iib
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#e5eeff] pt-16">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-5 pb-10 md:grid-cols-4 md:px-20">
          <div>
            <p className="text-[15px] font-extrabold" style={{ color: BRAND }}>{brandName}</p>
            <p className="mt-3 max-w-xs text-[13px] leading-6 text-[#434655]">
              SaaS platform-ka ugu horreeya ee Soomaalida, waxaan dhisnaa oo aan kireynaa internet service apps casri ah.
            </p>
          </div>
          <div>
            <p className="text-[14px] font-semibold">Guud ahaan</p>
            <ul className="mt-3 space-y-2 text-[13px] text-[#434655]">
              {NAV.slice(0, 3).map((n) => (
                <li key={n.href}>
                  <a href={n.href} className="hover:text-[#004ac6]">{n.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[14px] font-semibold">Shirkadda</p>
            <ul className="mt-3 space-y-2 text-[13px] text-[#434655]">
              <li><a href="#kusaabsan" className="hover:text-[#004ac6]">Ku Saabsan</a></li>
              <li><button onClick={() => navigate('/privacy-policy')} className="hover:text-[#004ac6]">Shuruudaha</button></li>
              <li><button onClick={() => navigate('/privacy-policy')} className="hover:text-[#004ac6]">Xog-ilaalinta</button></li>
            </ul>
          </div>
          <div>
            <p className="text-[14px] font-semibold">Xiriirka</p>
            <ul className="mt-3 space-y-2 text-[13px] text-[#434655]">
              <li><a href="mailto:info@iftinagents.com" className="hover:text-[#004ac6]">info@iftinagents.com</a></li>
              <li><a href="tel:+252617195659" className="hover:text-[#004ac6]">+252-617195659</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[#c3c6d7]/60 py-5 text-center text-[12px] text-[#434655]">
          © {new Date().getFullYear()} {brandName}. Dhammaan xuquuqdu waa dhowran yihiin.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
