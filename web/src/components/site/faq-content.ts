import type { Lang } from "@/lib/i18n-dict";

export type FaqItem = { q: string; a: string; tag: "offline" | "payments" | "branches" | "security" | "setup" };

export const FAQ: Record<Lang, FaqItem[]> = {
  en: [
    { tag: "offline", q: "Does BeBoss really work without internet?", a: "Yes. Every sale, stock change, customer debt and receipt is saved on the phone first. You can sell all day offline; when the connection returns, the phone syncs to the cloud and your other branches automatically." },
    { tag: "setup", q: "Which phones can run BeBoss?", a: "Any Android phone or tablet with Android 7.0 or newer. Download the APK from this website or scan the QR code on the Download page." },
    { tag: "payments", q: "How much does it cost?", a: "From 5,000 FRw per month for one branch. Extra branches, staff and devices add to the price, and you save 10% on 3-month and 20% on 12-month plans. The Pricing page calculates your exact amount." },
    { tag: "payments", q: "How do I pay and unlock the app?", a: "Pay by MTN MoMo or Airtel Money, then submit the transaction reference in the app or on the My shop page. The BeBoss team verifies it and sends an unlock code, or unlocks your shop directly." },
    { tag: "setup", q: "Is there a free trial?", a: "Every new shop gets a 4-day free trial with all features. No card or payment is needed to start." },
    { tag: "branches", q: "Can I manage several branches and cashiers?", a: "Yes. Add branches, give each staff member a role (owner, manager or cashier) and their own PIN, pair extra phones, and move stock between branches. The owner sees every branch from one phone." },
    { tag: "security", q: "Is my shop data safe?", a: "Data on the phone is stored in an encrypted database with biometric unlock. Branch data sent to the cloud is signed so tampering can be detected, and each shop can only access its own records." },
    { tag: "offline", q: "What happens if my phone is lost?", a: "If your shop syncs to the cloud, install BeBoss on a new phone, sign in as the owner and pair it — your products, sales and customers come back from the latest sync." },
    { tag: "payments", q: "Can I take MoMo, cash and credit on the same sale?", a: "Yes. Split one receipt across cash, MTN MoMo, Airtel Money and customer credit. BeBoss calculates change and records the debt automatically." },
    { tag: "setup", q: "Which languages does BeBoss speak?", a: "English, Kinyarwanda, French and Swahili — switch at any time in the app and on this website." },
  ],
  rw: [
    { tag: "offline", q: "Ese BeBoss ikora koko nta interineti?", a: "Yego. Buri gucuruza, impinduka mu bubiko, amadeni n'inyemezabuguzi bibikwa kuri telefoni mbere. Ushobora gucuruza umunsi wose nta interineti; iyo igarutse, telefoni ihuza n'ikoranabuhanga rya cloud n'andi mashami yawe mu buryo bwikora." },
    { tag: "setup", q: "Ni izihe telefoni zikoresha BeBoss?", a: "Telefoni cyangwa tablet iyo ari yo yose ya Android 7.0 kuzamura. Kuramo APK kuri uru rubuga cyangwa usuzume QR kode ku rupapuro rwo Gukuramo." },
    { tag: "payments", q: "Bigura angahe?", a: "Guhera ku 5,000 FRw ku kwezi ku ishami rimwe. Amashami, abakozi n'ibikoresho byiyongereye byongera igiciro, kandi ugabanyirizwa 10% ku mezi 3 na 20% ku mezi 12. Urupapuro rw'Ibiciro rubara amafaranga yawe nyayo." },
    { tag: "payments", q: "Nishyura nte kugira ngo mfungure porogaramu?", a: "Ishyura ukoresheje MTN MoMo cyangwa Airtel Money, hanyuma wohereze nimero y'igikorwa muri porogaramu cyangwa ku rupapuro 'Iduka ryanjye'. Itsinda rya BeBoss rirabigenzura rikakoherereza kode yo gufungura, cyangwa rigafungura iduka ryawe ako kanya." },
    { tag: "setup", q: "Hari igihe cy'igerageza ku buntu?", a: "Buri duka rishya rihabwa iminsi 4 y'igerageza ku buntu n'ibikorwa byose. Nta karita cyangwa kwishyura bikenewe ngo utangire." },
    { tag: "branches", q: "Nshobora kuyobora amashami menshi n'abacungamutungo?", a: "Yego. Ongeraho amashami, uhe buri mukozi uruhare (nyir'iduka, umuyobozi cyangwa umucuruzi) na PIN ye, uhuze izindi telefoni kandi wimure ibicuruzwa hagati y'amashami. Nyir'iduka abona amashami yose kuri telefoni imwe." },
    { tag: "security", q: "Amakuru y'iduka ryanjye arinzwe?", a: "Amakuru ari kuri telefoni abikwa mu bubiko burinzwe n'urufunguzo rw'igikumwe. Amakuru y'amashami yoherezwa kuri cloud arasinywe ku buryo kuyahindura bigaragara, kandi buri duka ribona amakuru yaryo gusa." },
    { tag: "offline", q: "Bigenda bite iyo telefoni yanjye yibwe cyangwa yatakaye?", a: "Niba iduka ryawe rihuza na cloud, shyira BeBoss kuri telefoni nshya, winjire nka nyir'iduka uyihuze — ibicuruzwa, ibyacurujwe n'abakiriya bigaruka bivuye ku ihuza rya nyuma." },
    { tag: "payments", q: "Nshobora kwakira MoMo, amafaranga n'ideni ku gucuruza kumwe?", a: "Yego. Gabanya inyemezabuguzi imwe hagati y'amafaranga, MTN MoMo, Airtel Money n'ideni ry'umukiriya. BeBoss ibara amafaranga yo gusubiza kandi yandika ideni ubwayo." },
    { tag: "setup", q: "BeBoss ivuga izihe ndimi?", a: "Icyongereza, Ikinyarwanda, Igifaransa n'Igiswahili — hindura igihe icyo ari cyo cyose muri porogaramu no kuri uru rubuga." },
  ],
  fr: [
    { tag: "offline", q: "BeBoss fonctionne-t-il vraiment sans Internet ?", a: "Oui. Chaque vente, mouvement de stock, dette client et reçu est d'abord enregistré sur le téléphone. Vendez toute la journée hors ligne ; au retour de la connexion, le téléphone se synchronise avec le cloud et vos autres succursales automatiquement." },
    { tag: "setup", q: "Quels téléphones peuvent utiliser BeBoss ?", a: "Tout téléphone ou tablette Android 7.0 ou plus récent. Téléchargez l'APK sur ce site ou scannez le QR code de la page Télécharger." },
    { tag: "payments", q: "Combien ça coûte ?", a: "À partir de 5 000 FRw par mois pour une succursale. Succursales, employés et appareils supplémentaires s'ajoutent au prix, avec 10 % de remise sur 3 mois et 20 % sur 12 mois. La page Tarifs calcule votre montant exact." },
    { tag: "payments", q: "Comment payer et débloquer l'application ?", a: "Payez par MTN MoMo ou Airtel Money, puis envoyez la référence de transaction dans l'application ou sur la page Ma boutique. L'équipe BeBoss la vérifie et vous envoie un code de déblocage, ou débloque votre boutique directement." },
    { tag: "setup", q: "Y a-t-il un essai gratuit ?", a: "Chaque nouvelle boutique bénéficie de 4 jours d'essai gratuit avec toutes les fonctionnalités. Aucune carte ni paiement n'est requis pour commencer." },
    { tag: "branches", q: "Puis-je gérer plusieurs succursales et caissiers ?", a: "Oui. Ajoutez des succursales, attribuez à chaque employé un rôle (propriétaire, gérant ou caissier) et son propre PIN, associez d'autres téléphones et transférez du stock entre succursales. Le propriétaire voit tout depuis un seul téléphone." },
    { tag: "security", q: "Mes données sont-elles en sécurité ?", a: "Les données du téléphone sont stockées dans une base chiffrée avec déverrouillage biométrique. Les données envoyées au cloud sont signées pour détecter toute falsification, et chaque boutique n'accède qu'à ses propres données." },
    { tag: "offline", q: "Et si je perds mon téléphone ?", a: "Si votre boutique se synchronise avec le cloud, installez BeBoss sur un nouveau téléphone, connectez-vous en tant que propriétaire et associez-le — produits, ventes et clients reviennent depuis la dernière synchro." },
    { tag: "payments", q: "Puis-je encaisser MoMo, espèces et crédit sur une même vente ?", a: "Oui. Répartissez un reçu entre espèces, MTN MoMo, Airtel Money et crédit client. BeBoss calcule la monnaie et enregistre la dette automatiquement." },
    { tag: "setup", q: "Quelles langues parle BeBoss ?", a: "Anglais, kinyarwanda, français et swahili — changez à tout moment dans l'application et sur ce site." },
  ],
  sw: [
    { tag: "offline", q: "Je, BeBoss inafanya kazi kweli bila mtandao?", a: "Ndiyo. Kila mauzo, mabadiliko ya stoo, deni la mteja na risiti huhifadhiwa kwenye simu kwanza. Unaweza kuuza siku nzima bila mtandao; mtandao ukirudi, simu husawazisha na wingu na matawi yako mengine yenyewe." },
    { tag: "setup", q: "Ni simu zipi zinaweza kutumia BeBoss?", a: "Simu au tablet yoyote ya Android 7.0 au mpya zaidi. Pakua APK kwenye tovuti hii au changanua msimbo wa QR kwenye ukurasa wa Kupakua." },
    { tag: "payments", q: "Inagharimu kiasi gani?", a: "Kuanzia FRw 5,000 kwa mwezi kwa tawi moja. Matawi, wafanyakazi na vifaa vya ziada huongeza bei, na unaokoa 10% kwa miezi 3 na 20% kwa miezi 12. Ukurasa wa Bei hukokotoa kiasi chako halisi." },
    { tag: "payments", q: "Ninalipaje na kufungua programu?", a: "Lipa kwa MTN MoMo au Airtel Money, kisha tuma nambari ya muamala kwenye programu au ukurasa wa Duka langu. Timu ya BeBoss huihakiki na kukutumia msimbo wa kufungua, au hufungua duka lako moja kwa moja." },
    { tag: "setup", q: "Kuna kipindi cha majaribio bure?", a: "Kila duka jipya hupata siku 4 za majaribio bure na vipengele vyote. Hakuna kadi wala malipo yanayohitajika kuanza." },
    { tag: "branches", q: "Ninaweza kusimamia matawi na wahasibu wengi?", a: "Ndiyo. Ongeza matawi, mpe kila mfanyakazi jukumu (mmiliki, meneja au keshia) na PIN yake, unganisha simu zaidi na hamisha stoo kati ya matawi. Mmiliki huona kila tawi kutoka simu moja." },
    { tag: "security", q: "Je, data ya duka langu iko salama?", a: "Data kwenye simu huhifadhiwa kwenye hifadhidata iliyosimbwa na kufunguliwa kwa alama ya kidole. Data ya matawi inayotumwa wingu husainiwa ili kubaini uchezewaji, na kila duka huona data yake tu." },
    { tag: "offline", q: "Nini hutokea simu yangu ikipotea?", a: "Ikiwa duka lako husawazisha na wingu, sakinisha BeBoss kwenye simu mpya, ingia kama mmiliki na uiunganishe — bidhaa, mauzo na wateja hurudi kutoka usawazishaji wa mwisho." },
    { tag: "payments", q: "Ninaweza kupokea MoMo, pesa taslimu na mkopo kwenye mauzo moja?", a: "Ndiyo. Gawa risiti moja kati ya pesa taslimu, MTN MoMo, Airtel Money na mkopo wa mteja. BeBoss hukokotoa chenji na kurekodi deni yenyewe." },
    { tag: "setup", q: "BeBoss inazungumza lugha gani?", a: "Kiingereza, Kinyarwanda, Kifaransa na Kiswahili — badilisha wakati wowote kwenye programu na tovuti hii." },
  ],
};
