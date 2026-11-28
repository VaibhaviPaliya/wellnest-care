import { describe, expect, it } from "vitest";
import { createTranslator } from "./domTranslate";
import { HI_EXTRA } from "./i18n-hi";
import { HI } from "./i18n";

const t = createTranslator({ ...HI_EXTRA, ...HI }).translate;

describe("Hindi page translator", () => {
  it("translates whole labels and keeps surrounding punctuation", () => {
    expect(t("Join online class")).toBe("ऑनलाइन क्लास में जुड़ें");
    expect(t("Confirmed")).toBe("पुष्टि हुई");
  });
  it("translates each part of 'A · B' and dates, leaving names and codes alone", () => {
    expect(t("Meditation · Online live")).toBe("ध्यान · लाइव ऑनलाइन");
    expect(t("Ananya Rao · Sat, 28 Nov, 6:30 am")).toBe("Ananya Rao · शनि, 28 नव॰, 6:30 पूर्वाह्न");
    expect(t("₹299 paid · pay_U5H4xnixKBQICc")).toBe("₹299 भुगतान · pay_U5H4xnixKBQICc");
  });
  it("fills sentences that contain numbers or names", () => {
    expect(t("Pinned (accurate to ~116 m). Do this from home.")).toBe("पिन किया गया (लगभग ~116 मीटर तक सटीक)। यह घर से ही करें।");
    expect(t("Filled from India Post: Raigarh(MH), Maharashtra. You can edit these.")).toBe("इंडिया पोस्ट से भरा गया: Raigarh(MH), महाराष्ट्र। आप इन्हें बदल सकते हैं।");
    expect(t("Good morning, Kamala")).toBe("सुप्रभात, Kamala");
    expect(t("Motorbike · Jayanagar · 0 open orders")).toBe("मोटरसाइकिल · Jayanagar · 0 खुले ऑर्डर");
  });
  it("leaves unknown text and pure names alone", () => {
    expect(t("Meera Nair")).toBeNull();
    expect(t("Gentle Bites")).toBeNull();
    expect(t("12345")).toBeNull();
  });
});
