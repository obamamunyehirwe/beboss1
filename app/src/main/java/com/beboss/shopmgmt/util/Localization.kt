package com.beboss.shopmgmt.util

import com.beboss.shopmgmt.data.model.AnalyticsPeriod
import com.beboss.shopmgmt.data.model.UserRole
import java.util.Locale

/**
 * Supported offline-first local application languages.
 * All translations are bundled 100% locally with zero internet dependency.
 */
enum class AppLanguage(val code: String, val displayName: String, val flag: String) {
    ENGLISH("en", "English", "EN"),
    KINYARWANDA("rw", "Ikinyarwanda", "RW"),
    FRENCH("fr", "Français", "FR"),
    SWAHILI("sw", "Kiswahili", "SW");

    fun next(): AppLanguage {
        val values = entries
        return values[(ordinal + 1) % values.size]
    }

    companion object {
        fun fromCode(code: String?): AppLanguage {
            return entries.firstOrNull { it.code.equals(code?.trim(), ignoreCase = true) } ?: ENGLISH
        }
    }
}

internal fun locEntry(en: String, rw: String, fr: String, sw: String): Map<AppLanguage, String> = mapOf(
    AppLanguage.ENGLISH to en,
    AppLanguage.KINYARWANDA to rw,
    AppLanguage.FRENCH to fr,
    AppLanguage.SWAHILI to sw
)

object Localization {

