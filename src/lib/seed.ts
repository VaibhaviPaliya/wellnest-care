export type Role = "senior" | "family" | "admin";
export type Condition = "diabetes" | "high_bp" | "heart" | "chewing";
export type DietTag = "low_sugar" | "low_sodium" | "low_oil" | "soft_food" | "high_fiber" | "high_protein";
export type DietPref = "veg" | "non_veg" | "eggetarian" | "jain";
export type Mobility = "independent" | "assisted" | "limited";

export interface HealthProfile {
  conditions: Condition[];
  diet: DietPref;
  mobility: Mobility;
  allergies: string;
}
export interface User {
  id: string;
  phone: string;
  name: string;
  role: Role;
  consent?: { given: boolean; at: string };
  health?: HealthProfile;
  linkedSeniorIds: string[];
  address?: string;
}
export interface Coach {
  id: string; name: string; types: ("yoga" | "mobility" | "meditation")[];
  level: "gentle" | "moderate"; mode: ("home" | "online")[]; price: number;
  slots: string[]; verified: boolean; bio: string; rating: number; years: number;
}
export interface Kitchen { id: string; name: string; area: string; verified: boolean; }
export interface Dish {
  id: string; kitchenId: string; name: string; price: number;
  diet: "veg" | "non_veg" | "egg"; jain: boolean; tags: DietTag[]; desc: string;
}
export interface Pharmacy { id: string; name: string; area: string; verified: boolean; eta: string; }
export interface Medicine { id: string; name: string; dose: string; price: number; }

export type Status = "confirmed" | "in_progress" | "out_for_delivery" | "completed" | "cancelled" | "pending_review";
export interface Booking {
  id: string; type: "fitness" | "meal" | "medicine"; seniorId: string; bookedBy: string;
  title: string; partnerId: string; partnerName: string; amount: number;
  when: string; createdAt: string; status: Status; detail: string;
  items?: { name: string; qty: number; price: number }[];
  prescription?: string; prescriptionData?: string; videoUrl?: string; review?: { rating: number; text: string };
  upiRef: string;
}
export interface Notice { id: string; userId: string; title: string; body: string; at: string; read: boolean; }

export const CONDITION_LABEL: Record<Condition, string> = {
  diabetes: "Diabetes", high_bp: "High BP", heart: "Heart Disease", chewing: "Chewing Difficulty",
};
export const TAG_LABEL: Record<DietTag, string> = {
  low_sugar: "Low sugar", low_sodium: "Low sodium", low_oil: "Low oil", soft_food: "Soft food",
  high_fiber: "High fibre", high_protein: "High protein",
};
export const DIET_LABEL: Record<DietPref, string> = {
  veg: "Vegetarian", non_veg: "Non-vegetarian", eggetarian: "Eggetarian", jain: "Jain",
};
export const MOBILITY_LABEL: Record<Mobility, string> = {
  independent: "Walks independently", assisted: "Needs some support", limited: "Mostly seated / bed",
};

const today = new Date();
const d = (days: number, h: number) => {
  const x = new Date(today); x.setDate(x.getDate() + days); x.setHours(h, 0, 0, 0); return x.toISOString();
};

export const seedUsers: User[] = [
  { id: "u-senior-1", phone: "9876543210", name: "Kamala Iyer", role: "senior",
    consent: { given: true, at: d(-10, 10) },
    health: { conditions: ["diabetes", "high_bp"], diet: "veg", mobility: "assisted", allergies: "" },
    linkedSeniorIds: [], address: "12, 4th Cross, Jayanagar, Bengaluru" },
  { id: "u-senior-2", phone: "9876500001", name: "Harbhajan Singh", role: "senior",
    consent: { given: true, at: d(-5, 10) },
    health: { conditions: ["heart", "chewing"], diet: "non_veg", mobility: "limited", allergies: "Peanuts" },
    linkedSeniorIds: [], address: "Sector 21, Chandigarh" },
  { id: "u-family-1", phone: "9123456789", name: "Arjun Iyer", role: "family", linkedSeniorIds: ["u-senior-1"] },
  { id: "u-admin-1", phone: "9999999999", name: "WellNest Admin", role: "admin", linkedSeniorIds: [] },
];

export const seedCoaches: Coach[] = [
  { id: "c1", name: "Meera Nair", types: ["yoga", "meditation"], level: "gentle", mode: ["home", "online"], price: 499, slots: ["07:00", "09:00", "17:00"], verified: true, bio: "Chair yoga & breathwork for seniors.", rating: 4.8, years: 12 },
  { id: "c2", name: "Rakesh Kumar", types: ["mobility"], level: "gentle", mode: ["home"], price: 699, slots: ["08:00", "11:00", "16:00"], verified: true, bio: "Physio-trained balance & fall prevention.", rating: 4.9, years: 15 },
  { id: "c3", name: "Ananya Rao", types: ["meditation"], level: "gentle", mode: ["online"], price: 299, slots: ["06:30", "19:00", "20:00"], verified: true, bio: "Guided calm sessions for sleep & stress.", rating: 4.7, years: 8 },
  { id: "c4", name: "Vikram Desai", types: ["yoga", "mobility"], level: "moderate", mode: ["home", "online"], price: 599, slots: ["07:30", "10:00", "18:00"], verified: true, bio: "Strength and flexibility for active seniors.", rating: 4.6, years: 10 },
  { id: "c5", name: "Sunil Mehta", types: ["yoga"], level: "moderate", mode: ["online"], price: 349, slots: ["06:00", "18:30"], verified: false, bio: "Awaiting background verification.", rating: 0, years: 3 },
];

