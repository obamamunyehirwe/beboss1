import type { Lang } from "@/lib/i18n-dict";

/**
 * Structured public-site copy (lists, steps, statuses) in all four languages.
 * Short one-line labels live in i18n-dict.ts; longer page content lives here.
 */
type Item = { t: string; d: string };

export type PageCopy = {
  common: {
    dismiss: string; changeLanguage: string; openMenu: string; menu: string;
    footProduct: string; footOwners: string; footResources: string; footTeam: string;
    notFoundTitle: string; notFoundDesc: string; goHome: string;
    errorTitle: string; errorDesc: string; tryAgain: string; days: string;
  };
  home: { heroAlt: string; counterAlt: string; sealed: string };
  features: { title: string; items: Item[] }[];
  sectors: string[];
  guide: { playbooks: { role: string; steps: string[] }[]; tipsTitle: string; tips: string[]; faq: [string, string][] };
  pricing: {
    tiers: { name: string; note: string }[];
    staffLine: string; devicesLine: string; discountsLine: string;
    exactPrice: string; howPaying: string; steps: Item[];
  };
  how: { codeLegend: string };
  download: { printPoster: string };
  offline: { counterPhone: string; cloud: string; toggle: string };
  demo: { products: Record<string, string>; offline: string; addOne: string; removeOne: string };
  mockup: {
    mainStore: string; shopPos: string; todaysSales: string; profitLine: string; total: string;
    cash: string; credit: string; completeSale: string; devices: string; syncedWifi: string;
    sealedReceipt: string; syncing: string; offline: string;
  };
  contact: {
    email: string; paidAlready: string; proofForm: string; addContact: string; sendFailed: string;
    checkForm: string; waGreeting: string; topics: Record<"GENERAL" | "SALES" | "SUPPORT" | "PAYMENT" | "PARTNERSHIP", string>;
  };
  myShop: {
    lookupFailed: string; proofSent: string; sendFailed: string; payerName: string; payerPhone: string;
    amountNote: string; ref: string; status: Record<string, string>;
  };
};

