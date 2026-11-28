import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { HI_EXTRA } from "./i18n-hi";
import { createTranslator } from "./domTranslate";

export type Lang = "en" | "hi";
const KEY = "wellnest-lang";

/**
 * English source text → Hindi. Strings without an entry fall back to English,
 * so untranslated screens keep working. `{name}`-style placeholders are filled by `t`.
 */
export const HI: Record<string, string> = {
  'Partner location map': 'पार्टनर का स्थान मानचित्र',
  'Loading map…': 'मानचित्र लोड हो रहा है…',
  'Map unavailable. Please try again later.': 'मानचित्र उपलब्ध नहीं है। बाद में फिर प्रयास करें।',
  'Tracking unavailable, expired or not shared with this account.': 'ट्रैकिंग उपलब्ध नहीं है, समाप्त हो गई है या इस खाते के साथ साझा नहीं है।',
  'Location is not supported on this phone.': 'इस फ़ोन पर स्थान साझा करना उपलब्ध नहीं है।',
  'Location permission denied. Allow location in your phone settings.': 'स्थान की अनुमति नहीं मिली। फ़ोन की सेटिंग में अनुमति दें।',
  'Could not read your location. Check GPS and try again.': 'स्थान नहीं मिल सका। GPS जाँचकर फिर प्रयास करें।',
  'Sign in with email to use private location tracking.': 'निजी स्थान ट्रैकिंग के लिए ईमेल से साइन इन करें।',
  'Location sharing stopped': 'स्थान साझा करना बंद है',
  'Tracking expired': 'ट्रैकिंग समाप्त हो गई',
  'Sharing your location': 'आपका स्थान साझा हो रहा है',
  'Live partner location': 'पार्टनर का वर्तमान स्थान',
  'Location is stale — partner may be offline': 'स्थान पुराना है — पार्टनर ऑफ़लाइन हो सकता है',
  'Waiting for partner location': 'पार्टनर के स्थान का इंतज़ार है',
  'Sharing ends at {time}': 'साझाकरण {time} पर समाप्त होगा',
  'Last update: {time} · accuracy about {meters} m': 'अंतिम अपडेट: {time} · सटीकता लगभग {meters} मीटर',
  'I agree to share my current location with the organizer and their invited family member while this visit or delivery is active.': 'इस विज़िट या डिलीवरी के दौरान मैं अपना वर्तमान स्थान आयोजक और उनके आमंत्रित परिवारजन के साथ साझा करने के लिए सहमत हूँ।',
  'Keep this page open and your phone unlocked. Background tracking is not available. Only your latest location is stored.': 'यह पेज खुला और फ़ोन अनलॉक रखें। पृष्ठभूमि ट्रैकिंग उपलब्ध नहीं है। केवल नवीनतम स्थान सहेजा जाता है।',
  'Start sharing location': 'स्थान साझा करना शुरू करें',
  'Stop and erase location': 'बंद करें और स्थान मिटाएँ',
  'Track real partner location': 'पार्टनर का वास्तविक स्थान देखें',
  'Real tracking needs an email account; demo phone accounts cannot share private locations.': 'वास्तविक ट्रैकिंग के लिए ईमेल खाता चाहिए; डेमो फ़ोन खाते निजी स्थान साझा नहीं कर सकते।',
  'Open tracking page': 'ट्रैकिंग पेज खोलें',
  'Tracking link copied.': 'ट्रैकिंग लिंक कॉपी हो गया।',
  'Could not copy. Open the tracking page and share its address.': 'कॉपी नहीं हो सका। ट्रैकिंग पेज खोलकर उसका पता साझा करें।',
  'Copy private tracking link': 'निजी ट्रैकिंग लिंक कॉपी करें',
  'Assigned partner email': 'नियुक्त पार्टनर का ईमेल',
  'Family viewer email (optional)': 'देखने वाले परिवारजन का ईमेल (वैकल्पिक)',
  'Share the private link with the assigned coach or delivery partner. They must sign in with this exact email. The link alone grants no access. Never enter a stranger’s email.': 'नियुक्त कोच या डिलीवरी पार्टनर को निजी लिंक भेजें। वे इसी ईमेल से साइन इन करें। केवल लिंक से अनुमति नहीं मिलती। अजनबी का ईमेल न डालें।',
  'Create private tracking': 'निजी ट्रैकिंग बनाएँ',
  'Private partner tracking': 'निजी पार्टनर ट्रैकिंग',
  'Open the private tracking link sent by the organizer.': 'आयोजक द्वारा भेजा गया निजी ट्रैकिंग लिंक खोलें।',
  'Sign in using the email invited by the organizer.': 'आयोजक द्वारा आमंत्रित ईमेल से साइन इन करें।',
  Email: 'ईमेल',
  'Email approval code': 'ईमेल सत्यापन कोड',
  'Verify code': 'कोड सत्यापित करें',
  'Send email code': 'ईमेल कोड भेजें',
  'Change email or resend': 'ईमेल बदलें या फिर भेजें',
  'Back to WellNest': 'WellNest पर वापस',
  // Navigation & shell
  Home: "होम",
  Bookings: "बुकिंग",
  Alerts: "सूचनाएँ",
  Family: "परिवार",
  Profile: "प्रोफ़ाइल",
  Admin: "एडमिन",
  Reminders: "रिमाइंडर",
  "Log out": "लॉग आउट",
  "Care that comes home": "देखभाल, आपके घर तक",
  "← Back to home": "← होम पर वापस",
  Language: "भाषा",
  // Home
  "Good morning, {name}": "सुप्रभात, {name}",
  "Good afternoon, {name}": "नमस्कार, {name}",
  "Good evening, {name}": "शुभ संध्या, {name}",
  "What would you like help with today?": "आज आपको किस चीज़ में मदद चाहिए?",
  "You’re looking after {name}. Anything you book is for them.":
    "आप {name} की देखभाल कर रहे हैं। आप जो भी बुक करेंगे, वह उनके लिए होगा।",
  "Fitness Coaches": "फ़िटनेस कोच",
  "Yoga, mobility & meditation — at home or online": "योग, मोबिलिटी और ध्यान — घर पर या ऑनलाइन",
  "Health-Suitable Meals": "सेहत के अनुकूल भोजन",
  "Dishes chosen for your health needs": "आपकी सेहत के अनुसार चुने गए व्यंजन",
  "Medicines & Delivery": "दवाइयाँ और डिलीवरी",
  "Upload prescription, get it delivered": "पर्चा अपलोड करें, दवा घर मँगाएँ",
  Open: "खोलें",
  Today: "आज",
  "Coming up": "आने वाले",
  "See all": "सभी देखें",
  "Nothing scheduled for today.": "आज के लिए कुछ निर्धारित नहीं है।",
  "No upcoming bookings yet.": "अभी कोई आगामी बुकिंग नहीं है।",
  "Link a family member first": "पहले परिवार के सदस्य को जोड़ें",
  "Link a senior": "वरिष्ठ सदस्य को जोड़ें",
  "Today’s reminders": "आज के रिमाइंडर",
  "Manage reminders": "रिमाइंडर प्रबंधित करें",
  "No reminders set for today.": "आज के लिए कोई रिमाइंडर नहीं है।",
  // Statuses
  Confirmed: "पुष्टि हुई",
  "Being prepared": "तैयार हो रहा है",
  "Out for delivery": "डिलीवरी के लिए निकला",
  Completed: "पूरा हुआ",
  Cancelled: "रद्द",
  "Pharmacy reviewing": "फ़ार्मेसी जाँच रही है",
  // Page titles
  "Bookings & Orders": "बुकिंग और ऑर्डर",
  "For {name}": "{name} के लिए",
  Active: "चालू",
  Past: "पिछले",
  "Nothing here yet.": "अभी यहाँ कुछ नहीं है।",
  "Updates on bookings and orders.": "बुकिंग और ऑर्डर से जुड़ी जानकारी।",
  "No alerts yet.": "अभी कोई सूचना नहीं है।",
  "Every coach is background-verified and trained for seniors.":
    "हर कोच की पृष्ठभूमि जाँची गई है और वे बुज़ुर्गों के लिए प्रशिक्षित हैं।",
  "Only licensed, verified pharmacies. Pharmacist checks every prescription.":
    "केवल लाइसेंसशुदा, सत्यापित फ़ार्मेसी। हर पर्चे की जाँच फ़ार्मासिस्ट करते हैं।",
  "Seniors you look after.": "जिन वरिष्ठ सदस्यों की आप देखभाल करते हैं।",
  "My Profile": "मेरी प्रोफ़ाइल",
  // Reminders page
  "Daily reminders for medicines, exercise, meals and water. Linked family members are alerted too.":
    "दवा, व्यायाम, भोजन और पानी के लिए रोज़ाना रिमाइंडर। जुड़े हुए परिवारजनों को भी सूचना मिलती है।",
  "Add a reminder": "रिमाइंडर जोड़ें",
  "What to remember": "क्या याद रखना है",
  Type: "प्रकार",
  Time: "समय",
  "Repeat on": "किन दिनों दोहराएँ",
  "Every day": "हर दिन",
  "Save reminder": "रिमाइंडर सहेजें",
  "Your reminders": "आपके रिमाइंडर",
  "No reminders yet.": "अभी कोई रिमाइंडर नहीं है।",
  Pause: "रोकें",
  Resume: "फिर शुरू करें",
  Delete: "हटाएँ",
  Paused: "रुका हुआ",
  "Done today": "आज हो गया",
  "Reminder saved.": "रिमाइंडर सहेजा गया।",
  Medicine: "दवा",
  Exercise: "व्यायाम",
  Meal: "भोजन",
  Water: "पानी",
  Other: "अन्य",
  "Reminders show while WellNest is open in this browser. You also get an alert 30 minutes before every booking.":
    "रिमाइंडर तभी दिखते हैं जब WellNest इस ब्राउज़र में खुला हो। हर बुकिंग से 30 मिनट पहले भी सूचना मिलती है।",
  "Reminders are not medical advice. Follow your doctor’s dosage instructions.":
    "रिमाइंडर चिकित्सीय सलाह नहीं हैं। दवा की मात्रा के लिए अपने डॉक्टर के निर्देश मानें।",
  Sun: "रवि",
  Mon: "सोम",
  Tue: "मंगल",
  Wed: "बुध",
  Thu: "गुरु",
  Fri: "शुक्र",
  Sat: "शनि",
  // Photos, delivery, payment, arrival
  Paid: "भुगतान हो गया",
  "Coach arrives {from}–{to}": "कोच {from}–{to} के बीच पहुँचेंगे",
  "verified delivery partner": "सत्यापित डिलीवरी पार्टनर",
  "arrives around {time}": "लगभग {time} पहुँचेंगे",
  // Two-phone sync
  "Use on two phones": "दो फ़ोन पर इस्तेमाल करें",
  "Room code": "रूम कोड",
  "Turn on sync": "सिंक चालू करें",
  "Turn off sync": "सिंक बंद करें",
  Off: "बंद",
  "Connecting…": "जुड़ रहा है…",
  "Live · {n} other device(s) connected": "चालू · {n} अन्य डिवाइस जुड़े हैं",
  "Could not connect. Check the internet connection.": "जुड़ नहीं सका। इंटरनेट कनेक्शन जाँचें।",
  "Sync on. Use the same room code on the other phone.":
    "सिंक चालू है। दूसरे फ़ोन पर वही रूम कोड डालें।",
  "Sync off. Data stays on this device.": "सिंक बंद है। डेटा इसी डिवाइस पर रहेगा।",
  "Turn this on with the same room code on the senior’s and the family member’s phones to share bookings and alerts between them.":
    "वरिष्ठ सदस्य और परिवारजन के फ़ोन पर एक ही रूम कोड से इसे चालू करें, ताकि बुकिंग और सूचनाएँ दोनों को दिखें।",
  "Demo only: everyone with this room code receives this demo’s data, including health profiles. Use test data. Uploaded prescriptions and records stay on this device.":
    "केवल डेमो के लिए: इस रूम कोड वाले हर व्यक्ति को इस डेमो का डेटा, स्वास्थ्य प्रोफ़ाइल सहित, मिलेगा। केवल टेस्ट डेटा इस्तेमाल करें। अपलोड किए गए पर्चे और रिकॉर्ड इसी डिवाइस पर रहते हैं।",
  // Ratings
  "New partner · no reviews yet": "नया पार्टनर · अभी कोई समीक्षा नहीं",
  "{count} reviews": "{count} समीक्षाएँ",
  "1 review": "1 समीक्षा",
};

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (en: string, vars?: Record<string, string | number>) => string;
}
const L = createContext<LangCtx | null>(null);