export const seedKitchens: Kitchen[] = [
  { id: "k1", name: "Annapoorna Wellness Kitchen", area: "Jayanagar", verified: true },
  { id: "k2", name: "Gentle Bites", area: "Indiranagar", verified: true },
  { id: "k3", name: "HeartSmart Meals", area: "Koramangala", verified: true },
  { id: "k4", name: "Spice Street Express", area: "MG Road", verified: false },
];

const dish = (id: string, kitchenId: string, name: string, price: number, diet: Dish["diet"], tags: DietTag[], desc: string, jain = false): Dish =>
  ({ id, kitchenId, name, price, diet, tags, desc, jain });

export const seedDishes: Dish[] = [
  dish("d1", "k1", "Ragi Mudde with Soppu Saaru", 160, "veg", ["low_sugar", "low_oil", "high_fiber"], "Finger millet balls with mild greens curry."),
  dish("d2", "k1", "Moong Dal Khichdi", 140, "veg", ["low_sodium", "low_oil", "soft_food"], "Soft rice and lentils, lightly tempered.", true),
  dish("d3", "k1", "Vegetable Daliya Upma", 120, "veg", ["low_sugar", "high_fiber", "low_oil"], "Broken wheat with vegetables."),
  dish("d4", "k1", "Curd Rice (no salt added)", 110, "veg", ["low_sodium", "soft_food"], "Cooling, gentle on the stomach.", true),
  dish("d5", "k1", "Steamed Idli with Sambar", 120, "veg", ["low_oil", "soft_food", "low_sugar"], "Fermented, steamed, soft."),
  dish("d6", "k1", "Methi Thepla (2) with Dahi", 130, "veg", ["low_sugar", "high_fiber"], "Fenugreek flatbread, good for sugar control."),
  dish("d7", "k1", "Lauki Chana Dal", 150, "veg", ["low_sodium", "low_oil", "high_protein"], "Bottle gourd with split chickpeas."),
  dish("d8", "k1", "Pongal (low ghee)", 130, "veg", ["soft_food", "low_oil"], "Comforting rice-lentil mash."),
  dish("d9", "k1", "Sweet Kesari", 90, "veg", ["soft_food"], "Traditional semolina sweet (high sugar)."),
  dish("d10", "k1", "Masala Dosa", 140, "veg", [], "Crispy dosa with potato filling (high oil)."),
  dish("d11", "k2", "Palak Paneer Purée Bowl", 190, "veg", ["soft_food", "high_protein", "low_sugar"], "Smooth spinach with soft paneer."),
  dish("d12", "k2", "Sweet Potato & Carrot Mash", 140, "veg", ["soft_food", "low_sodium", "low_oil"], "Silky, naturally sweet mash.", true),
  dish("d13", "k2", "Egg Bhurji (soft) with Phulka", 150, "egg", ["high_protein", "soft_food", "low_sugar"], "Soft-scrambled eggs, mild spice."),
  dish("d14", "k2", "Steamed Fish in Coconut Broth", 260, "non_veg", ["soft_food", "low_oil", "high_protein", "low_sugar"], "Flaky fish in a light broth."),
  dish("d15", "k2", "Chicken Stew (Kerala style)", 240, "non_veg", ["soft_food", "low_sugar", "high_protein"], "Slow-cooked tender chicken."),
  dish("d16", "k2", "Oats Porridge with Almond Milk", 120, "veg", ["low_sugar", "low_sodium", "soft_food", "high_fiber"], "Unsweetened, cinnamon-spiced."),
  dish("d17", "k2", "Mixed Vegetable Soup", 110, "veg", ["low_sodium", "low_oil", "soft_food", "low_sugar"], "Clear soup, no added salt.", true),
  dish("d18", "k2", "Paneer Butter Masala", 220, "veg", ["high_protein"], "Rich, creamy curry (high oil & sodium)."),
  dish("d19", "k2", "Mango Lassi", 100, "veg", ["soft_food"], "Sweet yoghurt drink (high sugar)."),
  dish("d20", "k2", "Dal Tadka with Jeera Rice", 170, "veg", ["high_protein", "low_sugar"], "Everyday comfort plate."),
  dish("d21", "k3", "Grilled Chicken & Quinoa Bowl", 280, "non_veg", ["low_sugar", "low_oil", "high_protein", "low_sodium"], "Lean protein with greens."),
  dish("d22", "k3", "Millet Vegetable Pulao", 170, "veg", ["low_sugar", "low_oil", "high_fiber", "low_sodium"], "Foxtail millet, garden vegetables."),
  dish("d23", "k3", "Sprouts & Cucumber Salad", 130, "veg", ["low_sugar", "low_sodium", "low_oil", "high_fiber"], "Crunchy, fresh, no dressing oil."),
  dish("d24", "k3", "Baked Fish with Herbs", 290, "non_veg", ["low_oil", "low_sodium", "high_protein", "low_sugar"], "Oven-baked, lemon herb."),
  dish("d25", "k3", "Lentil Soup (Masoor)", 120, "veg", ["low_sodium", "low_oil", "soft_food", "high_protein", "low_sugar"], "Smooth red lentil soup.", true),
  dish("d26", "k3", "Egg White Omelette & Toast", 140, "egg", ["low_oil", "high_protein", "low_sugar"], "Light breakfast plate."),
  dish("d27", "k3", "Steamed Veg Momos", 150, "veg", ["low_oil", "soft_food"], "Soft steamed dumplings."),
  dish("d28", "k3", "Brown Rice & Rajma", 180, "veg", ["high_fiber", "high_protein", "low_sugar", "low_oil"], "Kidney beans, lightly spiced."),
  dish("d29", "k3", "Chicken Keema Soft Rice", 230, "non_veg", ["soft_food", "high_protein", "low_sugar", "low_oil", "low_sodium"], "Minced chicken, mild and moist."),
  dish("d30", "k3", "Gulab Jamun (2)", 80, "veg", [], "Fried sweet in syrup (high sugar & oil)."),
  dish("d31", "k4", "Chole Bhature", 180, "veg", [], "Unverified kitchen — hidden from search."),
];