const en: PageCopy = {
  common: {
    dismiss: "Dismiss", changeLanguage: "Change language", openMenu: "Open menu", menu: "Menu",
    footProduct: "Product", footOwners: "Owners", footResources: "Resources", footTeam: "Team",
    notFoundTitle: "Page not found", notFoundDesc: "The page you're looking for doesn't exist or has been moved.", goHome: "Go home",
    errorTitle: "This page didn't load", errorDesc: "Something went wrong on our end. You can try refreshing or head back home.", tryAgain: "Try again", days: "days",
  },
  home: {
    heroAlt: "Shop owner in Kigali holding a phone running BeBoss",
    counterAlt: "Phone and thermal receipt printer on a pharmacy counter",
    sealed: "Receipts with a checksum",
  },
  features: [
    { title: "Point of sale & checkout", items: [
      { t: "Camera barcode scanner", d: "Scan SKUs with the phone camera, or search by name and category in an instant product grid." },
      { t: "5 payment methods", d: "Cash, MTN MoMo, Airtel Money, card, split Cash + MoMo with live remaining balance, and customer credit." },
      { t: "Hold & resume carts", d: "Park a basket at rush hour, serve the next customer, resume with one tap." },
      { t: "Receipt checksum", d: "A checksum can flag mismatched receipt fields, but it is not a digital signature or proof that a receipt is authentic." },
      { t: "Thermal & WhatsApp", d: "58mm Bluetooth or 80mm counter printers with logo, VAT/TIN and QR — or send as a WhatsApp receipt." },
    ] },
    { title: "Stock, money & insight", items: [
      { t: "Real profit & loss", d: "Today, week, month or all-time P&L using real cost of goods, with per-item margin %." },
      { t: "Sales-based stock estimates", d: "Low-stock indicators use the catalogue and recorded movements; inaccurate costs, units or quantities lead to inaccurate reports." },
      { t: "Customer credit ledger", d: "Credit limits, balances, payment history and reminders help track receivables; repayment is not guaranteed." },
      { t: "Purchases & adjustments", d: "Supplier deliveries, damaged/expired losses and count corrections — all audited with reasons." },
    ] },
    { title: "Teams, branches & sync", items: [
      { t: "Role-based access", d: "Owner, manager and cashier roles. Switch operators with a 4-digit PIN in under 2 seconds." },
      { t: "Multi-branch", d: "Filter dashboards per branch or consolidated, and record inter-branch stock transfers." },
      { t: "Paired devices", d: "Add terminals with a join code. Each device works offline and syncs with the shop." },
      { t: "Offline-first sync", d: "LAN/hotspot device-to-device sync plus signed cloud snapshots when internet returns." },
      { t: "Cloud approvals", d: "Subscriptions unlock automatically as soon as an approved payment syncs." },
    ] },
    { title: "Security you can trust", items: [
      { t: "Encrypted database", d: "AES-256 encrypted storage with keys protected by the phone's hardware keystore." },
      { t: "Biometrics & lockout", d: "Fingerprint unlock, PIN hashing, brute-force lockout and idle auto-lock." },
      { t: "Clock-tamper guard", d: "Rolling the phone's date back cannot extend a trial or a license." },
      { t: "Signed unlock codes", d: "Each newly issued BB3 ECDSA code is linked to one verified payment request, its exact plan and its registered shop. Legacy BB2 codes remain verifiable against their original issue record." },
      { t: "4 languages", d: "English, Ikinyarwanda, Français and Kiswahili — switch anywhere, even offline." },
    ] },
  ],
  sectors: ["Retail & grocery", "Pharmacies", "Hardware & building", "Wholesale depots", "Electronics & phones", "Fashion & cosmetics", "Restaurants & bars", "Salons & services", "Mini-supermarkets", "Multi-branch chains"],
  guide: {
    playbooks: [
      { role: "Shop owner", steps: [
        "Install the app, choose your language and complete the 3-step shop wizard (name, sector, currency, owner PIN).",
        "Import your product list from CSV or add items with the camera scanner. Set cost and selling prices to see real margins.",
        "Create manager and cashier accounts with their own PINs, and assign each one to a branch.",
        "Each evening, open the Dashboard: compare sales vs. target, check profit and review the 14-day reorder plan.",
        "Before the trial ends, pay with MoMo from Settings → License and submit your proof.",
      ] },
      { role: "Store manager", steps: [
        "Record supplier deliveries in Purchases so stock and cost stay accurate.",
        "Log damaged or expired goods as adjustments with a reason — never delete sales.",
        "Record stock transfers between branches and reconcile the sending and receiving quantities.",
        "Approve refunds and voids; each one is audited and restores stock correctly.",
      ] },
      { role: "Cashier", steps: [
        "Unlock with your 4-digit PIN or fingerprint at the start of your shift and enter the opening float.",
        "Scan or tap products, choose Cash, MoMo, Airtel, Split or Credit, and let the app compute change.",
        "Hold a cart when a customer steps away; resume it from the held carts list.",
        "Print or WhatsApp the sealed receipt. Lock the terminal when you leave the counter.",
      ] },
    ],
    tipsTitle: "Checks to keep your records useful",
    tips: [
      "Set a credit limit for every customer before giving goods on credit.",
      "Send polite WhatsApp reminders every Monday from the Customers screen.",
      "Restock bestsellers when days-of-cover drops below 5.",
      "Run a quick stock count each week on your top 20 items to catch shrinkage early.",
      "Keep one phone as the owner device and add cashiers as paired devices — every action stays traceable.",
    ],
    faq: [
      ["Does BeBoss work without internet?", "Sales and stock changes can be recorded on the phone offline. Cloud and branch synchronization needs a connection; check that records sync before relying on them across devices."],
      ["How does the free trial work?", "Every new shop gets 4 days of full access. After that, the app locks until you pay — your data stays safe and encrypted on the phone."],
      ["How do I pay?", "Use the operator's USSD flow, then submit the payer's full name and phone, payment time, selected plan and optional payment note in the app or My shop page. BeBoss records the claim; it does not automatically verify settlement through an operator API. An admin checks the provider statement before approval."],
      ["What is a BB3 unlock code?", "A signed ECDSA P-256 code generated after an administrator verifies a submitted payment. It is linked to the payment request, selected plan, username and registered phone. Paste it in Settings → Insert Unlock Code."],
      ["Can I use several phones in one shop?", "Yes. The owner device is included; each extra paired device adds a small monthly fee. Devices join with a code from the owner phone."],
      ["What happens to my data if I change phones?", "Use the encrypted backup and restore in Settings, or re-sync from a branch device, so nothing is lost."],
      ["Which printers are supported?", "Standard ESC/POS thermal printers: 58mm Bluetooth mobile printers and 80mm counter printers."],
      ["Is my data private?", "Business data stays on your devices. Only license status, the device and staff directory and signed branch snapshots are synced to the BeBoss cloud, and each shop can only read its own records."],
    ],
  },
  pricing: {
    tiers: [
      { name: "Single store", note: "1 branch • owner device included" },
      { name: "Two branches", note: "2 branches • consolidated dashboard" },
      { name: "3+ branches", note: "Transfers and sync; pilot reconciliation before relying on consolidated stock" },
    ],
    staffLine: "Staff: 2–3 = +2,000 • 4–5 = +4,000 • 6+ = +1,000 each",
    devicesLine: "Extra paired devices: +{rate} FRw each / month",
    discountsLine: "3 months −10% • 12 months −20% • 4-day free trial",
    exactPrice: "Your exact price",
    howPaying: "How paying works",
    steps: [
      { t: "Dial the code", d: "Use the MTN *182# or Airtel *500# code above — the amount is already filled in." },
      { t: "Send your proof", d: "In the app (Settings → License) or on the My shop page, submit the payer's full name and phone, payment time, selected plan and an optional note. No transaction ID is required." },
      { t: "Admin review", d: "An administrator compares the submitted payer, time and plan details with the MTN or Airtel provider statement. A USSD dial alone is not proof of settlement." },
      { t: "Unlock", d: "After approval, the shop unlocks on its next sync or the administrator issues a unique BB3 code linked to that payment. WhatsApp can carry proof or the code; it does not verify payment automatically." },
    ],
  },
  how: { codeLegend: "plan · days · valid-until · account hash · signature" },
  download: { printPoster: "Print QR poster" },
  offline: { counterPhone: "Counter phone", cloud: "BeBoss Cloud", toggle: "Turn internet on or off" },
  demo: { products: { milk: "Inyange Milk 1L", sugar: "Kabuye Sugar 1kg", rice: "Mukamira Rice 5kg", bread: "Bread loaf", oil: "Cooking oil 1L", soap: "Bar soap", eggs: "Eggs tray (30)", soda: "Fanta 500ml" }, offline: "offline", addOne: "Add one", removeOne: "Remove one" },
  mockup: {
    mainStore: "Main Store", shopPos: "Mama Shop • POS", todaysSales: "Today's sales", profitLine: "Profit 41,250 • 37 receipts",
    total: "Total", cash: "Cash", credit: "Credit", completeSale: "Complete sale", devices: "3 devices",
    syncedWifi: "synced over Wi-Fi", sealedReceipt: "sealed receipt", syncing: "Syncing…", offline: "Offline",
  },
  contact: {
    email: "Email", paidAlready: "Payment already made? The fastest way to get unlocked is the", proofForm: "payment proof form",
    addContact: "Add a phone number or email so we can reply.", sendFailed: "Could not send your message. Please try again.",
    checkForm: "Please check your name and message.", waGreeting: "Hello BeBoss team!",
    topics: { GENERAL: "General", SALES: "Sales", SUPPORT: "Support", PAYMENT: "Payment", PARTNERSHIP: "Partnership" },
  },
  myShop: {
    lookupFailed: "Lookup failed. Check the username and phone, then try again.",
    proofSent: "Payment proof sent. You'll be unlocked as soon as it's verified.",
    sendFailed: "Could not send your proof. Check the details and try again.",
    payerName: "Payer full name (as on MoMo)", payerPhone: "Payer phone",
    amountNote: "BeBoss saves your payer details, payment time and selected plan. Your shop is unlocked only after an administrator verifies the payment with the mobile-money provider. Use the same shop username and registered phone so approval reaches the right account.",
    ref: "Ref",
    status: { ACTIVE: "Active", TRIAL: "Free trial", EXPIRED: "Expired", SUSPENDED: "Suspended", APPROVED: "Approved", PENDING_VERIFICATION: "Waiting for verification", REJECTED: "Rejected", REDEEMED: "Used", ISSUED: "Ready to use", REVOKED: "Cancelled" },
  },
};