    private val baseTranslations: Map<String, Map<AppLanguage, String>> = mapOf(
        // =====================================================================
        // APP / NAVIGATION / COMMON
        // =====================================================================
        "app_title" to locEntry("BeBoss", "BeBoss", "BeBoss", "BeBoss"),
        "dashboard" to locEntry("Dashboard", "Ahabanza", "Tableau de bord", "Dashibodi"),
        "sales_pos" to locEntry("POS Sale", "Gucuruza", "Caisse POS", "Mauzo POS"),
        "inventory" to locEntry("Stock Sheet", "Ububiko", "Stock & Achats", "Stooni"),
        "analytics" to locEntry("Reports & P/L", "Raporo & Inyungu", "Rapports & P/L", "Ripoti & Faida"),
        "customers" to locEntry("Customers & Debts", "Abakiriya & Amadeni", "Clients & Dettes", "Wateja & Madeni"),
        "sales_history" to locEntry("Sales Ledger", "Ibyagurishijwe", "Journal Ventes", "Historia ya Mauzo"),
        "settings" to locEntry("Settings", "Igenamiterere", "Paramètres", "Mipangilio"),
        "lock_terminal" to locEntry("Lock Terminal", "Funga Urubuga", "Verrouiller", "Funga Kituo"),
        "unlock" to locEntry("Unlock", "Fungura", "Déverrouiller", "Fungua"),
        "switch_user" to locEntry("Switch Operator", "Hindura Umukozi", "Changer d'opérateur", "Badili Mhudumu"),
        "theme" to locEntry("Theme", "Insanganyamatsiko", "Thème", "Mandhari"),
        "app_theme" to locEntry("Appearance & Theme", "Imigaragarire & Insanganyamatsiko", "Apparence & Thème", "Mwonekano na Mandhari"),
        "display_and_language" to locEntry("Language & Display", "Ururimi n'Imigaragarire", "Langue & Affichage", "Lugha na Mwonekano"),
        "language" to locEntry("Language", "Ururimi", "Langue", "Lugha"),
        "select_language_subtitle" to locEntry(
            "100% local offline translations across all screens",
            "Ubuhinduzi bwuzuye bukora offline kuri paji zose",
            "Traductions locales 100% hors ligne sur tous les écrans",
            "Tafsiri kamili za ndani bila mtandao kwenye kurasa zote"
        ),
        "dark_mode" to locEntry("Dark Mode", "Uburyo bw'Umwijima", "Mode Sombre", "Hali ya Giza"),
        "light_mode" to locEntry("Light Mode", "Uburyo bw'Umucyo", "Mode Clair", "Hali ya Mwanga"),
        "close" to locEntry("Close", "Funga", "Fermer", "Funga"),
        "back" to locEntry("Back", "Subira inyuma", "Retour", "Rudi"),
        "continue_btn" to locEntry("Continue", "Komeza", "Continuer", "Endelea"),
        "retry" to locEntry("Retry", "Ongera ugerageze", "Réessayer", "Jaribu tena"),
        "inspect" to locEntry("Inspect", "Suzuma", "Inspecter", "Kagua"),
        "search" to locEntry("Search", "Shakisha", "Rechercher", "Tafuta"),
        "apply" to locEntry("Apply", "Shyiraho", "Appliquer", "Tumia"),
        "save_changes" to locEntry("Save Changes", "Bika Impinduka", "Enregistrer", "Hifadhi Mabadiliko"),
        "save_shop_profile" to locEntry("Save Shop Profile", "Bika Amakuru y'Ububiko", "Enregistrer le profil boutique", "Hifadhi Wasifu wa Duka"),
        "cancel" to locEntry("Cancel", "Reka", "Annuler", "Ghairi"),
        "delete" to locEntry("Delete", "Siba", "Supprimer", "Futa"),
        "edit" to locEntry("Edit", "Hindura", "Modifier", "Hariri"),
        "logout" to locEntry("Log Out Account", "Sohoka muri Konti", "Déconnexion", "Ondoka Kwenye Akaunti"),
        "logout_confirm_msg" to locEntry(
            "Sign out from this terminal? Your encrypted local database remains safely stored.",
            "Ushaka gusohoka kuri iyi telefoni? Amakuru yawe yose arinzwe aguma abitswe neza.",
            "Se déconnecter de ce terminal ? Votre base chiffrée reste en sécurité.",
            "Je, unataka kuondoka kwenye akaunti? Hifadhidata yako iliyosimbwa inabaki salama."
        ),
        "all" to locEntry("All", "Byose", "Tout", "Zote"),
        "status_live" to locEntry("LIVE", "IRAKORA", "EN LIGNE", "MTANDAONI"),
        "status_offline" to locEntry("OFFLINE", "OFFLINE", "HORS LIGNE", "NJE YA MTANDAO"),

        // =====================================================================
        // LOGIN & LOCK SCREEN (100% LOCALIZED)
        // =====================================================================
        "auth_lock_title" to locEntry("Terminal Locked", "Urubuga Rufunze", "Terminal Verrouillé", "Kituo Kimefungwa"),
        "offline_branch_pos_badge" to locEntry(
            "OFFLINE-FIRST BRANCH POS",
            "POS Y'AMASHAMI IKORA OFFLINE",
            "POS MULTI-AGENCES HORS LIGNE",
            "POS YA MATAWI BILA MTANDAO"
        ),
        "operator_terminal_header" to locEntry(
            "SELECT OPERATOR TERMINAL",
            "HITAMO UMUKOZI WO KWINJIRA",
            "SÉLECTIONNER UN OPÉRATEUR",
            "CHAGUA MHUDUMU WA KITUO"
        ),
        "fast_pin_tab" to locEntry("Fast 4-Digit PIN", "PIN (Imibare 4)", "PIN Rapide (4 chiffres)", "PIN ya Haraka (4)"),
        "credentials_tab" to locEntry("Username & Password", "Izina & Ijambobanga", "Identifiant & Mot de passe", "Jina & Nenosiri"),
        "fingerprint_unlock" to locEntry("Touch Fingerprint Sensor", "Koresha Igikumwe", "Déverrouiller par empreinte", "Tumia Alama ya Kidole"),
        "biometric_prompt_title" to locEntry("Fingerprint Verification", "Kugenzura Igikumwe", "Vérification biométrique", "Uthibitishaji wa Kidole"),
        "biometric_prompt_subtitle" to locEntry(
            "Verify fingerprint to unlock BeBoss",
            "Koresha igikumwe gufungura BeBoss",
            "Vérifiez votre empreinte pour ouvrir BeBoss",
            "Thibitisha alama ya kidole kufungua BeBoss"
        ),
        "biometric_use_pin" to locEntry("Use PIN Instead", "Koresha PIN", "Utiliser le PIN", "Tumia PIN Badala Yake"),
        "biometric_unavailable" to locEntry(
            "Hardware biometric authentication is unavailable on this device. Use PIN or password.",
            "Igikoresho ntigifite uburyo bw'igikumwe bwizewe. Koresha PIN cyangwa ijambobanga.",
            "L'authentification biométrique matérielle n'est pas disponible. Utilisez votre PIN ou mot de passe.",
            "Uthibitishaji wa alama ya kidole haupatikani kwenye kifaa hiki. Tumia PIN au nenosiri."
        ),
        "biometric_required_err" to locEntry(
            "Hardware biometric verification and an active account are required.",
            "Igikumwe cyemejwe n'igikoresho kirakenewe kuri konti iriho.",
            "Vérification biométrique matérielle et compte actif requis.",
            "Uthibitishaji wa kidole na akaunti hai vinahitajika."
        ),
        "enter_pin" to locEntry("Enter 4-Digit Security PIN", "Injiza Umubare w'Ibanga (PIN)", "Entrez votre PIN à 4 chiffres", "Weka PIN ya Tarakimu 4"),
        "enter_credentials" to locEntry("Sign In with Credentials", "Injira Ukoresheje Umwirondoro", "Connexion par identifiants", "Ingia kwa Kitambulisho"),
        "username_or_phone" to locEntry("Username or Phone", "Izina cyangwa Terefone", "Nom d'utilisateur ou téléphone", "Jina la mtumiaji au Simu"),
        "password" to locEntry("Password", "Ijambobanga", "Mot de passe", "Nenosiri"),
        "toggle_password" to locEntry("Show / hide password", "Garagaza / hisha ijambobanga", "Afficher / masquer le mot de passe", "Onyesha / ficha nenosiri"),
        "create_store_account" to locEntry("Setup Shop & Owner Account", "Gushinga Ububiko & Konti", "Créer une boutique & compte", "Sajili Duka & Akaunti ya Mmiliki"),
        "owner_role" to locEntry("Shop Owner (Full Admin)", "Nyir'Ububiko (Admin)", "Propriétaire (Admin)", "Mmiliki wa Duka (Admin)"),
        "manager_role" to locEntry("Store Manager", "Umuyobozi w'Ububiko", "Gérant de boutique", "Meneja wa Duka"),
        "cashier_role" to locEntry("Cashier / Operator", "Umucuruzi", "Caissier / Opérateur", "Keshia / Mhudumu"),
        "security_warning" to locEntry(
            "SQLCipher AES-256 Encrypted • Offline Ready",
            "Birinzwe na AES-256 • Bikora nta interineti",
            "Chiffré SQLCipher AES-256 • 100% Hors Ligne",
            "Imesimbwa kwa AES-256 • Inafanya kazi bila mtandao"
        ),
        "incorrect_pin" to locEntry(
            "Incorrect PIN code. Please try again.",
            "Umubare wa PIN si wo. Ongera ugerageze.",
            "Code PIN incorrect. Veuillez réessayer.",
            "Nambari ya PIN si sahihi. Tafadhali jaribu tena."
        ),
        "invalid_credentials" to locEntry(
            "Invalid username or password.",
            "Izina cyangwa ijambobanga si byo.",
            "Identifiant ou mot de passe invalide.",
            "Jina la mtumiaji au nenosiri si sahihi."
        ),
        "account_suspended_err" to locEntry(
            "Account suspended by Master Administrator.",
            "Konti yawe yahagaritswe n'Umuyobozi Mukuru (Admin).",
            "Compte suspendu par l'administrateur principal.",
            "Akaunti imesimamishwa na Msimamizi Mkuu."
        ),
        "welcome_back_prefix" to locEntry("Welcome back", "Murakaza neza", "Bon retour", "Karibu tena"),
        "logged_in_as_prefix" to locEntry("Signed in as", "Winjiye nka", "Connecté en tant que", "Umeingia kama"),
        "unlocked_biometric_prefix" to locEntry("Unlocked with biometric", "Urubuga rufunguwe n'igikumwe", "Déverrouillé par empreinte", "Imefunguliwa kwa kidole"),
        "logged_out_success" to locEntry("Logged out successfully.", "Wasohotse neza.", "Déconnexion réussie.", "Umeondoka kwa mafanikio."),
        "selected_operator_pin_prompt" to locEntry(
            "Enter PIN to unlock terminal",
            "Injiza PIN yo gufungura",
            "Entrez le PIN pour déverrouiller",
            "Weka PIN ili kufungua kituo"
        ),

        // =====================================================================
        // 3-STEP SHOP REGISTRATION WIZARD (100% LOCALIZED)
        // =====================================================================
        "reg_subtitle" to locEntry(
            "AES-256 Offline SQLite • Multi-Branch Sync • 4-Day Free Trial",
            "Ububiko bwa AES-256 • Guhuza Amashami • Iminsi 4 y'Ubuntu",
            "SQLite AES-256 Hors Ligne • Sync Multi-Agences • Essai 4 Jours",
            "SQLite AES-256 Bila Mtandao • Usawazishaji Matawi • Majaribio Siku 4"
        ),
        "reg_step_1" to locEntry("1. Store", "1. Ububiko", "1. Boutique", "1. Duka"),
        "reg_step_2" to locEntry("2. Contact & HQ", "2. Aho Bukorera", "2. Contact & Siège", "2. Mawasiliano"),
        "reg_step_3" to locEntry("3. Credentials", "3. Umutekano", "3. Identifiants", "3. Usalama"),
        "reg_shop_name_label" to locEntry("Shop / Business Name *", "Izina ry'Ububiko / Ubucuruzi *", "Nom de la boutique *", "Jina la Duka / Biashara *"),
        "reg_shop_name_placeholder" to locEntry("e.g. Kigali Smart Groceries", "urugero: Kigali Smart Groceries", "ex. Alimentation Kigali Pro", "mf. Duka la Kigali Smart"),
        "reg_sector_label" to locEntry("Business Sector:", "Icyiciro cy'Ubucuruzi:", "Secteur d'activité :", "Sekta ya Biashara:"),
        "sector_retail" to locEntry("Retail & Grocery", "Ibicuruzwa & Ibiribwa", "Alimentation & Détail", "Rejareja na Vyakula"),
        "sector_fashion" to locEntry("Fashion & Boutique", "Imyenda & Butike", "Mode & Boutique", "Mitindo na Mavazi"),
        "sector_electronics" to locEntry("Electronics & Phones", "Ibikoresho & Telefone", "Électronique & Téléphones", "Vifaa vya Kielektroniki"),
        "sector_pharmacy" to locEntry("Pharmacy & Health", "Farumasi & Ubuzima", "Pharmacie & Santé", "Famasi na Afya"),
        "sector_hardware" to locEntry("Hardware & Tools", "Ibyuma & Ibikoresho", "Quincaillerie & Outils", "Vifaa vya Ujenzi"),
        "sector_restaurant" to locEntry("Restaurant & Bar", "Resitora & Akabari", "Restaurant & Bar", "Mgahawa na Baa"),
        "sector_wholesale" to locEntry("Wholesale Supply", "Ubucuruzi bwa En Gros", "Commerce de Gros", "Biashara ya Jumla"),
        "sector_salon" to locEntry("Salon & Spa", "Saloni & Ubwiza", "Salon & Spa", "Saluni na Urembo"),
        "reg_currency_label" to locEntry("Primary Currency:", "Ifaranga Ukoresha:", "Devise principale :", "Sarafu Kuu:"),
        "reg_phone_label" to locEntry(
            "Owner Registered Phone (MoMo & WhatsApp) *",
            "Terefone ya Nyir'ububiko (MoMo & WhatsApp) *",
            "Téléphone du propriétaire (MoMo & WhatsApp) *",
            "Simu ya Mmiliki (MoMo na WhatsApp) *"
        ),
        "reg_phone_placeholder" to locEntry("+250 788 123 456", "+250 788 123 456", "+250 788 123 456", "+250 788 123 456"),
        "reg_address_placeholder" to locEntry("e.g. Kigali, Nyarugenge Market #12", "urugero: Kigali, Nyarugenge #12", "ex. Kigali, Marché Nyarugenge #12", "mf. Kigali, Soko la Nyarugenge #12"),
        "reg_trial_card_title" to locEntry(
            "4-Day Full-Access Free Trial • Then 5,000 FRw / mo",
            "Iminsi 4 y'Ubuntu Yuzuye • Hanyuma 5,000 FRw / ukwezi",
            "Essai Gratuit 4 Jours Complets • Puis 5 000 FRw / mois",
            "Majaribio ya Bure Siku 4 • Kisha 5,000 FRw / mwezi"
        ),
        "reg_trial_card_desc" to locEntry(
            "After 4 free days, submit your payment details for admin review. After approval, enter the BB2 code or wait for the shop to unlock on sync.",
            "Nyuma y'iminsi 4 y'ubuntu, ohereza amakuru y'ubwishyu kugira ngo umuyobozi ayagenzure. Nyuma yo kwemezwa, koresha kode ya BB2 cyangwa utegereze ko iduka rifunguka rimaze guhuza.",
            "Après 4 jours d'essai, envoyez les détails du paiement pour vérification par un administrateur. Après validation, saisissez le code BB2 ou attendez le déblocage à la synchronisation.",
            "Baada ya siku 4 za jaribio, tuma taarifa za malipo zikaguliwe na msimamizi. Baada ya kuidhinishwa, weka msimbo wa BB2 au subiri duka lifunguke baada ya kusawazisha."
        ),
        "reg_owner_name_label" to locEntry("Owner Full Name *", "Amazina Yuzuye ya Nyir'ububiko *", "Nom complet du propriétaire *", "Jina Kamili la Mmiliki *"),
        "reg_owner_name_placeholder" to locEntry("e.g. Jean Paul Mugisha", "urugero: Jean Paul Mugisha", "ex. Jean Paul Mugisha", "mf. Jean Paul Mugisha"),
        "reg_username_label" to locEntry(
            "Owner Username (Bound to Unlock Codes) *",
            "Izina ry'Ukoresha / Username (Rya Kode BB2) *",
            "Nom d'utilisateur (Lié aux codes BB2) *",
            "Jina la Mtumiaji (Kwa Misimbo ya BB2) *"
        ),
        "reg_username_placeholder" to locEntry("e.g. jeanpaul", "urugero: jeanpaul", "ex. jeanpaul", "mf. jeanpaul"),
        "reg_account_handle" to locEntry("Account handle", "Konti yawe", "Identifiant du compte", "Kitambulisho cha akaunti"),
        "reg_pin_label" to locEntry("4-Digit Fast Security PIN *", "PIN y'Imibare 4 yo Gufungura *", "Code PIN rapide à 4 chiffres *", "PIN ya Haraka ya Tarakimu 4 *"),
        "reg_pin_placeholder" to locEntry("e.g. 2580", "urugero: 2580", "ex. 2580", "mf. 2580"),
        "reg_gen_pin" to locEntry("Generate Strong PIN", "Kora PIN Ikomeye", "Générer un PIN fort", "Tengeneza PIN Imara"),
        "strength_too_short" to locEntry("Too short", "Migufi cyane", "Trop court", "Fupi sana"),
        "strength_basic" to locEntry("Basic", "Byoroshye", "Basique", "Wastani"),
        "strength_good" to locEntry("Good", "Byiza", "Bon", "Nzuri"),
        "strength_strong" to locEntry("Strong", "Bikomeye", "Fort", "Imara sana"),
        "reg_create_launch" to locEntry("Create & Launch", "Kora Ububiko & Tangira", "Créer & Lancer", "Unda & Anza"),
        "reg_err_shop_name" to locEntry("Please enter your shop name.", "Injiza izina ry'ububiko bwawe.", "Veuillez entrer le nom de votre boutique.", "Tafadhali weka jina la duka lako."),
        "reg_err_phone" to locEntry(
            "Please enter a valid owner phone number (for MoMo & BB2 unlock binding).",
            "Injiza nimero ya terefone y'ukuri (y'ubwishyu na Kode BB2).",
            "Veuillez entrer un numéro de téléphone valide (pour MoMo et code BB2).",
            "Tafadhali weka nambari sahihi ya simu (kwa MoMo na msimbo wa BB2)."
        ),
        "reg_err_owner_name" to locEntry("Please enter owner full name.", "Injiza amazina ya nyir'ububiko.", "Veuillez entrer le nom complet du propriétaire.", "Tafadhali weka jina kamili la mmiliki."),
        "reg_err_username" to locEntry("Please enter a username.", "Injiza username yawe.", "Veuillez entrer un nom d'utilisateur.", "Tafadhali weka jina la mtumiaji."),
        "reg_err_pin" to locEntry("PIN must be exactly 4 digits.", "PIN igomba kuba imibare 4 neza.", "Le PIN doit contenir exactement 4 chiffres.", "PIN lazima iwe na tarakimu 4 kamili."),
        "reg_err_password" to locEntry("Password must be at least 6 characters.", "Ijambobanga rigomba kuba nibura inyuguti 6.", "Le mot de passe doit contenir au moins 6 caractères.", "Nenosiri lazima liwe na herufi angalau 6."),
        "reg_success_trial" to locEntry(
            "Store created! Your 4-Day Full-Access Free Trial is now active.",
            "Ububiko bwatangiye! Iminsi 4 y'ubuntu yo kugerageza irakora.",
            "Boutique créée ! Votre essai gratuit de 4 jours est maintenant actif.",
            "Duka limeundwa! Majaribio yako ya bure ya siku 4 yameanza."
        ),
        "default_receipt_footer" to locEntry(
            "Thank you for your business! Please visit again!",
            "Murakoze cyane kugura! Mwongere kugaruka!",
            "Merci pour votre visite ! À très bientôt !",
            "Asante kwa biashara yako! Karibu tena!"
        ),

        // =====================================================================
        // DASHBOARD
        // =====================================================================
        "today_overview" to locEntry("TODAY'S PERFORMANCE", "IBYAGURISHIJWE UYU MUNSI", "PERFORMANCE DU JOUR", "UTENDAJI WA LEO"),
        "today_revenue" to locEntry("Today's Sales", "Amafaranga Yinjiye", "Ventes du jour", "Mauzo ya Leo"),
        "today_profit" to locEntry("Est. Profit", "Inyungu Y'uyu Munsi", "Bénéfice est.", "Faida ya Leo"),
        "today_orders" to locEntry("Orders", "Inyemezabuguzi", "Commandes", "Oda"),
        "items_sold" to locEntry("Items sold", "Ibicuruzwa byagurishijwe", "Articles vendus", "Bidhaa zilizouzwa"),
        "total_stock_value" to locEntry("Total Stock Value", "Agaciro k'Ububiko", "Valeur totale du stock", "Thamani ya Stoo"),
        "potential_profit" to locEntry("Potential Profit", "Inyungu Itegerejwe", "Profit potentiel", "Faida Inayotarajiwa"),
        "outstanding_debts" to locEntry("Uncollected Debts", "Amadeni Asigaye Hanze", "Créances clients", "Madeni Yasiyolipwa"),
        "low_stock_warning" to locEntry("Low Stock Items", "Ibicuruzwa Bishize", "Articles en rupture", "Bidhaa Zinazoisha"),
        "quick_actions" to locEntry("Quick Actions", "Ibikorwa Byihuse", "Actions Rapides", "Vitendo vya Haraka"),
        "new_sale_action" to locEntry("New Sale (POS)", "Kugurisha (POS)", "Nouvelle vente", "Uuzaji Mpya"),
        "add_product_action" to locEntry("Add Stock", "Kongera Ibicuruzwa", "Ajouter Stock", "Ongeza Bidhaa"),
        "record_payment_action" to locEntry("Collect Debt", "Kwakira Umwenda", "Encaisser Dette", "Kusanya Deni"),
        "financial_reports_action" to locEntry("View Reports", "Kureba Raporo", "Voir Rapports", "Tazama Ripoti"),
        "recent_sales_title" to locEntry("Recent Transactions", "Ibiheruka Kugurishwa", "Ventes récentes", "Miamala ya Hivi Karibuni"),
        "view_all" to locEntry("View All", "Reba Byose", "Tout voir", "Tazama Zote"),
        "no_sales_yet" to locEntry(
            "No sales recorded yet. Tap 'POS Sale' to make your first sale!",
            "Nta bicuruzwa biragurishwa. Kanda 'Gucuruza' utangire!",
            "Aucune vente enregistrée. Appuyez sur « Caisse POS » pour commencer !",
            "Hakuna mauzo bado. Gusa 'Mauzo POS' kuanza kuuza!"
        ),
        "first_sale_title" to locEntry(
            "Make your first sale",
            "Kora igurisha rya mbere",
            "Réalisez votre première vente",
            "Fanya mauzo yako ya kwanza"
        ),
        "first_sale_setup_hint" to locEntry(
            "Add one product with its cost, selling price and opening quantity. Staff and receipt settings can wait.",
            "Ongeramo igicuruzwa, igiciro wakiguze, icyo ugurishaho n'ingano watangiranye. Abakozi n'inyemezabuguzi uzabishyiraho nyuma.",
            "Ajoutez un produit, son coût, son prix de vente et son stock initial. Le personnel et les reçus peuvent attendre.",
            "Ongeza bidhaa moja, gharama yake, bei ya kuuza na kiasi cha mwanzo. Wafanyakazi na risiti vinaweza kusubiri."
        ),
        "first_sale_ready_hint" to locEntry(
            "Your products are ready. Start a sale now; staff and receipt settings can wait.",
            "Ibicuruzwa birahari. Tangira kugurisha; abakozi n'inyemezabuguzi uzabishyiraho nyuma.",
            "Vos produits sont prêts. Commencez une vente ; les réglages du personnel et des reçus peuvent attendre.",
            "Bidhaa zako ziko tayari. Anza kuuza sasa; mipangilio ya wafanyakazi na risiti inaweza kusubiri."
        ),
        "first_sale_add_product_action" to locEntry(
            "Add first product",
            "Ongeramo igicuruzwa",
            "Ajouter un produit",
            "Ongeza bidhaa ya kwanza"
        ),
        "first_sale_start_action" to locEntry(
            "Start first sale",
            "Tangira kugurisha",
            "Démarrer la première vente",
            "Anza mauzo ya kwanza"
        ),

        // =====================================================================
        // POS & CHECKOUT
        // =====================================================================
        "pos_title" to locEntry("Point of Sale", "Aho Gucururiza (POS)", "Point de Vente", "Kituo cha Mauzo (POS)"),
        "search_product_hint" to locEntry("Search product name or barcode...", "Shakisha izina cyangwa barcode...", "Chercher produit ou code-barres...", "Tafuta jina la bidhaa au barcode..."),
        "scan_barcode" to locEntry("Scan / SKU", "Soma Barcode", "Scanner / SKU", "Skani Barcode"),
        "all_categories" to locEntry("All", "Byose", "Tout", "Zote"),
        "cart" to locEntry("Cart", "Igitebo", "Panier", "Kikapu"),
        "empty_cart" to locEntry("Cart is empty. Tap items to add.", "Igitebo kirimo ubusa. Kanda ku gicuruzwa wongeremo.", "Panier vide. Touchez un article pour l'ajouter.", "Kikapu kipo tupu. Gusa bidhaa kuongeza."),
        "clear_cart" to locEntry("Clear Cart", "Siba Igitebo", "Vider le panier", "Futa Kikapu"),
        "hold_cart" to locEntry("Hold Sale", "Bika Igitebo", "Mettre en attente", "Shikilia Mauzo"),
        "held_carts" to locEntry("Held Carts", "Ibitebo Bibitse", "Paniers en attente", "Vikapu Vilivyoshikiliwa"),
        "resume_cart" to locEntry("Resume", "Komeza", "Reprendre", "Endelea"),
        "customer" to locEntry("Customer", "Umukiriya", "Client", "Mteja"),
        "walk_in_customer" to locEntry("Walk-in Customer", "Umuguzi Usanzwe", "Client de passage", "Mteja wa Kawaida"),
        "payment_method" to locEntry("Payment Method", "Uburyo bwo Kwishyura", "Mode de paiement", "Njia ya Malipo"),
        "cash" to locEntry("Cash", "Amafaranga (Cash)", "Espèces", "Taslimu"),
        "momo" to locEntry("MTN MoMo", "MTN MoMo", "MTN MoMo", "MTN MoMo"),
        "airtel" to locEntry("Airtel Money", "Airtel Money", "Airtel Money", "Airtel Money"),
        "card" to locEntry("Bank Card", "Ikarita ya Banki", "Carte Bancaire", "Kadi ya Benki"),
        "split_payment" to locEntry("Split (Cash + MoMo)", "Kuvanga (Cash + MoMo)", "Mixte (Espèces + MoMo)", "Mchanganyiko (Taslimu + MoMo)"),
        "credit_debt" to locEntry("Credit / Debt", "Umwenda / Ikirarane", "Crédit / Dette", "Mkopo / Deni"),
        "subtotal" to locEntry("Subtotal", "Yose Hamwe", "Sous-total", "Jumla Ndogo"),
        "discount" to locEntry("Discount", "Kugabanyirizwa", "Remise", "Punguzo"),
        "net_total" to locEntry("Net Total", "Ayishyurwa", "Total Net", "Jumla Kuu"),
        "amount_received" to locEntry("Amount Received", "Amafaranga Yatanzwe", "Montant reçu", "Kiasi Kilichopokelewa"),
        "change_return" to locEntry("Change to Return", "Ibiceri Byo Gusubiza", "Monnaie à rendre", "Chenji ya Kurudisha"),
        "remaining_debt" to locEntry("Remaining Debt", "Umwenda Asigaranye", "Solde restant", "Deni Linalobaki"),
        "complete_sale" to locEntry("Complete Sale & Receipt", "Emeza & Sohora Inyemezabuguzi", "Valider & Reçu", "Kamilisha Mauzo & Risiti"),
        "insufficient_stock" to locEntry("Insufficient stock available", "Ibicuruzwa ntibihagije mu bubiko", "Stock insuffisant", "Bidhaa hazitoshi stooni"),
        "select_customer_for_credit" to locEntry(
            "Please select a registered customer to sell on credit!",
            "Hitamo umukiriya wanditse kugira ngo umuhe ku mwenda!",
            "Sélectionnez un client enregistré pour vendre à crédit !",
            "Tafadhali chagua mteja aliyesajiliwa kuuza kwa mkopo!"
        ),

        // =====================================================================
        // EXCEL TABLE VIEWS & INVENTORY
        // =====================================================================
        "excel_mode" to locEntry("Excel Spreadsheet View", "Imbonerahamwe ya Excel", "Vue Tableau Excel", "Mwonekano wa Jedwali"),
        "col_num" to locEntry("#", "#", "#", "#"),
        "col_name" to locEntry("Product Item", "Igicuruzwa", "Produit", "Bidhaa"),
        "col_category" to locEntry("Category", "Icyiciro", "Catégorie", "Kategoria"),
        "col_stock_qty" to locEntry("In Stock", "Ibihari", "En Stock", "Zilizopo"),
        "col_buying_price" to locEntry("Cost (Buy)", "Waguriyeho", "Coût Achat", "Bei ya Kununua"),
        "col_selling_price" to locEntry("Sell Price", "Ugurisha", "Prix Vente", "Bei ya Kuuza"),
        "col_profit_margin" to locEntry("Margin %", "Inyungu %", "Marge %", "Faida %"),
        "col_total_val" to locEntry("Total Value", "Agaciro", "Valeur Totale", "Thamani Jumla"),
        "col_actions" to locEntry("Actions", "Ibikorwa", "Actions", "Vitendo"),
        "col_customer_name" to locEntry("Customer Name", "Amazina", "Nom du client", "Jina la Mteja"),
        "col_phone" to locEntry("Phone Number", "Terefone", "Téléphone", "Simu"),
        "col_debt_balance" to locEntry("Debt Balance", "Umwenda", "Solde Dette", "Salio la Deni"),
        "col_credit_limit" to locEntry("Limit", "Umupaka", "Limite", "Kikomo"),
        "col_invoice_ref" to locEntry("Receipt #", "Inyemezabuguzi", "Reçu #", "Risiti #"),
        "col_date" to locEntry("Date & Time", "Itariki & Isaha", "Date & Heure", "Tarehe & Saa"),
        "col_amount" to locEntry("Total Paid", "Ayishyuwe", "Total Payé", "Jumla Iliyolipwa"),
        "col_method" to locEntry("Method", "Uburyo", "Méthode", "Njia"),

        "inventory_title" to locEntry("Inventory & Purchases", "Ububiko n'Ibyaguzwe", "Stock & Achats", "Stoo na Manunuzi"),
        "add_product" to locEntry("Add New Product", "Ongeramo Igicuruzwa", "Nouveau Produit", "Ongeza Bidhaa Mpya"),
        "product_name" to locEntry("Product Name", "Izina ry'Igicuruzwa", "Nom du produit", "Jina la Bidhaa"),
        "barcode" to locEntry("Barcode / SKU", "Kode / Barcode", "Code-barres / SKU", "Barcode / SKU"),
        "category" to locEntry("Category", "Icyiciro", "Catégorie", "Kategoria"),
        "cost_price" to locEntry("Cost Price (Buying)", "Igiciro Waguriyeho", "Prix d'achat", "Bei ya Kununua"),
        "selling_price" to locEntry("Selling Price", "Igiciro Ugurisha", "Prix de vente", "Bei ya Kuuza"),
        "wholesale_price" to locEntry("Wholesale Price", "Igiciro cya En Gros", "Prix de gros", "Bei ya Jumla"),
        "quantity_in_stock" to locEntry("Quantity in Stock", "Ingano Iri mu Bubiko", "Quantité en stock", "Idadi Stooni"),
        "min_stock_alert" to locEntry("Min Alert Threshold", "Ingano y'Iburira", "Seuil d'alerte", "Kiwango cha Tahadhari"),
        "unit" to locEntry("Unit (pcs, kg, etc.)", "Ibipimo (pcs, kg)", "Unité (pcs, kg)", "Kipimo (pcs, kg)"),
        "adjust_stock" to locEntry("Adjust Stock", "Hindura Ingano", "Ajuster le stock", "Rekebisha Stoo"),
        "restock" to locEntry("Restock (New Delivery)", "Kongeramo Ibyageze", "Réapprovisionner", "Ongeza Mzigo Mpya"),
        "damage_loss" to locEntry("Damage / Expired / Loss", "Ibyangiritse / Ibyarengeje Igihe", "Perte / Avarie", "Uharibifu / Muda Kuisha"),
        "inventory_count" to locEntry("Stock Count Correction", "Gukosora Ibarura", "Correction d'inventaire", "Marekebisho ya Hesabu"),
        "stock_valuation" to locEntry("Stock Valuation", "Agaciro k'Ububiko", "Valorisation du stock", "Thamani ya Stoo"),
        "cost_valuation" to locEntry("Total Cost Value", "Ayishyuwe Yose", "Valeur d'achat", "Gharama Jumla"),
        "retail_valuation" to locEntry("Retail Value", "Agaciro k'Ugurishije", "Valeur au détail", "Thamani ya Mauzo"),
        "profit_margin" to locEntry("Est. Gross Profit", "Inyungu Yitezwe", "Marge brute est.", "Faida Ghafi"),
        "low_stock" to locEntry("Low Stock", "Bishize", "Stock Faible", "Stoo Ndogo"),
        "in_stock" to locEntry("In Stock", "Bihari", "En Stock", "Ipo Stooni"),
        "export_excel_csv" to locEntry("Export Excel / CSV Sheet", "Sohora Excel / CSV", "Exporter Excel / CSV", "Hamisha Excel / CSV"),
        "import_excel_csv" to locEntry("Import from CSV File", "Injiza muri CSV", "Importer depuis CSV", "Ingiza kutoka CSV"),

        // =====================================================================
        // CUSTOMERS & DEBT
        // =====================================================================
        "customers_title" to locEntry("Customers & Debt Ledger", "Abakiriya & Amadeni", "Clients & Créances", "Wateja & Kitabu cha Madeni"),
        "add_customer" to locEntry("Add Customer", "Andika Umukiriya", "Ajouter Client", "Ongeza Mteja"),
        "import_contacts" to locEntry("Import from Contacts", "Vana muri Terefone", "Importer Contacts", "Ingiza kutoka Anwani"),
        "customer_name" to locEntry("Customer Full Name", "Amazina y'Umukiriya", "Nom complet du client", "Jina Kamili la Mteja"),
        "phone_number" to locEntry("Phone Number", "Nimero ya Terefone", "Numéro de téléphone", "Nambari ya Simu"),
        "address" to locEntry("Address / Location", "Aho Aherereye", "Adresse / Localisation", "Anwani / Mahali"),
        "credit_limit" to locEntry("Credit Limit", "Umupaka w'Umwenda", "Limite de crédit", "Kikomo cha Mkopo"),
        "total_debt" to locEntry("Current Debt", "Umwenda Afite", "Dette actuelle", "Deni la Sasa"),
        "record_payment" to locEntry("Record Debt Payment", "Andika Kwishyura", "Enregistrer paiement", "Rekodi Malipo ya Deni"),
        "send_reminder" to locEntry("Send Debt Reminder (WhatsApp)", "Kwishyuza kuri WhatsApp", "Rappel de dette (WhatsApp)", "Tuma Kikumbusho (WhatsApp)"),
        "debt_statement" to locEntry("Customer Statement", "Raporo y'Umukiriya", "Relevé client", "Taarifa ya Mteja"),
        "no_debt" to locEntry("No Debt (Cleared)", "Nta mwenda afite", "Aucune dette", "Hana Deni"),
        "previous_debt" to locEntry("Previous Debt", "Umwenda wari usanzwe", "Dette précédente", "Deni la Awali"),
        "amount_paid" to locEntry("Amount Paid", "Ayishyuwe", "Montant payé", "Kiasi Kilicholipwa"),
        "debt_cleared" to locEntry("DEBT CLEARED", "YARANGIYE NEZA", "DETTE SOLDÉE", "DENI LIMELIPWA"),
        "installment_history" to locEntry("Payment History", "Uko Yishyuye", "Historique des paiements", "Historia ya Malipo"),
        "auto_debt_saved" to locEntry("Debt recorded to ledger", "Umwenda wabitswe mu gitabo", "Dette enregistrée", "Deni limehifadhiwa"),

        // =====================================================================
        // ANALYTICS, FORECASTING & SALES HISTORY
        // =====================================================================
        "reports_title" to locEntry("Business Analytics & P/L", "Raporo z'Ubucuruzi & Inyungu", "Analyses & Pertes/Profits", "Takwimu za Biashara & Faida"),
        "period_today" to locEntry("Today", "Uyu munsi", "Aujourd'hui", "Leo"),
        "period_yesterday" to locEntry("Yesterday", "Ejo hashize", "Hier", "Jana"),
        "period_this_week" to locEntry("This Week", "Iki Cyumweru", "Cette semaine", "Wiki Hii"),
        "period_this_month" to locEntry("This Month", "Uku Kwezi", "Ce mois", "Mwezi Huu"),
        "period_this_year" to locEntry("This Year", "Uyu Mwaka", "Cette année", "Mwaka Huu"),
        "period_all_time" to locEntry("All Time", "Igihe Cyose", "Tout le temps", "Muda Wote"),
        "gross_revenue" to locEntry("Gross Revenue", "Amafaranga Yinjiye", "Chiffre d'affaires", "Mapato Ghafi"),
        "cost_of_goods" to locEntry("Cost of Goods (COGS)", "Ikiguzi cy'Ibyagurishijwe", "Coût des ventes", "Gharama za Bidhaa"),
        "gross_profit" to locEntry("Net Gross Profit", "Inyungu Nyayo", "Bénéfice Net", "Faida Halisi"),
        "profit_margin_pct" to locEntry("Profit Margin %", "Ijanisha ry'Inyungu", "Marge bénéficiaire %", "Asilimia ya Faida %"),
        "top_selling_products" to locEntry("Top Selling Products", "Ibicuruzwa Byagurishijwe Cyane", "Meilleures ventes", "Bidhaa Zinazouzwa Zaidi"),
        "category_sales_share" to locEntry("Sales by Category", "Ibyaguzwe ku Byiciro", "Ventes par catégorie", "Mauzo kwa Kategoria"),
        "export_pdf_report" to locEntry("Export PDF Financial Report", "Sohora Raporo ya PDF", "Exporter Rapport PDF", "Hamisha Ripoti ya PDF"),
        "demand_forecast_title" to locEntry("14-Day Demand Forecast & Reorder", "Iteganyamibare ry'Iminsi 14", "Prévision 14 jours & Réappro", "Utabiri wa Siku 14 & Kuagiza"),
        "verify_receipt_seal" to locEntry("Verify Offline Receipt Seal", "Genzura Kashe y'Inyemezabuguzi", "Vérifier le sceau du reçu", "Thibitisha Muhuri wa Risiti"),
        "refund_void_sale" to locEntry("Refund / Void Sale", "Gusesa / Gusubiza Amafaranga", "Rembourser / Annuler", "Rejesha / Batilisha Mauzo"),

        // =====================================================================
        // SETTINGS HUB & CATEGORIES (100% LOCALIZED)
        // =====================================================================
        "settings_title" to locEntry("Shop & System Settings", "Igenamiterere ry'Ububiko", "Paramètres Boutique & Système", "Mipangilio ya Duka na Mfumo"),
        "settings_search_hint" to locEntry("Search settings, license, sync, printer...", "Shakisha igenamiterere, kode, sync...", "Rechercher paramètres, licence, sync...", "Tafuta mipangilio, leseni, usawazishaji..."),
        "cat_all" to locEntry("All", "Byose", "Tout", "Zote"),
        "cat_language" to locEntry("Language & Theme", "Ururimi & Isura", "Langue & Thème", "Lugha & Mandhari"),
        "cat_license" to locEntry("License & Unlock", "Ifatabuguzi & Kode", "Licence & Code", "Leseni & Kufungua"),
        "cat_sync" to locEntry("Sync & Network", "Sync & Interineti", "Sync & Réseau", "Usawazishaji"),
        "cat_shop" to locEntry("Shop & POS", "Ububiko & POS", "Boutique & POS", "Duka & POS"),
        "cat_team" to locEntry("Staff & Branches", "Abakozi & Amashami", "Équipe & Agences", "Wafanyakazi & Matawi"),
        "cat_security" to locEntry("Security & DB", "Umutekano & DB", "Sécurité & BD", "Usalama & DB"),
        "shop_profile" to locEntry("Shop Profile & Info", "Amakuru y'Ububiko", "Profil de la boutique", "Wasifu wa Duka"),
        "shop_name" to locEntry("Shop Name", "Izina ry'Ububiko", "Nom de la boutique", "Jina la Duka"),
        "owner_name" to locEntry("Owner Name", "Amazina ya Nyir'ububiko", "Nom du propriétaire", "Jina la Mmiliki"),
        "receipt_footer" to locEntry("Receipt Footer Note", "Ubutumwa bwo ku Nyemezabuguzi", "Pied de page du reçu", "Ujumbe wa Chini ya Risiti"),
        "receipt_footer_text" to locEntry("Receipt Footer Note", "Ubutumwa bwo ku Nyemezabuguzi", "Pied de page du reçu", "Ujumbe wa Chini ya Risiti"),
        "staff_management" to locEntry("Staff & Cashiers", "Abakozi & Abacuruzi", "Équipe & Caissiers", "Wafanyakazi & Keshia"),
        "data_backup" to locEntry("Backup & Export", "Bika Kopi (Backup)", "Sauvegarde & Export", "Hifadhi Nakala"),
        "restore_data" to locEntry("Restore Shop Data", "Garura Kopi", "Restaurer les données", "Rejesha Data"),
        "currency" to locEntry("Currency", "Ifaranga", "Devise", "Sarafu"),
        "security_autolock_title" to locEntry("Terminal Security & Auto-Lock", "Umutekano & Gufunga Byikora", "Sécurité & Verrouillage Auto", "Usalama & Kujifunga Kiotomatiki"),
        "idle_lock_timeout" to locEntry("Auto-Lock Idle Timeout", "Igihe cyo Gufunga Byikora", "Délai de verrouillage auto", "Muda wa Kujifunga Kiotomatiki"),
        "offline_db_active" to locEntry("SQLCipher AES-256 Active • Cloud Ready", "Ububiko bwa AES-256 Burakora", "Base AES-256 Active • Prêt Cloud", "Hifadhidata AES-256 Hai • Tayari Cloud"),
        "cloud_sync_card_title" to locEntry("Cloud & Multi-Device Sync", "Guhuza n'Ububiko bwo mu Kirere (Cloud)", "Synchronisation Cloud & Multi-Appareils", "Usawazishaji wa Wingu na Vifaa"),
        "cloud_online_desc" to locEntry("Online • Auto-syncing on changes", "Interineti irahari • Guhuza byikora", "En ligne • Synchronisation automatique", "Mtandaoni • Inasawazisha kiotomatiki"),
        "cloud_offline_desc" to locEntry("Offline • Safe encrypted local storage active", "Nta interineti • Bibitswe neza muri telefoni", "Hors ligne • Stockage chiffré actif", "Nje ya mtandao • Hifadhi salama inafanya kazi"),
        "push_to_cloud_now" to locEntry("Push All Data to Cloud Now", "Ohereza Amakuru kuri Cloud Nonaha", "Synchroniser vers le Cloud maintenant", "Tuma Data Zote Kwenye Wingu Sasa"),
        "pushing_to_cloud" to locEntry("Syncing with Cloud...", "Kugenzura no Guhuza...", "Synchronisation en cours...", "Inasawazisha na Wingu..."),
        "open_sync_hub" to locEntry("Open Branch & LAN Sync Hub", "Fungura Urubuga rwo Gusangiza Amashami", "Ouvrir le Hub de Sync Agences", "Fungua Kituo cha Usawazishaji Matawi"),
        "admin_portal_title" to locEntry("Master Admin & Cloud Licensing", "Ubuyobozi Mukuru & Kode BB2", "Console Admin & Licences Cloud", "Usimamizi Mkuu & Leseni za Wingu"),
        "open_admin_console" to locEntry("Admin Console", "Ubuyobozi (Admin)", "Console Admin", "Dashibodi ya Admin"),
        "web_admin_portal" to locEntry("Web Admin Portal", "Urubuga rwa Admin", "Portail Web Admin", "Tovuti ya Admin"),

        // =====================================================================
        // SUBSCRIPTION, 4-DAY FREE TRIAL & AUTO-UNLOCK BB2 CODE
        // =====================================================================
        "subscription_title" to locEntry("Monthly Shop License", "Ifatabuguzi ry'Ukwezi", "Licence Mensuelle Boutique", "Leseni ya Mwezi ya Duka"),
        "monthly_fee_desc" to locEntry(
            "5,000 FRw / month • Full Offline POS & Multi-Branch",
            "5,000 FRw / ukwezi • POS Ikora Offline n'Amashami",
            "5 000 FRw / mois • POS Hors Ligne & Multi-Agences",
            "5,000 FRw / mwezi • POS Bila Mtandao na Matawi"
        ),
        "active_subscription" to locEntry("License Active", "Ifatabuguzi Rirakora", "Licence Active", "Leseni Inafanya Kazi"),
        "trial_active" to locEntry("4-Day Free Trial", "Iminsi 4 y'Ubuntu", "Essai Gratuit 4 Jours", "Majaribio ya Bure Siku 4"),
        "trial_ended_title" to locEntry("4-Day Free Trial Ended", "Iminsi 4 y'Ubuntu Yarangiye", "Essai Gratuit de 4 Jours Terminé", "Majaribio ya Siku 4 Yameisha"),
        "suspended_title" to locEntry("Account Suspended by Admin", "Konti Yahagaritswe na Admin", "Compte Suspendu par l'Admin", "Akaunti Imesimamishwa na Admin"),
        "subscription_expired" to locEntry("License Expired", "Ifatabuguzi Ryararangiye", "Licence Expirée", "Leseni Imeisha Muda"),
        "trial_ended_subtitle" to locEntry(
            "Your 4-day trial has ended. Pay through the operator and submit proof for admin review. After approval, use your BB2 code or wait for unlock on sync.",
            "Iminsi 4 yo kugerageza yarangiye. Ishyura ukoresheje ikigo cy'itumanaho wohereze gihamya igenzurwe n'umuyobozi. Nyuma yo kwemezwa, koresha kode ya BB2 cyangwa utegereze ko rifunguka rimaze guhuza.",
            "Votre essai de 4 jours est terminé. Payez via l'opérateur et envoyez une preuve pour vérification admin. Après validation, utilisez le code BB2 ou attendez le déblocage à la synchro.",
            "Jaribio la siku 4 limeisha. Lipa kupitia mtoa huduma na utume uthibitisho ukaguliwe na msimamizi. Baada ya kuidhinishwa, tumia msimbo wa BB2 au subiri duka lifunguke baada ya kusawazisha."
        ),
        "expired_subtitle" to locEntry(
            "Your monthly license has expired. Submit payment details for admin review, then enter the issued BB2 code or sync to receive approval.",
            "Ifatabuguzi ryarangiye. Ohereza amakuru y'ubwishyu kugira ngo umuyobozi ayagenzure, hanyuma ukoreshe kode ya BB2 cyangwa uhuze kugira ngo ubone iyemezwa.",
            "Votre licence mensuelle a expiré. Envoyez les détails du paiement pour vérification admin, puis saisissez le code BB2 émis ou synchronisez pour recevoir l'approbation.",
            "Leseni yako ya mwezi imeisha. Tuma taarifa za malipo zikaguliwe na msimamizi, kisha weka msimbo wa BB2 au sawazisha ili kupokea idhini."
        ),
        "suspended_subtitle" to locEntry(
            "Contact BeBoss Master Admin on WhatsApp or enter a newly issued BB2 unlock code to restore access.",
            "Vugana na BeBoss Master Admin kuri WhatsApp cyangwa winjize kode nshya ya BB2 kugira ngo ufungurirwe.",
            "Contactez l'administrateur BeBoss sur WhatsApp ou entrez un nouveau code BB2 pour rétablir l'accès.",
            "Wasiliana na Msimamizi Mkuu wa BeBoss kwenye WhatsApp au weka msimbo mpya wa BB2 kurejesha huduma."
        ),
        "days_left" to locEntry("days left", "iminsi isigaye", "jours restants", "siku zilizobaki"),
        "renew_subscription" to locEntry("Pay / Renew License", "Ishyura / Vugurura Ifatabuguzi", "Payer / Renouveler", "Lipa / Huisha Leseni"),
        "pay_with_momo" to locEntry("Pay with MTN MoMo", "Ishyura na MTN MoMo", "Payer avec MTN MoMo", "Lipa na MTN MoMo"),
        "pay_with_airtel" to locEntry("Pay with Airtel Money", "Ishyura na Airtel Money", "Payer avec Airtel Money", "Lipa na Airtel Money"),
        "pay_ussd_whatsapp_cta" to locEntry(
            "Pay by USSD & Submit Proof",
            "Ishyura na USSD wohereze gihamya",
            "Payer par USSD et envoyer la preuve",
            "Lipa kwa USSD na utume uthibitisho"
        ),
        "insert_unlock_code_title" to locEntry(
            "Enter Admin Unlock Code (Auto-Unlock)",
            "Injiza Kode y'Admin (Ifungura Ako Kanya)",
            "Entrer le Code Admin (Déverrouillage Auto)",
            "Weka Msimbo wa Admin (Hufungua Kiotomatiki)"
        ),
        "enter_voucher_code" to locEntry("Unlock Code (BB2-...)", "Kode yo Gufungura (BB2-...)", "Code de déverrouillage (BB2-...)", "Msimbo wa Kufungua (BB2-...)"),
        "auto_unlock_detected" to locEntry(
            "Valid BB2 unlock code detected — verifying & unlocking automatically...",
            "Kode ya BB2 ibonetse — iri kugenzurwa no gufungura ako kanya...",
            "Code BB2 valide détecté — vérification et déverrouillage automatiques...",
            "Msimbo halali wa BB2 umetambuliwa — inathibitisha na kufungua kiotomatiki..."
        ),
        "activate_code" to locEntry("Verify & Unlock Now", "Emeza & Fungura Nonaha", "Vérifier & Déverrouiller", "Thibitisha & Fungua Sasa"),
        "sync_cloud_approvals" to locEntry("Sync Cloud Approvals", "Shakisha Kode kuri Cloud", "Synchroniser Cloud", "Sawazisha Wingu"),
        "contact_support" to locEntry("WhatsApp Admin Support", "Vugana na Admin kuri WhatsApp", "Support Admin WhatsApp", "Msaada wa Admin WhatsApp"),
        "share_app_apk" to locEntry("Share App APK", "Ohereza Porogaramu (APK)", "Partager l'APK", "Shiriki Programu (APK)"),
        "device_code" to locEntry("Shop Device Code", "Kode y'Igikoresho", "Code Appareil", "Msimbo wa Kifaa"),

        // =====================================================================
        // QUICK ACTIONS & RUNTIME BANNERS
        // =====================================================================
        "quick_custom_sale" to locEntry("Quick Custom Sale", "Gucuruza Vuba", "Vente Rapide Libre", "Mauzo ya Haraka"),
        "quick_add_product" to locEntry("Quick Add Product", "Ongeramo Igicuruzwa", "Ajout Rapide Produit", "Ongeza Bidhaa Haraka"),
        "quick_new_customer" to locEntry("New Customer / Debt", "Umukiriya Mushya / Ideni", "Nouveau Client / Dette", "Mteja Mpya / Deni"),
        "quick_universal_search" to locEntry("Universal Search", "Shakisha Byose", "Recherche Globale", "Utafutaji wa Jumla"),
        "send_daily_whatsapp" to locEntry("Daily Business Summary", "Raporo y'Umunsi", "Résumé Quotidien", "Muhtasari wa Siku"),
        "view_last_receipt" to locEntry("View Last Receipt", "Inyemezabuguzi Iheruka", "Dernier Reçu", "Risiti ya Mwisho"),
        "items_in_cart" to locEntry("items in cart", "mu gitebo", "articles au panier", "bidhaa kikapuni"),
        "low_stock_alert_tab" to locEntry("Low Stock", "Biri gushira", "Stock Bas", "Stoo Ndogo"),
        "unpaid_debtors_tab" to locEntry("Debts Pending", "Amadeni", "Dettes en cours", "Madeni"),
        "enter_amount_rwf" to locEntry("Amount", "Amafaranga", "Montant", "Kiasi"),
        "item_description_optional" to locEntry("Item description (optional)", "Ibisobanuro (si ngombwa)", "Description (optionnel)", "Maelezo (hiari)"),
        "add_and_checkout" to locEntry("Checkout Now", "Ishyura Ako Kanya", "Encaisser maintenant", "Lipa Sasa Hivi"),
        "add_to_cart_action" to locEntry("Add to Cart", "Shyira mu Gitebo", "Ajouter au panier", "Weka Kikapuni"),

        "banner_db_warning" to locEntry(
            "Database integrity warning detected. Inspect in Settings.",
            "Igenzura ry'ububiko ryabonye ikibazo. Reba mu Igenamiterere.",
            "Alerte d'intégrité de la base de données. Vérifiez les paramètres.",
            "Onyo la uadilifu wa hifadhidata limegunduliwa. Kagua Mipangilio."
        ),
        "banner_clock_rollback" to locEntry(
            "Device clock rollback detected; anti-tamper protection active.",
            "Isaha ya telefoni yasubiye inyuma. Kosora isaha kugira ngo sync ikore.",
            "Recul d'horloge détecté ; protection anti-fraude active.",
            "Saa ya kifaa imerudishwa nyuma; ulinzi wa muda umewashwa."
        ),
        "banner_dead_letter" to locEntry(
            "Sync items paused after retries. Tap Retry to push.",
            "Hari amakuru yananiwe koherezwa kuri cloud. Kanda Ongera.",
            "Éléments de synchronisation en pause. Appuyez sur Réessayer.",
            "Vipengee vya usawazishaji vimesimama. Gusa Jaribu tena."
        ),
        "banner_offline_queue" to locEntry(
            "Offline mode — changes queued safely for auto-sync.",
            "Nta internet — amakuru abitswe neza, azoherezwa nimubona umuyoboro.",
            "Mode hors ligne — modifications enregistrées pour synchronisation auto.",
            "Nje ya mtandao — mabadiliko yamehifadhiwa salama kwa usawazishaji."
        ),

        // =====================================================================
        // BRANCHES & MULTI-STORE
        // =====================================================================
        "branches_title" to locEntry("Branches & Stores", "Amashami n'Ububiko", "Agences & Magasins", "Matawi na Maduka"),
        "manage_branches" to locEntry("Manage Branches", "Cunga Amashami", "Gérer les agences", "Simamia Matawi"),
        "add_branch" to locEntry("Add New Branch", "Ongeraho Ishami", "Nouvelle agence", "Ongeza Tawi Jipya"),
        "branch_name" to locEntry("Branch Name", "Izina ry'Ishami", "Nom de l'agence", "Jina la Tawi"),
        "branch_code" to locEntry("Branch Code", "Kode y'Ishami", "Code agence", "Msimbo wa Tawi"),
        "select_branch" to locEntry("Filter by Branch", "Hitamo Ishami", "Filtrer par agence", "Chuja kwa Tawi"),
        "all_branches" to locEntry("All Branches (Consolidated)", "Amashami Yose Hamwe", "Toutes les agences", "Matawi Yote Pamoja"),
        "main_branch_badge" to locEntry("Main HQ Branch", "Ishami Rikuru", "Siège Principal", "Tawi Kuu"),
        "assigned_branch" to locEntry("Assigned Branch", "Ishami Akoreramo", "Agence assignée", "Tawi Alilopangiwa"),
        "branch_earnings" to locEntry("Branch Earnings", "Inyungu z'Ishami", "Revenus de l'agence", "Mapato ya Tawi"),

        // =====================================================================
        // CLOUD & ADMIN CONSOLE
        // =====================================================================
        "cloud_sync_title" to locEntry("Cloud Sync & Multi-Branch", "Guhuza na Cloud & Amashami", "Synchronisation Cloud", "Usawazishaji wa Wingu"),
        "cloud_live_sync" to locEntry("Live Internet Auto-Sync", "Guhuza amakuru ako kanya", "Sync automatique en direct", "Usawazishaji wa moja kwa moja"),
        "cloud_online" to locEntry("Cloud Online (Live)", "Biri kuri Internet", "Cloud En Ligne", "Wingu Mtandaoni"),
        "cloud_offline" to locEntry("Offline Safe (Queued)", "Bikora Offline", "Hors Ligne (En file)", "Nje ya Mtandao (Salama)"),
        "push_to_cloud" to locEntry("Push All Data to Cloud", "Ohereza Byose kuri Cloud", "Tout envoyer au Cloud", "Tuma Data Zote Wingu"),
        "sync_completed" to locEntry("Cloud Sync Complete", "Byahujwe neza byose", "Synchronisation terminée", "Usawazishaji Umekamilika"),

        "admin_console_title" to locEntry("Master Admin Command Center", "Ikigo cy'Ubuyobozi Mukuru (Admin)", "Centre de Commande Master Admin", "Kituo cha Usimamizi Mkuu"),
        "admin_tab_queue" to locEntry("Payments", "Ubwishyu", "Paiements", "Malipo"),
        "admin_tab_users" to locEntry("Users", "Abakoresha", "Utilisateurs", "Watumiaji"),
        "admin_tab_shops" to locEntry("Shops", "Amaduka", "Boutiques", "Maduka"),
        "admin_tab_issue" to locEntry("Issue Code", "Tanga Kode", "Générer Code", "Toa Msimbo"),
        "admin_tab_codes" to locEntry("Unlock Codes", "Kode zo Gufungura", "Codes d’activation", "Misimbo ya Kufungua"),
        "admin_tab_branches" to locEntry("Branches", "Amashami", "Agences", "Matawi"),
        "admin_tab_audit" to locEntry("Audit & Sec", "Ubugenzuzi", "Audit & Séc", "Ukaguzi"),
        "admin_pick_registered_shop" to locEntry(
            "Quick-Fill from Registered Shop (Auto-binds @username & phone):",
            "Hitamo Ububiko Bwanditse (Buhita buzuza @username & terefone):",
            "Remplissage rapide depuis une boutique enregistrée :",
            "Chagua Duka Lililosajiliwa (Hujaza @username na simu):"
        ),
        "admin_generate_bb2_cta" to locEntry(
            "Generate signed BB3 unlock code",
            "Tanga kode ya BB3 isinywe",
            "Générer un code BB3 signé",
            "Toa msimbo wa BB3 uliotiwa saini"
        ),
        "admin_signin_help" to locEntry(
            "Sign in with an existing BeBoss administrator account. Supabase checks the account's admin role and active Super Admin profile. Account creation and role assignment stay restricted to authorized administrators.",
            "Injira ukoresheje konti isanzwe y'umuyobozi wa BeBoss. Supabase igenzura uruhare rwa admin n'umwirondoro wa Super Admin ukora. Gukora konti no gutanga uburenganzira bigenewe abayobozi babifitiye ububasha.",
            "Connectez-vous avec un compte administrateur BeBoss existant. Supabase vérifie le rôle admin et le profil Super Admin actif. La création de comptes et l’attribution des rôles restent réservées aux administrateurs autorisés.",
            "Ingia kwa akaunti iliyopo ya msimamizi wa BeBoss. Supabase hukagua jukumu la admin na wasifu hai wa Super Admin. Uundaji wa akaunti na ugawaji wa majukumu hubaki kwa wasimamizi walioidhinishwa."
        ),
        "admin_email_label" to locEntry("Administrator email", "Imeyili y'umuyobozi", "E-mail administrateur", "Barua pepe ya msimamizi"),
        "admin_password_label" to locEntry("Administrator password", "Ijambo ry'ibanga ry'umuyobozi", "Mot de passe administrateur", "Nenosiri la msimamizi"),
        "admin_toggle_password_cd" to locEntry("Show or hide password", "Erekana cyangwa uhishe ijambo ry'ibanga", "Afficher ou masquer le mot de passe", "Onyesha au ficha nenosiri"),
        "admin_authenticating" to locEntry("Signing in…", "Kwinjira…", "Connexion…", "Inaingia…"),
        "admin_signin_button" to locEntry("Sign in to Admin Console", "Injira mu buyobozi", "Se connecter à la console admin", "Ingia kwenye dashibodi ya msimamizi"),
        "admin_export_portal" to locEntry("Export Admin Portal HTML", "Sohora dosiye ya Admin Portal HTML", "Exporter le portail admin HTML", "Hamisha HTML ya dashibodi ya msimamizi"),
        "admin_session_fmt" to locEntry("Admin session: %s", "Konti y'umuyobozi: %s", "Session admin : %s", "Kipindi cha msimamizi: %s"),
        "admin_role_verified" to locEntry("Administrator role verified by Supabase", "Uburenganzira bw'umuyobozi bwagenzuwe na Supabase", "Rôle administrateur vérifié par Supabase", "Jukumu la msimamizi limethibitishwa na Supabase"),
        "admin_kpi_pending" to locEntry("Pending", "Bitegereje", "En attente", "Inasubiri"),
        "admin_kpi_queue_rwf" to locEntry("Queue FRw", "Amafaranga ategereje (FRw)", "File d’attente FRw", "Foleni ya FRw"),
        "admin_kpi_paid_active" to locEntry("Paid active", "Amaduka yishyuye akora", "Actives et payantes", "Yanayolipa na yanayotumika"),
        "admin_kpi_mrr" to locEntry("MRR FRw", "Amafaranga y'ukwezi (FRw)", "Revenu mensuel FRw", "Mapato ya mwezi FRw"),
        "admin_kpi_trials" to locEntry("4-day trials", "Igerageza ry'iminsi 4", "Essais de 4 jours", "Majaribio ya siku 4"),
        "admin_kpi_locked" to locEntry("Locked shops", "Amaduka afunze", "Boutiques verrouillées", "Maduka yaliyofungwa"),
        "admin_kpi_bb3_issued" to locEntry("BB3 issued", "BB3 zatanzwe", "BB3 émis", "BB3 zilizotolewa"),
        "admin_tab_devices" to locEntry("Devices", "Ibikoresho", "Appareils", "Vifaa"),
        "admin_tab_pay_config" to locEntry("Payment settings", "Igenamiterere ry'ubwishyu", "Paramètres de paiement", "Mipangilio ya malipo"),
        "admin_queue_search" to locEntry("Search by shop, username, reference or phone", "Shakisha iduka, username, reference cyangwa telefoni", "Rechercher boutique, identifiant, référence ou téléphone", "Tafuta duka, jina la mtumiaji, kumbukumbu au simu"),
        "admin_filter_all" to locEntry("All", "Byose", "Tout", "Zote"),
        "admin_filter_pending" to locEntry("Pending", "Bitegereje", "En attente", "Inasubiri"),
        "admin_filter_approved" to locEntry("Approved", "Byemejwe", "Approuvé", "Yameidhinishwa"),
        "admin_filter_rejected" to locEntry("Rejected", "Byanzwe", "Rejeté", "Yamekataliwa"),
        "admin_batch_approve_fmt" to locEntry("Approve all pending (%d claims)", "Emeza ubusabe bwose butegereje (%d)", "Approuver toutes les demandes en attente (%d)", "Idhinisha madai yote yanayosubiri (%d)"),
        "admin_queue_empty" to locEntry("No payment requests match this filter. Sync all or switch to Issue Code.", "Nta busabe bw'ubwishyu buhuye n'ibyo wahisemo. Huza amakuru cyangwa ujye kuri Tanga Kode.", "Aucune demande ne correspond au filtre. Synchronisez ou passez à Générer un code.", "Hakuna maombi yanayolingana na kichujio. Sawazisha data au nenda Toa Msimbo."),
        "admin_fee_ok" to locEntry("FEE OK", "IGICIRO NI CYO", "MONTANT OK", "ADA SAWA"),
        "admin_fee_check_fmt" to locEntry("CHECK (%d FRw)", "GENZURA (%d FRw)", "VÉRIFIER (%d FRw)", "KAGUA (%d FRw)"),
        "admin_status_auto_unlocked" to locEntry("AUTO-UNLOCKED", "BYAFUNGUTSE", "DÉVERROUILLÉ", "IMEFUNGULIWA"),
        "admin_account_phone_fmt" to locEntry("Account: @%s • Registered phone: %s", "Konti: @%s • Telefoni yanditswe: %s", "Compte : @%s • Téléphone enregistré : %s", "Akaunti: @%s • Simu iliyosajiliwa: %s"),
        "admin_sender_fmt" to locEntry("Payer: %s • Phone: %s", "Uwishyuye: %s • Telefoni: %s", "Payeur : %s • Téléphone : %s", "Mlipaji: %s • Simu: %s"),
        "admin_payment_plan_fmt" to locEntry("%s • %d FRw • %dd • %d branches / %d staff / %d devices", "%s • %d FRw • %d iminsi • amashami %d / abakozi %d / ibikoresho %d", "%s • %d FRw • %d j • %d agences / %d employés / %d appareils", "%s • %d FRw • siku %d • matawi %d / wafanyakazi %d / vifaa %d"),
        "admin_ussd_ref_fmt" to locEntry("USSD: %s • Reference: %s", "USSD: %s • Reference: %s", "USSD : %s • Référence : %s", "USSD: %s • Kumbukumbu: %s"),
        "admin_matched_shop_fmt" to locEntry("Matched shop: %s (%s) • @%s", "Iduka ryabonetse: %s (%s) • @%s", "Boutique correspondante : %s (%s) • @%s", "Duka lililolingana: %s (%s) • @%s"),
        "admin_no_matching_shop_fmt" to locEntry("No matching shop row. Ask the owner to sync or verify @%s / %s.", "Nta duka rihuye n'aya makuru. Saba nyiraryo gukora sync cyangwa ugenzure @%s / %s.", "Aucune boutique correspondante. Demandez au propriétaire de synchroniser ou vérifiez @%s / %s.", "Hakuna duka linalolingana. Mwombe mmiliki asawazishe au hakiki @%s / %s."),
        "admin_reject_payment_title" to locEntry("Reject payment claim", "Anga ubusabe bw'ubwishyu", "Rejeter la demande de paiement", "Kataa dai la malipo"),
        "admin_reject_reason" to locEntry("Rejection reason", "Impamvu yo kwanga", "Motif du rejet", "Sababu ya kukataa"),
        "admin_confirm_reject" to locEntry("Confirm reject", "Emeza kwanga", "Confirmer le rejet", "Thibitisha kukataa"),
        "admin_cancel" to locEntry("Cancel", "Hagarika", "Annuler", "Ghairi"),
        "admin_approve_code" to locEntry("Verify & issue BB3 code", "Genzura utange kode ya BB3", "Vérifier et émettre un code BB3", "Hakiki na utoe msimbo wa BB3"),
        "admin_direct_unlock" to locEntry("Direct auto-unlock", "Fungura ako kanya", "Déverrouillage direct", "Fungua moja kwa moja"),
        "admin_reject" to locEntry("Reject", "Anga", "Rejeter", "Kataa"),
        "admin_copy_code" to locEntry("Copy code", "Koporora kode", "Copier le code", "Nakili msimbo"),
        "admin_send_whatsapp" to locEntry("Send on WhatsApp", "Ohereza kuri WhatsApp", "Envoyer sur WhatsApp", "Tuma kupitia WhatsApp"),
        "admin_code_search" to locEntry("Search BB3 code, username, phone or tier", "Shakisha kode ya BB3, username, telefoni cyangwa urwego", "Rechercher code BB3, identifiant, téléphone ou formule", "Tafuta msimbo wa BB3, jina la mtumiaji, simu au mpango"),
        "admin_no_codes" to locEntry("No unlock codes yet", "Nta kode zo gufungura ziraboneka", "Aucun code d’activation pour le moment", "Hakuna misimbo ya kufungua bado"),
        "admin_manual_issue_title" to locEntry("Issue a code manually", "Tanga kode n'intoki", "Émettre un code manuellement", "Toa msimbo kwa mkono"),
        "admin_live_ussd_preview" to locEntry("LIVE USSD PAYMENT PREVIEW (5,000 FRw)", "UBUSHOBOZI BWA USSD (5.000 FRw)", "APERÇU USSD EN DIRECT (5 000 FRw)", "ONYESHO LA USSD (5,000 FRw)"),
        "admin_save_global_config" to locEntry("Save global configuration to Supabase", "Bika igenamiterere rusange muri Supabase", "Enregistrer la configuration globale dans Supabase", "Hifadhi mipangilio ya jumla kwenye Supabase"),
        "admin_global_config_saved" to locEntry("Global payment and WhatsApp settings saved to Supabase.", "Igenamiterere ry'ubwishyu na WhatsApp ryabitswe muri Supabase.", "Configuration globale de paiement et WhatsApp enregistrée dans Supabase.", "Mipangilio ya malipo na WhatsApp imehifadhiwa Supabase."),
        "admin_global_config_failed" to locEntry("Could not save global payment settings.", "Ntibyashobotse kubika igenamiterere ry'ubwishyu.", "Impossible d’enregistrer la configuration de paiement.", "Imeshindwa kuhifadhi mipangilio ya malipo."),
        "admin_plan_fmt" to locEntry("%s • %d FRw • %dd • %d branches / %d staff / %d devices", "%s • %d FRw • iminsi %d • amashami %d / abakozi %d / ibikoresho %d", "%s • %d FRw • %d j • %d agences / %d employés / %d appareils", "%s • %d FRw • siku %d • matawi %d / wafanyakazi %d / vifaa %d"),
        "admin_matched_status_fmt" to locEntry("Status: %s • %d days left • Quotas: %d branches / %d staff / %d devices • %d FRw/month", "Imimerere: %s • hasigaye iminsi %d • Imipaka: amashami %d / abakozi %d / ibikoresho %d • %d FRw/ukwezi", "Statut : %s • %d jours restants • Quotas : %d agences / %d employés / %d appareils • %d FRw/mois", "Hali: %s • siku %d zimebaki • Vikomo: matawi %d / wafanyakazi %d / vifaa %d • %d FRw/mwezi"),
        "admin_code_fmt" to locEntry("Code: %s", "Kode: %s", "Code : %s", "Msimbo: %s"),
        "admin_direct_unlocked_note" to locEntry("Directly unlocked by admin. No code is required; the app activates on its next sync.", "Umuyobozi yafunguye iduka ako kanya. Nta kode ikenewe; app irifungura kuri sync ikurikira.", "Déverrouillée directement par l’administrateur. Aucun code requis ; l’application s’active à la prochaine synchronisation.", "Limefunguliwa moja kwa moja na msimamizi. Hakuna msimbo unaohitajika; programu itafunguka kwenye usawazishaji ujao."),
        "admin_rejected_fmt" to locEntry("Rejected: %s", "Byanzwe: %s", "Rejeté : %s", "Imekataliwa: %s"),
        "admin_resend_bb3" to locEntry("Re-send BB3", "Ongera wohereze BB3", "Renvoyer BB3", "Tuma BB3 tena"),
        "admin_verify_issue_bb3" to locEntry("Verify & issue BB3", "Genzura utange BB3", "Vérifier et émettre BB3", "Hakiki na utoe BB3"),
        "admin_send_bb3_whatsapp" to locEntry("Send BB3 code on WhatsApp", "Ohereza kode ya BB3 kuri WhatsApp", "Envoyer le code BB3 sur WhatsApp", "Tuma msimbo wa BB3 WhatsApp"),
        "admin_auto_unlock" to locEntry("Auto-unlock", "Fungura ako kanya", "Déverrouillage auto", "Fungua moja kwa moja"),
        "admin_shop_auto_unlocked_fmt" to locEntry("Shop @%s auto-unlocked directly.", "Iduka @%s ryafunguwe ako kanya.", "Boutique @%s déverrouillée directement.", "Duka @%s limefunguliwa moja kwa moja."),
        "admin_not_specified" to locEntry("Not specified", "Ntibyavuzwe", "Non précisé", "Haijatajwa"),
        "admin_manual_proof" to locEntry("WhatsApp proof", "Icyemezo cya WhatsApp", "Preuve WhatsApp", "Uthibitisho wa WhatsApp"),
        "admin_sync_all" to locEntry("Sync All", "Huza byose", "Tout synchroniser", "Sawazisha zote"),
        "admin_manual_username_label" to locEntry("Shop owner username", "Username ya nyir'iduka", "Identifiant du propriétaire", "Jina la mtumiaji la mmiliki"),
        "admin_manual_username_placeholder" to locEntry("e.g. jeanpaul", "urugero: jeanpaul", "ex. jeanpaul", "mf. jeanpaul"),
        "admin_manual_phone_label" to locEntry("Registered owner phone", "Telefoni ya nyir'iduka", "Téléphone du propriétaire", "Simu ya mmiliki aliyesajiliwa"),
        "admin_manual_phone_placeholder" to locEntry("+250 788 123 456", "+250 788 123 456", "+250 788 123 456", "+250 788 123 456"),
        "admin_tier_single" to locEntry("Single", "Iduka rimwe", "Simple", "Duka moja"),
        "admin_tier_dual" to locEntry("Dual", "Amaduka abiri", "Double", "Maduka mawili"),
        "admin_tier_multi" to locEntry("Multi", "Amaduka menshi", "Multi", "Maduka mengi"),
        "admin_tier_annual" to locEntry("Annual", "Umwaka", "Annuel", "Mwaka"),
        "admin_days_label" to locEntry("Days", "Iminsi", "Jours", "Siku"),
        "admin_amount_label" to locEntry("Amount (FRw)", "Amafaranga (FRw)", "Montant (FRw)", "Kiasi (FRw)"),
        "admin_binding_ready" to locEntry("Cryptographic account binding ready", "Konti ihujwe mu buryo bw'umutekano", "Liaison cryptographique du compte prête", "Ufungamanisho salama wa akaunti uko tayari"),
        "admin_code_status_all" to locEntry("All", "Byose", "Tout", "Zote"),
        "admin_code_status_issued" to locEntry("Issued", "Byatanzwe", "Émis", "Imetolewa"),
        "admin_code_status_redeemed" to locEntry("Redeemed", "Byakoreshejwe", "Utilisés", "Imetumika"),
        "admin_code_status_revoked" to locEntry("Revoked", "Byahagaritswe", "Révoqués", "Imebatilishwa"),
        "admin_code_status_fmt" to locEntry("%s • %dd • %d FRw • %s", "%s • iminsi %d • %d FRw • %s", "%s • %d j • %d FRw • %s", "%s • siku %d • %d FRw • %s"),
        "admin_issue_code" to locEntry("Issue code", "Tanga kode", "Émettre un code", "Toa msimbo"),
        "admin_revoke_code_cd" to locEntry("Revoke unlock code", "Hagarika kode yo gufungura", "Révoquer le code d’activation", "Batilisha msimbo wa kufungua"),
        "admin_issue_code" to locEntry("Issue Code", "Tanga kode", "Générer un code", "Toa msimbo"),
        "shop_devices_title" to locEntry(
            "Shop Devices",
            "Telefoni z'Ububiko",
            "Appareils Boutique",
            "Vifaa vya Duka"
        ),
        "add_shop_device" to locEntry(
            "Add Device (+2,000 FRw/mo)",
            "Ongeraho Telefoni (+2,000 FRw/ukwezi)",
            "Ajouter Appareil (+2 000 FRw/mois)",
            "Ongeza Kifaa (+2,000 FRw/mwezi)"
        ),
        "join_existing_shop" to locEntry(
            "Join Existing Shop",
            "Injira mu Duka Ririho",
            "Rejoindre Boutique",
            "Jiunge na Duka"
        ),
        "create_new_shop" to locEntry(
            "Create New Shop",
            "Fungura Duka Rishya",
            "Créer Nouvelle Boutique",
            "Unda Duka Jipya"
        ),
        "device_join_code" to locEntry(
            "Device Join Code",
            "Kode yo Kwinjira",
            "Code d'Appairage",
            "Msimbo wa Kujiunga"
        ),
        "device_fee_addon_note" to locEntry(
            "1st owner device is included free. Each extra paired device with a user adds 2,000 FRw/month and auto-syncs all shop data.",
            "Telefoni ya mbere y'umuyobozi iri mu ifatabuguzi. Buri telefoni nshya n'umukozi yongeraho 2,000 FRw/ukwezi kandi ihuza amakuru yose.",
            "Le 1er appareil propriétaire est inclus. Chaque appareil supplémentaire avec utilisateur ajoute 2 000 FRw/mois avec synchronisation auto.",
            "Kifaa cha kwanza cha mmiliki kimejumuishwa. Kila kifaa cha ziada na mtumiaji huongeza 2,000 FRw/mwezi na kusawazisha data zote."
        ),
        "payer_full_name_label" to locEntry(
            "Full Names on Sender Phone (MoMo/Airtel) *",
            "Amazina Yuzuye ku Murongo Wohereje Amafaranga *",
            "Nom Complet sur le Numéro Payeur *",
            "Majina Kamili Kwenye Namba Iliyotuma *"
        ),
        "direct_auto_unlock_badge" to locEntry(
            "Auto-Unlocked Directly by Admin (No Code Needed)",
            "Yafunguwe na Admin Ako Kanya (Nta Kode Ikenewe)",
            "Déverrouillé Directement par Admin (Sans Code)",
            "Imefunguliwa Moja kwa Moja na Msimamizi (Bila Msimbo)"
        ),
        "admin_whatsapp_label" to locEntry(
            "Admin WhatsApp Number",
            "Nimero ya WhatsApp ya Admin",
            "Numéro WhatsApp Admin",
            "Namba ya WhatsApp ya Msimamizi"
        ),
        "mtn_ussd_config_label" to locEntry(
            "MTN MoMo Merchant Code & Phone (*182#)",
            "Kode ya MTN MoMo & Nimero (*182#)",
            "Code Marchand MTN MoMo & Tél (*182#)",
            "Msimbo wa MTN MoMo na Simu (*182#)"
        ),
        "airtel_ussd_config_label" to locEntry(
            "Airtel Money Phone (*500#)",
            "Nimero ya Airtel Money (*500#)",
            "Numéro Airtel Money (*500#)",
            "Namba ya Airtel Money (*500#)"
        ),
        "admin_tab_devices" to locEntry(
            "Devices",
            "Telefoni",
            "Appareils",
            "Vifaa"
        ),
        "admin_tab_payconfig" to locEntry(
            "Pay Config",
            "Igenamiterere USSD",
            "Config Paiement",
            "Mipangilio Malipo"
        )
    )