export const seedPharmacies: Pharmacy[] = [
  { id: "p1", name: "Apollo Care Pharmacy", area: "Jayanagar", verified: true, eta: "45 min" },
  { id: "p2", name: "MedPlus Health", area: "BTM Layout", verified: true, eta: "60 min" },
  { id: "p3", name: "Jan Aushadhi Kendra", area: "Basavanagudi", verified: true, eta: "90 min" },
  { id: "p4", name: "QuickMeds Online", area: "Unknown", verified: false, eta: "2 hrs" },
];

export const seedMedicines: Medicine[] = [
  { id: "m1", name: "Metformin", dose: "500 mg · 30 tabs", price: 45 },
  { id: "m2", name: "Amlodipine", dose: "5 mg · 30 tabs", price: 60 },
  { id: "m3", name: "Atorvastatin", dose: "10 mg · 30 tabs", price: 110 },
  { id: "m4", name: "Telmisartan", dose: "40 mg · 30 tabs", price: 95 },
  { id: "m5", name: "Aspirin (low dose)", dose: "75 mg · 30 tabs", price: 25 },
  { id: "m6", name: "Glimepiride", dose: "1 mg · 30 tabs", price: 70 },
  { id: "m7", name: "Vitamin D3", dose: "60,000 IU · 4 caps", price: 120 },
  { id: "m8", name: "Calcium + D3", dose: "500 mg · 30 tabs", price: 140 },
];

export const seedBookings: Booking[] = [
  { id: "b-seed-1", type: "fitness", seniorId: "u-senior-1", bookedBy: "u-senior-1", title: "Chair Yoga · Home visit",
    partnerId: "c1", partnerName: "Meera Nair", amount: 499, when: d(0, 17), createdAt: d(-1, 9),
    status: "confirmed", detail: "Gentle yoga at home", upiRef: "UPI4829301" },
  { id: "b-seed-2", type: "meal", seniorId: "u-senior-1", bookedBy: "u-family-1", title: "Lunch from Annapoorna",
    partnerId: "k1", partnerName: "Annapoorna Wellness Kitchen", amount: 260, when: d(1, 13), createdAt: d(0, 8),
    status: "confirmed", detail: "2 items", items: [{ name: "Moong Dal Khichdi", qty: 1, price: 140 }, { name: "Steamed Idli with Sambar", qty: 1, price: 120 }], upiRef: "UPI4829302" },
  { id: "b-seed-3", type: "medicine", seniorId: "u-senior-1", bookedBy: "u-senior-1", title: "Monthly BP & sugar medicines",
    partnerId: "p1", partnerName: "Apollo Care Pharmacy", amount: 105, when: d(-3, 12), createdAt: d(-3, 10),
    status: "completed", detail: "Metformin, Amlodipine", items: [{ name: "Metformin", qty: 1, price: 45 }, { name: "Amlodipine", qty: 1, price: 60 }], upiRef: "UPI4829303" },
];

export const seedNotices: Notice[] = [
  { id: "n1", userId: "u-family-1", title: "Yoga session booked for Amma", body: "Kamala's Chair Yoga with Meera Nair is today at 5:00 PM.", at: d(-1, 9), read: false },
  { id: "n2", userId: "u-senior-1", title: "Lunch ordered by Arjun", body: "Arjun ordered lunch from Annapoorna for tomorrow 1:00 PM.", at: d(0, 8), read: false },
];

export const DEMO_OTP = "123456";