const rw: PageCopy = {
  common: {
    dismiss: "Funga", changeLanguage: "Hindura ururimi", openMenu: "Fungura menu", menu: "Menu",
    footProduct: "Porogaramu", footOwners: "Ba nyir'amaduka", footResources: "Amakuru", footTeam: "Itsinda",
    notFoundTitle: "Urupapuro ntirubonetse", notFoundDesc: "Urupapuro ushaka ntiruriho cyangwa rwimuwe.", goHome: "Subira ahabanza",
    errorTitle: "Uru rupapuro ntirwafunguse", errorDesc: "Habaye ikibazo kuri twe. Ongera ugerageze cyangwa usubire ahabanza.", tryAgain: "Ongera ugerageze", days: "iminsi",
  },
  home: {
    heroAlt: "Nyir'iduka i Kigali afite telefoni ikoresha BeBoss",
    counterAlt: "Telefoni n'imashini icapa inyemezabuguzi kuri kontwari ya farumasi",
    sealed: "Inyemezabuguzi zifite checksum",
  },
  features: [
    { title: "Gucuruza no kwishyuza", items: [
      { t: "Gusoma barcode na kamera", d: "Soma kode z'ibicuruzwa ukoresheje kamera ya telefoni, cyangwa ushakishe ukoresheje izina n'icyiciro." },
      { t: "Uburyo 5 bwo kwishyura", d: "Amafaranga mu ntoki, MTN MoMo, Airtel Money, ikarita, kugabanya hagati y'intoki na MoMo, n'ideni ry'umukiriya." },
      { t: "Hagarika usubukure igitebo", d: "Shyira igitebo ku ruhande mu gihe hari benshi, ukorere undi mukiriya, hanyuma ugisubukure ukanze rimwe." },
      { t: "Checksum y'inyemezabuguzi", d: "Checksum ishobora kwerekana ko amakuru atandukanye, ariko si umukono wa elegitoroniki cyangwa gihamya y'uko inyemezabuguzi ari nyayo." },
      { t: "Icapiro na WhatsApp", d: "Icapiro rya Bluetooth rya 58mm cyangwa irya kontwari rya 80mm rifite ikirango, TVA/TIN na QR — cyangwa ohereza kuri WhatsApp." },
    ] },
    { title: "Ububiko, amafaranga n'isesengura", items: [
      { t: "Inyungu n'igihombo nyabyo", d: "Inyungu y'uyu munsi, icyumweru, ukwezi cyangwa igihe cyose ukurikije igiciro nyacyo cy'ibicuruzwa, n'ijanisha kuri buri gicuruzwa." },
      { t: "Igereranya ry'ububiko rishingiye ku igurisha", d: "Amakuru y'ububiko ashingira ku bicuruzwa n'impinduka wanditse; ibiciro, ingano cyangwa ibarura bitari byo bitanga raporo zitari zo." },
      { t: "Igitabo cy'amadeni", d: "Reba imipaka, amafaranga asigaye n'ubwishyu, wohereze ubutumwa bwibutsa; nticyemeza ko umukiriya azishyura." },
      { t: "Kurangura no gukosora", d: "Ibyo abatanga ibicuruzwa bazanye, ibyangiritse/ibyarengeje igihe n'ikosora ry'ibarura — byose byandikwa n'impamvu." },
    ] },
    { title: "Amatsinda, amashami no guhuza", items: [
      { t: "Uburenganzira bushingiye ku nshingano", d: "Nyir'iduka, umuyobozi n'umucuruzi. Hindura ukoresha ukoresheje PIN y'imibare 4 mu masegonda atageze kuri 2." },
      { t: "Amashami menshi", d: "Reba raporo ya buri shami cyangwa zose hamwe, kandi wandike iyimurwa ry'ibicuruzwa hagati y'amashami." },
      { t: "Telefoni zihujwe", d: "Ongeraho telefoni ukoresheje kode yo kwinjira. Buri telefoni ikora nta interineti kandi ihuza n'iduka." },
      { t: "Guhuza bitabanje interineti", d: "Guhuza telefoni ku yindi binyuze kuri Wi-Fi/hotspot, hamwe n'amakuru afite umukono yoherezwa kuri cloud iyo interineti igarutse." },
      { t: "Uruhushya ruhuzwa na cloud", d: "Nyuma y'uko umuyobozi yemeje ubwishyu, uruhushya rushobora gufunguka telefoni imaze guhuza." },
    ] },
    { title: "Umutekano wizewe", items: [
      { t: "Ububiko bufunze", d: "Amakuru abikwa afunze na AES-256, imfunguzo zirinzwe n'ububiko bw'umutekano bwa telefoni." },
      { t: "Igikumwe no gufunga", d: "Gufungura ukoresheje igikumwe, PIN zirinzwe, gufunga nyuma yo kugerageza kenshi no kwifunga iyo idakoreshwa." },
      { t: "Kurinda guhindura isaha", d: "Gusubiza inyuma itariki ya telefoni ntibyongera igihe cy'igerageza cyangwa uruhushya." },
      { t: "Kode zo gufungura zifite umukono", d: "Kode nshya za BB3 zifite umukono wa ECDSA, zihuzwa n'ubwishyu bwemejwe, gahunda yahisemo, username na telefoni yanditswe." },
      { t: "Indimi 4", d: "Icyongereza, Ikinyarwanda, Igifaransa n'Igiswahili — hindura igihe icyo ari cyo cyose, no nta interineti." },
    ] },
  ],
  sectors: ["Amaduka n'ibiribwa", "Farumasi", "Ibikoresho by'ubwubatsi", "Abarangura benshi", "Ibikoresho by'ikoranabuhanga", "Imyenda n'ubwiza", "Resitora n'utubari", "Salo na serivisi", "Supermarket nto", "Amaduka afite amashami"],
  guide: {
    playbooks: [
      { role: "Nyir'iduka", steps: [
        "Shyiraho porogaramu, hitamo ururimi kandi wuzuze intambwe 3 z'iduka (izina, urwego, ifaranga, PIN ya nyir'iduka).",
        "Injiza urutonde rw'ibicuruzwa uvuye muri CSV cyangwa wongereho ukoresheje kamera. Shyiraho igiciro cyo kurangura n'icyo kugurisha urebe inyungu nyayo.",
        "Fungura konti z'umuyobozi n'umucuruzi buri wese afite PIN ye, umuhe ishami akoreramo.",
        "Buri mugoroba fungura Dashboard: gereranya igurisha n'intego, urebe inyungu n'iteganya ryo kurangura ry'iminsi 14.",
        "Mbere y'uko igerageza rirangira, ishyura na MoMo uciye muri Igenamiterere → Uruhushya kandi wohereze icyemezo.",
      ] },
      { role: "Umuyobozi w'iduka", steps: [
        "Andika ibyo abatanga ibicuruzwa bazanye muri Kurangura kugira ngo ububiko n'ibiciro bibe ukuri.",
        "Andika ibyangiritse cyangwa ibyarengeje igihe nk'ikosora ufite impamvu — ntuzigere usiba igurisha.",
        "Andika iyimurwa hagati y'amashami, ugereranye ingano yoherejwe n'iyakiriwe.",
        "Emeza isubizwa n'ihagarikwa; buri kimwe kirandikwa kandi kigasubiza ububiko neza.",
      ] },
      { role: "Umucuruzi", steps: [
        "Fungura ukoresheje PIN y'imibare 4 cyangwa igikumwe utangiye akazi kandi wandike amafaranga utangiranye.",
        "Soma cyangwa ukande ibicuruzwa, hitamo Intoki, MoMo, Airtel, Kugabanya cyangwa Ideni, porogaramu ibare ayo gusubiza.",
        "Hagarika igitebo iyo umukiriya agiye gato; ukisubukure mu rutonde rw'ibitebo byahagaritswe.",
        "Capa cyangwa wohereze kuri WhatsApp inyemezabuguzi ifunze. Funga telefoni iyo uvuye kuri kontwari.",
      ] },
    ],
    tipsTitle: "Uko wakomeza amakuru kwizerwa",
    tips: [
      "Shyiriraho buri mukiriya umupaka w'ideni mbere yo kumuha ibicuruzwa ku ideni.",
      "Ohereza ubutumwa bwiyubashye bwo kwibutsa kuri WhatsApp buri wa Mbere uvuye ku rupapuro rw'Abakiriya.",
      "Ongera urangure ibicuruzwa bigurwa cyane iyo iminsi bisigaje iri munsi ya 5.",
      "Buri cyumweru bara vuba ibicuruzwa 20 bya mbere kugira ngo umenye ibura hakiri kare.",
      "Gira telefoni imwe ya nyir'iduka, abacuruzi bakoreshe telefoni zihujwe — buri gikorwa gikomeza kumenyekana.",
    ],
    faq: [
      ["BeBoss ikora nta interineti?", "Ushobora kwandika igurisha n'impinduka z'ububiko kuri telefoni nta murandasi. Guhuza na cloud cyangwa amashami bisaba interineti; genzura ihuzwa mbere yo kwishingikiriza ku makuru yo ku bindi bikoresho."],
      ["Igerageza ry'ubuntu rikora rite?", "Buri duka rishya rihabwa iminsi 4 yo gukoresha byose. Nyuma yaho porogaramu irafunga kugeza wishyuye — amakuru yawe akomeza kurindwa kuri telefoni."],
      ["Nishyura nte?", "Koresha USSD ya MTN cyangwa Airtel, hanyuma wohereze amazina y'uwishyuye, telefoni ye, igihe yishyuye, gahunda yahisemo n'icyitonderwa kidateganywa muri porogaramu cyangwa kuri Iduka ryanjye. Umuyobozi agenzura amakuru kuri MTN cyangwa Airtel mbere yo kwemeza ubwishyu."],
      ["Kode ya BB3 ni iki?", "Ni kode ifite umukono wa ECDSA P-256 itangwa nyuma y'uko umuyobozi agenzuye ubwishyu. Ihuzwa n'ubusabe bw'ubwishyu, gahunda, username na telefoni byanditswe. Yinjize muri Igenamiterere → Injiza kode."],
      ["Nshobora gukoresha telefoni nyinshi mu iduka rimwe?", "Yego. Telefoni ya nyir'iduka irimo; buri telefoni yiyongereye yongeraho amafaranga make buri kwezi. Zinjira zikoresheje kode ivuye kuri telefoni ya nyir'iduka."],
      ["Amakuru yanjye agenda ate iyo mpinduye telefoni?", "Koresha kubika no kugarura amakuru afunze muri Igenamiterere, cyangwa wongere uhuze uvuye ku yindi telefoni y'ishami, nta kintu kibura."],
      ["Ni ayahe macapiro akoreshwa?", "Amacapiro asanzwe ya ESC/POS: aya Bluetooth ya 58mm n'aya kontwari ya 80mm."],
      ["Amakuru yanjye ni ibanga?", "Amakuru y'ubucuruzi aguma kuri telefoni zawe. Gusa uko uruhushya ruhagaze, urutonde rwa telefoni n'abakozi n'amakuru y'amashami afite umukono ni byo byoherezwa kuri cloud ya BeBoss, kandi buri duka ribona ibyaryo gusa."],
    ],
  },
  pricing: {
    tiers: [
      { name: "Iduka rimwe", note: "Ishami 1 • telefoni ya nyir'iduka irimo" },
      { name: "Amashami abiri", note: "Amashami 2 • raporo ihuriweho" },
      { name: "Amashami 3+", note: "Iyimurwa no guhuza; banza ugerageze kugereranya ububiko mu igerageza" },
    ],
    staffLine: "Abakozi: 2–3 = +2,000 • 4–5 = +4,000 • 6+ = +1,000 kuri buri umwe",
    devicesLine: "Telefoni ziyongereye: +{rate} FRw kuri buri imwe / ukwezi",
    discountsLine: "Amezi 3 −10% • Amezi 12 −20% • iminsi 4 y'ubuntu",
    exactPrice: "Igiciro cyawe nyacyo",
    howPaying: "Uko kwishyura bikorwa",
    steps: [
      { t: "Kanda kode", d: "Koresha kode ya MTN *182# cyangwa Airtel *500# iri hejuru — amafaranga yamaze kwandikwamo." },
      { t: "Ohereza icyemezo", d: "Muri porogaramu (Igenamiterere → Uruhushya) cyangwa kuri Iduka ryanjye, ohereza amazina na telefoni by'uwishyuye, igihe yishyuye, gahunda yahisemo n'icyitonderwa niba gihari. Nta nimero y'igikorwa isabwa." },
      { t: "Umuyobozi aragenzura", d: "Umuyobozi agereranya amazina, telefoni, igihe na gahunda n'inyandiko za MTN cyangwa Airtel. Guhamagara USSD byonyine ntibyemeza ko ubwishyu bwageze." },
      { t: "Fungura", d: "Nyuma yo kwemezwa, iduka rifunguka kuri sync ikurikira cyangwa umuyobozi akaguha kode ya BB3 yihariye ihujwe n'ubwo busabe bw'ubwishyu. WhatsApp ni iyo kohereza icyemezo cyangwa kwakira kode, si uburyo bwikora bwo kugenzura ubwishyu." },
    ],
  },
  how: { codeLegend: "ifatabuguzi · iminsi · kugeza · kode ya konti · umukono" },
  download: { printPoster: "Capa ifishi ya QR" },
  offline: { counterPhone: "Telefoni ya kontwari", cloud: "Cloud ya BeBoss", toggle: "Fungura cyangwa ufunge interineti" },
  demo: { products: { milk: "Amata ya Inyange 1L", sugar: "Isukari ya Kabuye 1kg", rice: "Umuceri wa Mukamira 5kg", bread: "Umugati", oil: "Amavuta yo guteka 1L", soap: "Isabune", eggs: "Amagi (30)", soda: "Fanta 500ml" }, offline: "nta interineti", addOne: "Ongeraho kimwe", removeOne: "Kuramo kimwe" },
  mockup: {
    mainStore: "Iduka rikuru", shopPos: "Mama Shop • POS", todaysSales: "Igurisha ry'uyu munsi", profitLine: "Inyungu 41,250 • inyemezabuguzi 37",
    total: "Igiteranyo", cash: "Intoki", credit: "Ideni", completeSale: "Soza igurisha", devices: "Telefoni 3",
    syncedWifi: "zihujwe kuri Wi-Fi", sealedReceipt: "inyemezabuguzi ifunze", syncing: "Birahuzwa…", offline: "Nta interineti",
  },
  contact: {
    email: "Imeyili", paidAlready: "Wamaze kwishyura? Inzira yihuta yo gufungurirwa ni", proofForm: "ifishi y'icyemezo cy'ubwishyu",
    addContact: "Shyiramo nimero ya telefoni cyangwa imeyili kugira ngo tugusubize.", sendFailed: "Ntitwashoboye kohereza ubutumwa bwawe. Ongera ugerageze.",
    checkForm: "Reba neza izina ryawe n'ubutumwa.", waGreeting: "Muraho itsinda rya BeBoss!",
    topics: { GENERAL: "Rusange", SALES: "Kugura", SUPPORT: "Ubufasha", PAYMENT: "Ubwishyu", PARTNERSHIP: "Ubufatanye" },
  },
  myShop: {
    lookupFailed: "Gushakisha byanze. Reba izina ukoresha na telefoni, wongere ugerageze.",
    proofSent: "Icyemezo cy'ubwishyu cyoherejwe. Urafungurirwa nikimara kugenzurwa.",
    sendFailed: "Ntitwashoboye kohereza icyemezo. Reba amakuru wongere ugerageze.",
    payerName: "Amazina y'uwishyuye (nk'uko ari kuri MoMo)", payerPhone: "Telefoni y'uwishyuye",
    amountNote: "BeBoss ibika amakuru y'uwishyuye, igihe yishyuye na gahunda yahisemo. Iduka rifungurwa ari uko umuyobozi agenzuye ubwishyu kuri MTN cyangwa Airtel. Koresha izina ry'iduka na telefoni byanditswe muri porogaramu.",
    ref: "Nimero",
    status: { ACTIVE: "Rirakora", TRIAL: "Igerageza", EXPIRED: "Ryarangiye", SUSPENDED: "Ryahagaritswe", APPROVED: "Byemejwe", PENDING_VERIFICATION: "Bitegereje kugenzurwa", REJECTED: "Byanzwe", REDEEMED: "Yakoreshejwe", ISSUED: "Iteguye gukoreshwa", REVOKED: "Yahagaritswe" },
  },
};