    private val translations: Map<String, Map<AppLanguage, String>> =
        baseTranslations + LocalizationScreens.entries + LocalizationDialogs.entries + LocalizationAdminOps.entries

    fun allKeys(): Set<String> = translations.keys

    fun hasTranslation(key: String, language: AppLanguage): Boolean {
        return !translations[key]?.get(language).isNullOrBlank()
    }

    fun get(key: String, language: AppLanguage): String {
        return translations[key]?.get(language) ?: translations[key]?.get(AppLanguage.ENGLISH) ?: key
    }

    fun format(key: String, language: AppLanguage, vararg args: Any?): String {
        val pattern = get(key, language)
        return try {
            String.format(Locale.US, pattern, *args)
        } catch (_: Throwable) {
            pattern
        }
    }

    fun pick(language: AppLanguage, en: String, rw: String, fr: String, sw: String): String {
        return when (language) {
            AppLanguage.ENGLISH -> en
            AppLanguage.KINYARWANDA -> rw
            AppLanguage.FRENCH -> fr
            AppLanguage.SWAHILI -> sw
        }
    }

    fun paymentMethodLabel(method: String, language: AppLanguage): String {
        return when (method.trim().uppercase(Locale.US)) {
            "CASH" -> get("cash", language)
            "MOMO", "MTN MOMO" -> get("momo", language)
            "AIRTEL", "AIRTEL MONEY" -> get("airtel", language)
            "CARD", "BANK CARD" -> get("card", language)
            "SPLIT" -> get("split_payment", language)
            "DEBT", "CREDIT", "CREDIT_DEBT" -> get("credit_debt", language)
            else -> method
        }
    }

