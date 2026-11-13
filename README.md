# WellNest Care

Build a responsive web application named "WellNest: Care that comes home" tailored for senior citizens, their working family members, and administrators. 

### Core App Features & Scope:
1. Authentication & Onboarding:
   - Phone OTP login (simulated with a fixed demo code).
   - Role selection/management (Senior, Family Member, Admin).
   - Mandatory Consent Screen before any health data is collected or stored (DPDP compliance, with an option to delete health data anytime).
   - Health Profile setup for seniors capturing chronic conditions (Diabetes, High BP, Heart Disease, Chewing Difficulty), dietary preferences, and mobility levels.
   - Family Linking: Allows working children/family members to link to a senior’s account to monitor bookings, orders, and receive real-time alerts.

2. Home Screen (3 Core Tiles & Dashboard):
   - Tile 1: Fitness Coaches (Home-visit or online live classes for yoga, mobility, and meditation by type, level, and slot).
   - Tile 2: Health-Suitable Meals / Restaurants (Partner kitchens offering dishes filtered strictly by the senior's health profile and dietary tags like low sugar, low sodium, low oil, soft food, complete with a "Why this suits you" label).
   - Tile 3: Medical Prescription & Delivery (Allows users to upload a doctor's prescription or select prescribed medicines, send them to partner pharmacies, and track doorstep delivery).
   - Upcoming and today's bookings/orders summary directly on the home screen.

3. Verified Partner Ecosystem & Admin Dashboard:
   - Admin can toggle verification status for Fitness Coaches, Partner Kitchens, and Pharmacies (unverified partners are hidden from search).
   - Admin can assign health suitability tags to dishes and review orders/bookings.

4. Transactions & Notifications:
   - Simulated UPI payment checkout for fitness sessions, food orders, and medicine deliveries.
   - Real-time in-app notifications/alerts sent to both the senior and linked family members upon booking or order confirmation.
   - Optional rating and review system for completed services.

### Technical & Design Requirements:
- Clean, accessible UI optimized for seniors (large text, high contrast, minimalist layout).
- Built-in mock database storing seed data (sample senior profiles, health conditions, diet tag rules, verified coaches, partner kitchens, pharmacies, and 30 health-tagged dishes).
- Fully functional flows for Senior, Family Member, and Admin views.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c5a29a00-eb45-4541-ae3d-d3d8e02d9736).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