const fr: PageCopy = {
  common: {
    dismiss: "Fermer", changeLanguage: "Changer de langue", openMenu: "Ouvrir le menu", menu: "Menu",
    footProduct: "Produit", footOwners: "Commerçants", footResources: "Ressources", footTeam: "Équipe",
    notFoundTitle: "Page introuvable", notFoundDesc: "La page que vous cherchez n'existe pas ou a été déplacée.", goHome: "Retour à l'accueil",
    errorTitle: "Cette page ne s'est pas chargée", errorDesc: "Un problème est survenu de notre côté. Réessayez ou revenez à l'accueil.", tryAgain: "Réessayer", days: "jours",
  },
  home: {
    heroAlt: "Commerçante à Kigali tenant un téléphone avec BeBoss",
    counterAlt: "Téléphone et imprimante de tickets sur le comptoir d'une pharmacie",
    sealed: "Reçus avec checksum",
  },
  features: [
    { title: "Caisse et encaissement", items: [
      { t: "Scanner de codes-barres", d: "Scannez les articles avec l'appareil photo, ou cherchez par nom et catégorie dans une grille instantanée." },
      { t: "5 moyens de paiement", d: "Espèces, MTN MoMo, Airtel Money, carte, paiement mixte espèces + MoMo avec solde restant en direct, et crédit client." },
      { t: "Paniers en attente", d: "Mettez un panier de côté à l'heure de pointe, servez le client suivant, reprenez-le en un geste." },
      { t: "Checksum du reçu", d: "Un checksum peut signaler des champs différents, mais ce n'est ni une signature numérique ni une preuve d'authenticité." },
      { t: "Ticket et WhatsApp", d: "Imprimantes Bluetooth 58 mm ou comptoir 80 mm avec logo, TVA/NIF et QR — ou reçu envoyé par WhatsApp." },
    ] },
    { title: "Stock, argent et analyses", items: [
      { t: "Vrai compte de résultat", d: "Résultat du jour, de la semaine, du mois ou depuis le début, calculé sur le vrai coût d'achat, avec marge par article." },
      { t: "Estimations de stock basées sur les ventes", d: "Les alertes dépendent du catalogue et des mouvements saisis ; des coûts, unités ou quantités incorrects faussent les rapports." },
      { t: "Registre des crédits clients", d: "Consultez soldes et paiements et envoyez des rappels ; le registre ne garantit pas le remboursement." },
      { t: "Achats et ajustements", d: "Livraisons fournisseurs, pertes (abîmés/périmés) et corrections d'inventaire — tout est tracé avec un motif." },
    ] },
    { title: "Équipes, succursales et synchro", items: [
      { t: "Accès par rôle", d: "Rôles propriétaire, gérant et caissier. Changez d'opérateur avec un code PIN à 4 chiffres en moins de 2 secondes." },
      { t: "Multi-succursales", d: "Tableaux de bord par succursale ou consolidés, et transferts de stock entre succursales." },
      { t: "Appareils associés", d: "Ajoutez des terminaux avec un code d'adhésion. Chaque appareil fonctionne hors ligne et se synchronise avec la boutique." },
      { t: "Synchro hors ligne d'abord", d: "Synchronisation d'appareil à appareil en Wi-Fi/point d'accès, plus des sauvegardes signées dans le cloud au retour d'internet." },
      { t: "Licence synchronisée", d: "Après validation par un administrateur, la licence peut se débloquer à la prochaine synchronisation." },
    ] },
    { title: "Une sécurité fiable", items: [
      { t: "Base de données chiffrée", d: "Stockage chiffré AES-256, clés protégées par le coffre matériel du téléphone." },
      { t: "Biométrie et verrouillage", d: "Déverrouillage par empreinte, PIN protégés, blocage après tentatives répétées et verrouillage automatique." },
      { t: "Protection de l'horloge", d: "Reculer la date du téléphone ne prolonge ni l'essai ni la licence." },
      { t: "Codes de déblocage signés", d: "Chaque nouveau code BB3 ECDSA P-256 est lié à une demande de paiement vérifiée, à son forfait et au compte de la boutique." },
      { t: "4 langues", d: "Anglais, kinyarwanda, français et swahili — changez à tout moment, même hors ligne." },
    ] },
  ],
  sectors: ["Commerce et alimentation", "Pharmacies", "Quincaillerie et BTP", "Dépôts de gros", "Électronique et téléphones", "Mode et cosmétiques", "Restaurants et bars", "Salons et services", "Supérettes", "Chaînes multi-succursales"],
  guide: {
    playbooks: [
      { role: "Propriétaire", steps: [
        "Installez l'application, choisissez votre langue et terminez l'assistant en 3 étapes (nom, secteur, devise, PIN du propriétaire).",
        "Importez vos produits depuis un CSV ou ajoutez-les avec le scanner. Saisissez prix d'achat et de vente pour voir les vraies marges.",
        "Créez les comptes gérant et caissier avec leur propre PIN, et affectez chacun à une succursale.",
        "Chaque soir, ouvrez le tableau de bord : comparez ventes et objectif, vérifiez le bénéfice et le plan de réassort sur 14 jours.",
        "Avant la fin de l'essai, payez par MoMo dans Paramètres → Licence et envoyez votre preuve.",
      ] },
      { role: "Gérant", steps: [
        "Enregistrez les livraisons fournisseurs dans Achats pour garder stock et coûts exacts.",
        "Déclarez les produits abîmés ou périmés en ajustement avec un motif — ne supprimez jamais une vente.",
        "Enregistrez les transferts et rapprochez les quantités envoyées et reçues entre succursales.",
        "Validez remboursements et annulations ; chacun est tracé et remet le stock correctement.",
      ] },
      { role: "Caissier", steps: [
        "Déverrouillez avec votre PIN à 4 chiffres ou votre empreinte en début de service et saisissez le fond de caisse.",
        "Scannez ou touchez les produits, choisissez Espèces, MoMo, Airtel, Mixte ou Crédit, et laissez l'application calculer la monnaie.",
        "Mettez un panier en attente quand un client s'absente ; reprenez-le depuis la liste des paniers en attente.",
        "Imprimez ou envoyez par WhatsApp le reçu scellé. Verrouillez le terminal en quittant le comptoir.",
      ] },
    ],
    tipsTitle: "Contrôles pour garder des données utiles",
    tips: [
      "Fixez un plafond de crédit pour chaque client avant de vendre à crédit.",
      "Envoyez des rappels WhatsApp courtois chaque lundi depuis l'écran Clients.",
      "Réapprovisionnez les meilleures ventes quand il reste moins de 5 jours de stock.",
      "Faites chaque semaine un comptage rapide de vos 20 articles principaux pour repérer la démarque tôt.",
      "Gardez un téléphone propriétaire et ajoutez les caissiers comme appareils associés — chaque action reste traçable.",
    ],
    faq: [
      ["BeBoss fonctionne-t-il sans internet ?", "Les ventes et mouvements de stock peuvent être saisis hors ligne sur le téléphone. Le cloud et la synchronisation des succursales nécessitent une connexion ; vérifiez la synchro avant de vous fier aux données d'autres appareils."],
      ["Comment fonctionne l'essai gratuit ?", "Chaque nouvelle boutique a 4 jours d'accès complet. Ensuite, l'application se verrouille jusqu'au paiement — vos données restent protégées sur le téléphone."],
      ["Comment payer ?", "Utilisez le parcours USSD de l'opérateur, puis envoyez le nom complet et le téléphone du payeur, l'heure du paiement, le forfait choisi et une note facultative dans l'application ou Ma boutique. Un administrateur compare ces informations au relevé MTN ou Airtel avant d'approuver."],
      ["Qu'est-ce qu'un code BB3 ?", "Un code ECDSA P-256 émis après vérification du paiement par un administrateur. Il est lié à la demande de paiement, au forfait choisi et au compte enregistré de la boutique. Saisissez-le dans Paramètres → Saisir un code."],
      ["Puis-je utiliser plusieurs téléphones ?", "Oui. L'appareil du propriétaire est inclus ; chaque appareil supplémentaire ajoute un petit montant mensuel. Les appareils se joignent avec un code du téléphone propriétaire."],
      ["Que deviennent mes données si je change de téléphone ?", "Utilisez la sauvegarde chiffrée dans Paramètres, ou resynchronisez depuis un appareil de succursale : rien n'est perdu."],
      ["Quelles imprimantes sont prises en charge ?", "Les imprimantes thermiques ESC/POS standard : mobiles Bluetooth 58 mm et de comptoir 80 mm."],
      ["Mes données sont-elles privées ?", "Les données commerciales restent sur vos appareils. Seuls l'état de la licence, la liste des appareils et du personnel et des sauvegardes signées des succursales vont dans le cloud BeBoss, et chaque boutique ne voit que ses propres données."],
    ],
  },
  pricing: {
    tiers: [
      { name: "Boutique unique", note: "1 succursale • appareil du propriétaire inclus" },
      { name: "Deux succursales", note: "2 succursales • tableau de bord consolidé" },
      { name: "3+ succursales", note: "Transferts et synchro ; tester le rapprochement de stock avant déploiement" },
    ],
    staffLine: "Personnel : 2–3 = +2 000 • 4–5 = +4 000 • 6+ = +1 000 par personne",
    devicesLine: "Appareils supplémentaires : +{rate} FRw chacun / mois",
    discountsLine: "3 mois −10 % • 12 mois −20 % • essai gratuit de 4 jours",
    exactPrice: "Votre prix exact",
    howPaying: "Comment payer",
    steps: [
      { t: "Composez le code", d: "Utilisez le code MTN *182# ou Airtel *500# ci-dessus — le montant est déjà rempli." },
      { t: "Envoyez la preuve", d: "Dans l'application (Paramètres → Licence) ou sur Ma boutique, indiquez le nom complet et le téléphone du payeur, l'heure du paiement, le forfait choisi et une note facultative. Aucun identifiant de transaction n'est demandé." },
      { t: "Vérification admin", d: "Un administrateur compare les informations du payeur et du forfait au relevé MTN ou Airtel. Composer le code USSD ne confirme pas à lui seul le règlement." },
      { t: "Déblocage", d: "Après validation, la boutique se débloque à la prochaine synchronisation ou l'administrateur émet un code BB3 unique lié à ce paiement. WhatsApp peut transmettre la preuve ou le code, mais ne vérifie pas automatiquement le paiement." },
    ],
  },
  how: { codeLegend: "formule · jours · valable jusqu'au · empreinte du compte · signature" },
  download: { printPoster: "Imprimer l'affiche QR" },
  offline: { counterPhone: "Téléphone de caisse", cloud: "Cloud BeBoss", toggle: "Activer ou couper internet" },
  demo: { products: { milk: "Lait Inyange 1 L", sugar: "Sucre Kabuye 1 kg", rice: "Riz Mukamira 5 kg", bread: "Pain", oil: "Huile de cuisine 1 L", soap: "Savon", eggs: "Plateau d'œufs (30)", soda: "Fanta 50 cl" }, offline: "hors ligne", addOne: "Ajouter un", removeOne: "Retirer un" },
  mockup: {
    mainStore: "Boutique principale", shopPos: "Mama Shop • Caisse", todaysSales: "Ventes du jour", profitLine: "Bénéfice 41 250 • 37 reçus",
    total: "Total", cash: "Espèces", credit: "Crédit", completeSale: "Valider la vente", devices: "3 appareils",
    syncedWifi: "synchronisés en Wi-Fi", sealedReceipt: "reçu scellé", syncing: "Synchro…", offline: "Hors ligne",
  },
  contact: {
    email: "E-mail", paidAlready: "Déjà payé ? Le plus rapide pour être débloqué est le", proofForm: "formulaire de preuve de paiement",
    addContact: "Ajoutez un téléphone ou un e-mail pour que nous puissions répondre.", sendFailed: "Impossible d'envoyer votre message. Veuillez réessayer.",
    checkForm: "Vérifiez votre nom et votre message.", waGreeting: "Bonjour l'équipe BeBoss !",
    topics: { GENERAL: "Général", SALES: "Ventes", SUPPORT: "Assistance", PAYMENT: "Paiement", PARTNERSHIP: "Partenariat" },
  },
  myShop: {
    lookupFailed: "Recherche impossible. Vérifiez l'identifiant et le téléphone, puis réessayez.",
    proofSent: "Preuve de paiement envoyée. Vous serez débloqué dès sa vérification.",
    sendFailed: "Impossible d'envoyer la preuve. Vérifiez les informations et réessayez.",
    payerName: "Nom complet du payeur (comme sur MoMo)", payerPhone: "Téléphone du payeur",
    amountNote: "BeBoss enregistre les coordonnées du payeur, l'heure du paiement et le forfait choisi. Le compte est activé uniquement après vérification du paiement auprès de l'opérateur mobile par un administrateur. Utilisez le nom et le téléphone enregistrés.",
    ref: "Réf.",
    status: { ACTIVE: "Active", TRIAL: "Essai gratuit", EXPIRED: "Expirée", SUSPENDED: "Suspendue", APPROVED: "Approuvé", PENDING_VERIFICATION: "En attente de vérification", REJECTED: "Refusé", REDEEMED: "Utilisé", ISSUED: "Prêt à l'emploi", REVOKED: "Annulé" },
  },
};