    fun paymentStatusLabel(status: String, language: AppLanguage): String {
        return when (status.trim().uppercase(Locale.US)) {
            "PAID" -> get("pur_status_paid", language)
            "CREDIT" -> get("pur_status_credit", language)
            "PARTIAL" -> get("pur_status_partial", language)
            else -> status
        }
    }

    fun analyticsPeriodLabel(period: AnalyticsPeriod, language: AppLanguage): String {
        return when (period) {
            AnalyticsPeriod.TODAY -> get("period_today", language)
            AnalyticsPeriod.THIS_WEEK -> get("period_this_week", language)
            AnalyticsPeriod.THIS_MONTH -> get("period_this_month", language)
            AnalyticsPeriod.ALL_TIME -> get("period_all_time", language)
        }
    }

    fun userRoleLabel(role: UserRole, language: AppLanguage): String {
        return when (role) {
            UserRole.OWNER -> get("role_owner_full", language)
            UserRole.MANAGER -> get("role_manager_full", language)
            UserRole.CASHIER -> get("role_cashier_full", language)
        }
    }

    fun customerCategoryLabel(category: String, language: AppLanguage): String {
        return when (category) {
            "Regular Customer" -> get("cust_cat_regular", language)
            "Wholesaler / Trader" -> get("cust_cat_wholesale", language)
            "VIP Credit Partner" -> get("cust_cat_vip", language)
            "Walk-in Shopper" -> get("cust_cat_retail", language)
            else -> category
        }
    }
}