/** Every known translation: the hand-written list above wins over the generated one. */
const ALL_HI: Record<string, string> = { ...HI_EXTRA, ...HI };
let pageTranslator: ReturnType<typeof createTranslator> | null = null;

export function translate(lang: Lang, en: string, vars?: Record<string, string | number>): string {
  const base = lang === "hi" ? (ALL_HI[en] ?? en) : en;
  return vars ? base.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : base;
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "hi") setLangState("hi");
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    // Hindi: translate everything on the page, including text that doesn't go through t().
    pageTranslator ??= createTranslator(ALL_HI);
    if (lang === "hi") pageTranslator.start();
    else pageTranslator.stop();
    return () => pageTranslator?.stop();
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const t = useCallback(
    (en: string, vars?: Record<string, string | number>) => translate(lang, en, vars),
    [lang],
  );
  return <L.Provider value={{ lang, setLang, t }}>{children}</L.Provider>;
}

/** Falls back to English outside the provider (e.g. in isolated component tests). */
export function useT(): LangCtx {
  return (
    useContext(L) ?? { lang: "en", setLang: () => {}, t: (en, vars) => translate("en", en, vars) }
  );
}

export function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <div
      role="group"
      aria-label="Language / भाषा"
      className="flex overflow-hidden rounded-lg border"
    >
      {(["en", "hi"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-10 px-3 text-sm font-semibold transition-colors ${lang === l ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
        >
          {l === "en" ? "EN" : "हिंदी"}
        </button>
      ))}
    </div>
  );
}