const sw: PageCopy = {
  common: {
    dismiss: "Funga", changeLanguage: "Badilisha lugha", openMenu: "Fungua menyu", menu: "Menyu",
    footProduct: "Bidhaa", footOwners: "Wamiliki", footResources: "Rasilimali", footTeam: "Timu",
    notFoundTitle: "Ukurasa haupatikani", notFoundDesc: "Ukurasa unaoutafuta haupo au umehamishwa.", goHome: "Rudi mwanzo",
    errorTitle: "Ukurasa huu haukufunguka", errorDesc: "Hitilafu imetokea upande wetu. Jaribu tena au rudi mwanzo.", tryAgain: "Jaribu tena", days: "siku",
  },
  home: {
    heroAlt: "Mfanyabiashara mjini Kigali akiwa na simu inayotumia BeBoss",
    counterAlt: "Simu na printa ya risiti kwenye kaunta ya duka la dawa",
    sealed: "Risiti zenye checksum",
  },
  features: [
    { title: "Mauzo na malipo", items: [
      { t: "Kisoma barcode kwa kamera", d: "Soma bidhaa kwa kamera ya simu, au tafuta kwa jina na aina kwenye orodha ya haraka." },
      { t: "Njia 5 za malipo", d: "Taslimu, MTN MoMo, Airtel Money, kadi, malipo mchanganyiko taslimu + MoMo yenye salio la papo hapo, na mkopo wa mteja." },
      { t: "Simamisha na endelea", d: "Weka kikapu kando wakati wa msongamano, hudumia mteja anayefuata, kisha endelea kwa mguso mmoja." },
      { t: "Checksum ya risiti", d: "Checksum inaweza kuonyesha sehemu zisizolingana, lakini si sahihi ya kidijitali wala uthibitisho wa uhalisi wa risiti." },
      { t: "Printa na WhatsApp", d: "Printa za Bluetooth 58mm au za kaunta 80mm zenye nembo, VAT/TIN na QR — au tuma risiti kwa WhatsApp." },
    ] },
    { title: "Hisa, pesa na uchambuzi", items: [
      { t: "Faida na hasara halisi", d: "Faida ya leo, wiki, mwezi au tangu mwanzo kwa gharama halisi ya bidhaa, pamoja na asilimia ya faida kwa kila bidhaa." },
      { t: "Makadirio ya stoo kutokana na mauzo", d: "Tahadhari hutegemea katalogi na mabadiliko yaliyorekodiwa; gharama, vipimo au kiasi kisicho sahihi huharibu ripoti." },
      { t: "Daftari la mikopo", d: "Angalia salio na malipo na utume vikumbusho; daftari haliwezi kuhakikisha ulipaji." },
      { t: "Manunuzi na marekebisho", d: "Bidhaa kutoka kwa wasambazaji, hasara za zilizoharibika/kuisha muda na marekebisho ya hesabu — zote zinarekodiwa na sababu." },
    ] },
    { title: "Timu, matawi na usawazishaji", items: [
      { t: "Ruhusa kwa nafasi", d: "Mmiliki, meneja na keshia. Badilisha mtumiaji kwa PIN ya tarakimu 4 chini ya sekunde 2." },
      { t: "Matawi mengi", d: "Ripoti kwa kila tawi au kwa pamoja, na rekodi uhamishaji wa bidhaa kati ya matawi." },
      { t: "Vifaa vilivyounganishwa", d: "Ongeza simu kwa kodi ya kujiunga. Kila kifaa hufanya kazi bila mtandao na kusawazisha na duka." },
      { t: "Usawazishaji bila mtandao kwanza", d: "Kusawazisha kifaa kwa kifaa kupitia Wi-Fi/hotspot, pamoja na nakala zilizotiwa saini kwenye cloud mtandao ukirudi." },
      { t: "Leseni inayosawazishwa", d: "Baada ya msimamizi kuthibitisha malipo, leseni inaweza kufunguka kifaa kikisawazisha." },
    ] },
    { title: "Usalama unaoaminika", items: [
      { t: "Hifadhidata iliyosimbwa", d: "Hifadhi iliyosimbwa kwa AES-256, funguo zikilindwa na hifadhi salama ya simu." },
      { t: "Alama ya kidole na kufunga", d: "Kufungua kwa alama ya kidole, PIN zilizolindwa, kufunga baada ya majaribio mengi na kujifunga isipotumika." },
      { t: "Kinga ya kubadilisha saa", d: "Kurudisha nyuma tarehe ya simu hakuongezi muda wa majaribio wala leseni." },
      { t: "Kodi za kufungua zenye saini", d: "Kila kodi mpya ya BB3 ECDSA P-256 inaunganishwa na dai la malipo lililothibitishwa, mpango wake na akaunti ya duka." },
      { t: "Lugha 4", d: "Kiingereza, Kinyarwanda, Kifaransa na Kiswahili — badilisha wakati wowote, hata bila mtandao." },
    ] },
  ],
  sectors: ["Rejareja na vyakula", "Maduka ya dawa", "Vifaa vya ujenzi", "Maghala ya jumla", "Elektroniki na simu", "Mitindo na vipodozi", "Migahawa na baa", "Saluni na huduma", "Supamaketi ndogo", "Minyororo ya matawi"],
  guide: {
    playbooks: [
      { role: "Mmiliki wa duka", steps: [
        "Sakinisha programu, chagua lugha na kamilisha hatua 3 za duka (jina, sekta, sarafu, PIN ya mmiliki).",
        "Ingiza orodha ya bidhaa kutoka CSV au ongeza kwa kamera. Weka bei ya kununua na kuuza uone faida halisi.",
        "Fungua akaunti za meneja na keshia kila mmoja na PIN yake, na mpe kila mmoja tawi.",
        "Kila jioni fungua Dashibodi: linganisha mauzo na lengo, angalia faida na mpango wa kuagiza wa siku 14.",
        "Kabla majaribio hayajaisha, lipa kwa MoMo kupitia Mipangilio → Leseni na utume uthibitisho.",
      ] },
      { role: "Meneja wa duka", steps: [
        "Rekodi bidhaa kutoka kwa wasambazaji kwenye Manunuzi ili hisa na gharama ziwe sahihi.",
        "Rekodi bidhaa zilizoharibika au kuisha muda kama marekebisho yenye sababu — usifute mauzo kamwe.",
        "Rekodi uhamishaji wa stoo na linganisha kiasi kilichotumwa na kilichopokelewa.",
        "Idhinisha marejesho na ughairi; kila moja hurekodiwa na kurudisha hisa ipasavyo.",
      ] },
      { role: "Keshia", steps: [
        "Fungua kwa PIN ya tarakimu 4 au alama ya kidole mwanzoni mwa zamu na weka pesa za kuanzia.",
        "Soma au gusa bidhaa, chagua Taslimu, MoMo, Airtel, Mchanganyiko au Mkopo, programu ihesabu chenji.",
        "Simamisha kikapu mteja akiondoka kidogo; kiendeleze kutoka orodha ya vikapu vilivyosimamishwa.",
        "Chapisha au tuma kwa WhatsApp risiti yenye muhuri. Funga simu unapoondoka kaunta.",
      ] },
    ],
    tipsTitle: "Ukaguzi wa kuweka rekodi sahihi",
    tips: [
      "Weka kikomo cha mkopo kwa kila mteja kabla ya kumpa bidhaa kwa mkopo.",
      "Tuma vikumbusho vya heshima kwa WhatsApp kila Jumatatu kutoka skrini ya Wateja.",
      "Agiza tena bidhaa zinazouzwa sana siku za hisa zikishuka chini ya 5.",
      "Kila wiki hesabu haraka bidhaa zako 20 kuu ili kugundua upotevu mapema.",
      "Weka simu moja ya mmiliki na ongeza makeshia kama vifaa vilivyounganishwa — kila kitendo kinafuatiliwa.",
    ],
    faq: [
      ["BeBoss inafanya kazi bila mtandao?", "Mauzo na mabadiliko ya stoo yanaweza kurekodiwa kwenye simu bila mtandao. Cloud na usawazishaji wa matawi vinahitaji muunganisho; hakikisha data imesawazishwa kabla ya kutegemea vifaa vingine."],
      ["Majaribio ya bure yanafanyaje kazi?", "Kila duka jipya hupata siku 4 za matumizi kamili. Baada ya hapo programu hufungwa hadi ulipe — data yako inabaki salama kwenye simu."],
      ["Nalipaje?", "Tumia USSD ya mtoa huduma kisha tuma jina kamili na simu ya mlipaji, muda wa malipo, mpango uliochaguliwa na dokezo la hiari kwenye programu au ukurasa wa Duka langu. Msimamizi hulinganisha taarifa hizo na rekodi za MTN au Airtel kabla ya kuidhinisha."],
      ["Kodi ya BB3 ni nini?", "Ni kodi ya ECDSA P-256 inayotolewa baada ya msimamizi kuthibitisha malipo. Imeunganishwa na dai la malipo, mpango uliochaguliwa na akaunti ya duka. Iweke kwenye Mipangilio → Weka kodi."],
      ["Naweza kutumia simu kadhaa dukani?", "Ndiyo. Simu ya mmiliki imejumuishwa; kila kifaa cha ziada huongeza ada ndogo ya kila mwezi. Vifaa hujiunga kwa kodi kutoka simu ya mmiliki."],
      ["Data yangu inakuwaje nikibadilisha simu?", "Tumia nakala iliyosimbwa na urejeshaji kwenye Mipangilio, au sawazisha upya kutoka kifaa cha tawi, hakuna kinachopotea."],
      ["Printa zipi zinatumika?", "Printa za kawaida za ESC/POS: za Bluetooth 58mm na za kaunta 80mm."],
      ["Data yangu ni ya siri?", "Data ya biashara inabaki kwenye vifaa vyako. Ni hali ya leseni, orodha ya vifaa na wafanyakazi na nakala zenye saini za matawi pekee zinazotumwa kwenye cloud ya BeBoss, na kila duka linaona data yake tu."],
    ],
  },
  pricing: {
    tiers: [
      { name: "Duka moja", note: "Tawi 1 • simu ya mmiliki imejumuishwa" },
      { name: "Matawi mawili", note: "Matawi 2 • dashibodi ya pamoja" },
      { name: "Matawi 3+", note: "Uhamishaji na usawazishaji; jaribu kulinganisha stoo kabla ya kutegemea" },
    ],
    staffLine: "Wafanyakazi: 2–3 = +2,000 • 4–5 = +4,000 • 6+ = +1,000 kila mmoja",
    devicesLine: "Vifaa vya ziada: +{rate} FRw kila kimoja / mwezi",
    discountsLine: "Miezi 3 −10% • Miezi 12 −20% • siku 4 za bure",
    exactPrice: "Bei yako kamili",
    howPaying: "Jinsi ya kulipa",
    steps: [
      { t: "Piga kodi", d: "Tumia kodi ya MTN *182# au Airtel *500# hapo juu — kiasi kimeshajazwa." },
      { t: "Tuma uthibitisho", d: "Kwenye programu (Mipangilio → Leseni) au Duka langu, tuma jina kamili na simu ya mlipaji, muda wa malipo, mpango uliochaguliwa na dokezo la hiari. Hakuna kitambulisho cha muamala kinachohitajika." },
      { t: "Ukaguzi wa msimamizi", d: "Msimamizi hulinganisha jina, simu, muda na mpango na taarifa za malipo za MTN au Airtel. Kupiga USSD pekee si uthibitisho wa malipo." },
      { t: "Kufungua", d: "Baada ya kuidhinishwa, duka hufunguka kwenye usawazishaji unaofuata au msimamizi hutoa kodi ya BB3 ya kipekee iliyounganishwa na dai hilo la malipo. WhatsApp inaweza kutuma uthibitisho au kodi, lakini haithibitishi malipo kiotomatiki." },
    ],
  },
  how: { codeLegend: "mpango · siku · hadi tarehe · alama ya akaunti · saini" },
  download: { printPoster: "Chapisha bango la QR" },
  offline: { counterPhone: "Simu ya kaunta", cloud: "Cloud ya BeBoss", toggle: "Washa au zima mtandao" },
  demo: { products: { milk: "Maziwa ya Inyange 1L", sugar: "Sukari ya Kabuye 1kg", rice: "Mchele wa Mukamira 5kg", bread: "Mkate", oil: "Mafuta ya kupikia 1L", soap: "Sabuni", eggs: "Trei ya mayai (30)", soda: "Fanta 500ml" }, offline: "bila mtandao", addOne: "Ongeza kimoja", removeOne: "Ondoa kimoja" },
  mockup: {
    mainStore: "Duka kuu", shopPos: "Mama Shop • POS", todaysSales: "Mauzo ya leo", profitLine: "Faida 41,250 • risiti 37",
    total: "Jumla", cash: "Taslimu", credit: "Mkopo", completeSale: "Kamilisha mauzo", devices: "Vifaa 3",
    syncedWifi: "vimesawazishwa kwa Wi-Fi", sealedReceipt: "risiti yenye muhuri", syncing: "Inasawazisha…", offline: "Bila mtandao",
  },
  contact: {
    email: "Barua pepe", paidAlready: "Umeshalipa? Njia ya haraka zaidi ya kufunguliwa ni", proofForm: "fomu ya uthibitisho wa malipo",
    addContact: "Weka namba ya simu au barua pepe ili tukujibu.", sendFailed: "Imeshindikana kutuma ujumbe wako. Tafadhali jaribu tena.",
    checkForm: "Tafadhali angalia jina lako na ujumbe.", waGreeting: "Habari timu ya BeBoss!",
    topics: { GENERAL: "Jumla", SALES: "Mauzo", SUPPORT: "Msaada", PAYMENT: "Malipo", PARTNERSHIP: "Ushirikiano" },
  },
  myShop: {
    lookupFailed: "Utafutaji umeshindikana. Angalia jina la mtumiaji na simu, kisha jaribu tena.",
    proofSent: "Uthibitisho wa malipo umetumwa. Utafunguliwa mara utakapothibitishwa.",
    sendFailed: "Imeshindikana kutuma uthibitisho. Angalia taarifa na ujaribu tena.",
    payerName: "Jina kamili la mlipaji (kama kwenye MoMo)", payerPhone: "Simu ya mlipaji",
    amountNote: "BeBoss huhifadhi jina na simu ya mlipaji, muda wa malipo na mpango uliochaguliwa. Akaunti hufunguliwa baada ya msimamizi kuthibitisha malipo moja kwa moja kwa mtoa huduma wa simu. Tumia jina na simu iliyosajiliwa.",
    ref: "Namba",
    status: { ACTIVE: "Hai", TRIAL: "Majaribio ya bure", EXPIRED: "Imeisha", SUSPENDED: "Imesimamishwa", APPROVED: "Imeidhinishwa", PENDING_VERIFICATION: "Inasubiri uthibitisho", REJECTED: "Imekataliwa", REDEEMED: "Imetumika", ISSUED: "Tayari kutumika", REVOKED: "Imeghairiwa" },
  },
};

export const PAGES: Record<Lang, PageCopy> = { en, rw, fr, sw };
